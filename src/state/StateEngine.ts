import { applyPhysicalChange, type PhysicalChange } from "./physicalContinuity";
import { EventLog } from "@events/EventLog";
import { resolveAuthority, type AuthoritySource } from "./AuthorityResolver";
import { resolveLockChange } from "./LockManager";
import { isStale, nextVersion } from "./StateVersioning";
import {
  DEFAULT_MAX_REPLY_TOKENS,
  type Session,
  type LockState,
  ConversationTurnSchema,
  type ConversationTurn,
  LayerSchema,
  type Layer,
  type LayerType,
  MemoryEntrySchema,
  type MemoryType
} from "./StateSchema";
import { mustForceInactiveOnAdd, resolveLayerActivationChange, shouldBlockLayerActivation, shouldDiscardAiLayerProposal } from "@layers/LayerPolicy";
import { deepFreeze } from "./deepFreeze";
import { isUngroundedPlace, collapsesNamedRoomToVenue } from "./WorldCanon";
import { clampAiStatValue, parseStatPath } from "./statShift";
import { attributeRange } from "./traitBands";
import { clipHandoff } from "./sceneHandoff";
import { sessionWhatNowSets } from "./whatNowGate";
import { roomIdForDest, roomIdsNamedInText } from "./roomGate";
import { nextFlagsAfterClear, nextFlagsAfterSet } from "./storyFlags";
import { nextPartyAfterLeave, nextPartyAfterPlayerText, nextPendingAfterOffer, nextPendingAfterIds, idsFromOfferValue, canAcceptParty, holdingPartyIds } from "./party";
import { applyLandmarkTravel, type LandmarkTravelPatch } from "./landmarkTravel";

export interface MutationProposal {
  /** Dot-path into the character's field, e.g. "characters.emma.mood" */
  path: string;
  value: unknown;
  source: AuthoritySource;
  /** The state_version the proposer believes is current. */
  expectedStateVersion: number;
}

export type MutationResult =
  | { committed: true; newStateVersion: number }
  | { committed: false; reason: string };

/**
 * Event types that represent a reversible state change. "turn_committed"
 * (logged by SessionEngine) and "mutation_undone" (logged by undo
 * itself) are deliberately excluded — they're markers, not mutations,
 * so undo skips past them when walking backward through the log.
 */
export const UNDOABLE_EVENT_TYPES = new Set([
  "state_mutation_committed",
  "physical_state_changed",
  "lock_state_changed",
  "conversation_turn_appended",
  "conversation_turn_edited",
  "layer_added",
  "layer_activation_changed",
  "layer_keywords_changed",
  "layer_spent",
  "layer_removed",
  "layers_compacted",
  "memory_entry_added"
]);

/**
 * State Engine — Master Spec §5, §6, §8.
 * The authoritative source of current world/character/relationship state.
 * Nothing outside this class may write to `session` directly (§51 invariant 16:
 * "UI får inte direkt mutera kanoniskt state utan att gå genom State Engine").
 */
export class StateEngine {
  constructor(
    private session: Session,
    private eventLog: EventLog
  ) {}

  /**
   * Returns a read-only snapshot of the session. This is a frozen clone,
   * not a live reference — mutating anything on it throws (invariant #16,
   * §51). External code, including the UI, must go through
   * proposeMutation()/proposeLockChange() to change anything.
   */
  getSession(): Readonly<Session> {
    return deepFreeze(structuredClone(this.session));
  }

  /**
   * Direct access to the underlying event log. Used by SessionEngine to
   * capture exactly which event ids a turn produced (for Regenerate,
   * §31) — reading the log this way, rather than SessionEngine keeping
   * its own separate one, is what guarantees the ids line up with what
   * StateEngine itself actually logged.
   */
  getEventLog(): EventLog {
    return this.eventLog;
  }

  /**
   * Runs a single mutation through the full validation pipeline.
   * Each stage can reject; rejection short-circuits and nothing is committed.
   */
  proposeMutation(proposal: MutationProposal): MutationResult {
    if (proposal.path === "physical.change") {
      if (isStale(proposal.expectedStateVersion, this.session.stateVersion))
        return { committed: false, reason: "Stale physical state proposal." };
      if (proposal.source !== "ai_approved_state_mutation" && proposal.source !== "player_manual_state" && proposal.source !== "immutable_system_constraint")
        return { committed: false, reason: "Unauthorized physical state proposal." };
      let change: PhysicalChange;
      try {
        if (typeof proposal.value !== "string") throw new Error("Expected JSON string");
        change = JSON.parse(proposal.value) as PhysicalChange;
        if (!change || !["stance", "set_relation", "remove_relation"].includes(change.kind))
          throw new Error("Unknown change");
      } catch {
        return { committed: false, reason: "Invalid physical change JSON." };
      }
      const previousState = structuredClone(this.session.physical);
      let result: ReturnType<typeof applyPhysicalChange>;
      try { result = applyPhysicalChange(previousState, change); }
      catch { return { committed: false, reason: "Malformed physical change." }; }
      if (!result.ok) return { committed: false, reason: result.reason };
      this.session.physical = result.state;
      this.session.stateVersion = nextVersion(this.session.stateVersion);
      this.eventLog.append({
        turn: this.session.stateVersion,
        timestamp: new Date().toISOString(),
        type: "physical_state_changed",
        payload: { previousState, change, source: proposal.source }
      });
      return { committed: true, newStateVersion: this.session.stateVersion };
    }

    // 1. Target/Type Validation — does the path resolve to a lockable field?
    const target = this.resolveLockableTarget(proposal.path);
    if (!target) {
      return { committed: false, reason: `Unknown or non-lockable target path: ${proposal.path}` };
    }

    let value = coerceMutationValue(proposal.path, proposal.value, this.session);
    if (value === undefined) {
      return { committed: false, reason: `Invalid value for ${proposal.path}.` };
    }

    const statPath = parseStatPath(proposal.path);
    if (statPath && typeof value === "number") {
      const def = this.session.ruleset?.attributes.find((item) => item.id === statPath.statId);
      const current = Number(target.field.value);
      if (!Number.isFinite(current)) {
        return { committed: false, reason: `No live number for ${proposal.path}.` };
      }
      const ai =
        proposal.source === "ai_approved_state_mutation" || proposal.source === "ai_inference";
      if (ai) {
        const cap = def?.kind === "number" ? (def.maxShift ?? 0) : 0;
        if (cap <= 0) {
          return { committed: false, reason: `${proposal.path} does not move in play.` };
        }
        value = clampAiStatValue(current, value, def ?? { maxShift: cap });
      } else {
        const { min, max } = attributeRange(def ?? {});
        value = Math.max(min, Math.min(max, Math.round(value)));
      }
    }

    if (
      proposal.path.endsWith(".position") &&
      typeof value === "string" &&
      (proposal.source === "ai_approved_state_mutation" || proposal.source === "ai_inference")
    ) {
      if (isUngroundedPlace(value, this.session)) {
        return {
          committed: false,
          reason: `Cannot invent a place that is not in the scene, story, or active place notes: ${value}`
        };
      }
      const current = typeof target.field.value === "string" ? target.field.value : "";
      if (collapsesNamedRoomToVenue(value, current, this.session)) {
        return {
          committed: false,
          reason: `Cannot replace a named room with the venue or bar: ${value}`
        };
      }
    }

    // 2. Authority / Lock Validation
    const authority = resolveAuthority({ source: proposal.source, fieldLock: target.lock });
    if (!authority.allowed) {
      return { committed: false, reason: authority.reason };
    }

    // 3. State Version Check — reject stale proposals (concurrency, §47)
    if (isStale(proposal.expectedStateVersion, this.session.stateVersion)) {
      return {
        committed: false,
        reason: `Stale state version: proposal expected ${proposal.expectedStateVersion}, current is ${this.session.stateVersion}.`
      };
    }

    // 4. Commit
    const previousValue = target.field.value;
    target.container[target.key] = { ...target.field, value };
    this.session.stateVersion = nextVersion(this.session.stateVersion);

    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "state_mutation_committed",
      payload: { path: proposal.path, value, previousValue, source: proposal.source }
    });

    return { committed: true, newStateVersion: this.session.stateVersion };
  }

  /**
   * Changes a field's lock (e.g. player locking "mood" to protect it from
   * AI mutation). This is a distinct, more privileged operation from
   * proposeMutation and is routed through LockManager, not AuthorityResolver
   * (§7). Also version-checked and event-logged, same as a value mutation.
   */
  proposeLockChange(params: {
    path: string;
    requestedLock: LockState;
    source: AuthoritySource;
    expectedStateVersion: number;
  }): MutationResult {
    const target = this.resolveLockableTarget(params.path);
    if (!target) {
      return { committed: false, reason: `Unknown or non-lockable target path: ${params.path}` };
    }

    const decision = resolveLockChange({
      currentLock: target.lock,
      requestedLock: params.requestedLock,
      requestedBy: params.source
    });
    if (!decision.allowed) {
      return { committed: false, reason: decision.reason };
    }

    if (isStale(params.expectedStateVersion, this.session.stateVersion)) {
      return {
        committed: false,
        reason: `Stale state version: proposal expected ${params.expectedStateVersion}, current is ${this.session.stateVersion}.`
      };
    }

    target.container[target.key] = { ...target.field, lock: params.requestedLock };
    this.session.stateVersion = nextVersion(this.session.stateVersion);

    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "lock_state_changed",
      payload: {
        path: params.path,
        newLock: params.requestedLock,
        previousLock: target.lock,
        source: params.source
      }
    });

    return { committed: true, newStateVersion: this.session.stateVersion };
  }

  /**
   * Appends one turn to the conversation history. This goes through the
   * same version-checked, event-logged path as any other state change
   * (invariant #16, §51) — conversation history is canonical state, not
   * something SessionEngine or the UI may splice in directly.
   */
  appendConversationTurn(
    entry: Omit<ConversationTurn, "turn">,
    expectedStateVersion: number
  ): MutationResult {
    if (isStale(expectedStateVersion, this.session.stateVersion)) {
      return {
        committed: false,
        reason: `Stale state version: proposal expected ${expectedStateVersion}, current is ${this.session.stateVersion}.`
      };
    }

    const turnNumber = nextVersion(this.session.stateVersion);
    const fullEntry = ConversationTurnSchema.parse({ ...entry, turn: turnNumber });

    this.session.conversation = [...this.session.conversation, fullEntry];
    this.session.stateVersion = turnNumber;

    this.eventLog.append({
      turn: turnNumber,
      timestamp: new Date().toISOString(),
      type: "conversation_turn_appended",
      payload: fullEntry
    });

    return { committed: true, newStateVersion: turnNumber };
  }

  /**
   * Edits the text of an existing conversation turn in place — a manual
   * correction (fix a typo, rephrase a line), not a branch or rewind.
   * Nothing downstream is automatically regenerated; that's a
   * deliberately separate, much larger feature this does not attempt.
   * Same privilege level as lock/layer-activation changes: AI can never
   * edit dialogue, including its own — only a player or the system's
   * explicit control flow.
   */
  editConversationTurn(
    turnNumber: number,
    newContent: string,
    source: AuthoritySource,
    expectedStateVersion: number
  ): MutationResult {
    const isAiSource = source === "ai_approved_state_mutation" || source === "ai_inference";
    if (isAiSource) {
      return { committed: false, reason: "AI-sourced requests can never edit dialogue." };
    }

    if (isStale(expectedStateVersion, this.session.stateVersion)) {
      return {
        committed: false,
        reason: `Stale state version: proposal expected ${expectedStateVersion}, current is ${this.session.stateVersion}.`
      };
    }

    const existing = this.session.conversation.find(
      (t) => (t as unknown as ConversationTurn).turn === turnNumber
    ) as ConversationTurn | undefined;
    if (!existing) {
      return { committed: false, reason: `No conversation turn found with turn number ${turnNumber}.` };
    }

    const previousContent = existing.content;
    this.session.conversation = this.session.conversation.map((t) =>
      (t as unknown as ConversationTurn).turn === turnNumber ? { ...(t as ConversationTurn), content: newContent } : t
    );
    const newVersion = nextVersion(this.session.stateVersion);
    this.session.stateVersion = newVersion;

    this.eventLog.append({
      turn: newVersion,
      timestamp: new Date().toISOString(),
      type: "conversation_turn_edited",
      payload: { turn: turnNumber, newContent, previousContent, source }
    });

    return { committed: true, newStateVersion: newVersion };
  }

  /**
   * Adds a new layer. Allowed from any authority source — a layer is
   * just proposed content until it's active — except AI environment
   * notes that invent rooms or creatures not in canon (discarded, not queued).
   * If the source is AI-derived, a layer that does pass is force-created
   * inactive regardless of what was requested (§14-15, LayerPolicy).
   */
  addLayer(
    layer: {
      type: LayerType;
      priority: number;
      content: string;
      trigger?: string;
      keywords?: string[];
      once?: boolean;
      spent?: boolean;
      active?: boolean;
    },
    source: AuthoritySource,
    expectedStateVersion: number
  ): MutationResult {
    if (isStale(expectedStateVersion, this.session.stateVersion)) {
      return {
        committed: false,
        reason: `Stale state version: proposal expected ${expectedStateVersion}, current is ${this.session.stateVersion}.`
      };
    }

    const discard = shouldDiscardAiLayerProposal(source, layer, this.session);
    if (discard.discard) {
      return { committed: false, reason: discard.reason };
    }

    const forceInactive = mustForceInactiveOnAdd(source);
    const newLayer: Layer = LayerSchema.parse({
      id: crypto.randomUUID(),
      type: layer.type,
      priority: layer.priority,
      content: layer.content,
      trigger: layer.trigger,
      keywords: layer.keywords ?? [],
      ...(layer.once ? { once: true } : {}),
      ...(layer.spent ? { spent: true } : {}),
      active: forceInactive ? false : (layer.active ?? false),
      aiGenerated: forceInactive
    });

    this.session.layers = [...this.session.layers, newLayer];
    const newVersion = nextVersion(this.session.stateVersion);
    this.session.stateVersion = newVersion;

    this.eventLog.append({
      turn: newVersion,
      timestamp: new Date().toISOString(),
      type: "layer_added",
      payload: { layer: newLayer, source }
    });

    return { committed: true, newStateVersion: newVersion };
  }

  /**
   * Toggles a layer's active state. Privileged operation (§14-15): AI
   * sources are always rejected here, even for a layer the AI itself
   * added — only a player or the system's explicit control flow may
   * make a layer actually take effect.
   */
  setLayerActive(
    layerId: string,
    active: boolean,
    source: AuthoritySource,
    expectedStateVersion: number
  ): MutationResult {
    const decision = resolveLayerActivationChange(source);
    if (!decision.allowed) {
      return { committed: false, reason: decision.reason };
    }

    if (isStale(expectedStateVersion, this.session.stateVersion)) {
      return {
        committed: false,
        reason: `Stale state version: proposal expected ${expectedStateVersion}, current is ${this.session.stateVersion}.`
      };
    }

    const exists = this.session.layers.some((l) => l.id === layerId);
    if (!exists) {
      return { committed: false, reason: `Unknown layer id: ${layerId}` };
    }

    const target = this.session.layers.find((l) => l.id === layerId)!;
    if (active) {
      const blocked = shouldBlockLayerActivation(target, this.session);
      if (blocked.discard) {
        return { committed: false, reason: blocked.reason };
      }
    }

    const previousActive = target.active;
    this.session.layers = this.session.layers.map((l) => (l.id === layerId ? { ...l, active } : l));
    const newVersion = nextVersion(this.session.stateVersion);
    this.session.stateVersion = newVersion;

    this.eventLog.append({
      turn: newVersion,
      timestamp: new Date().toISOString(),
      type: "layer_activation_changed",
      payload: { layerId, active, previousActive, source }
    });

    return { committed: true, newStateVersion: newVersion };
  }

  /**
   * Player-only: set the keyword list on a layer. Empty list = always on
   * when the layer is active (no gate).
   */
  setLayerKeywords(
    layerId: string,
    keywords: string[],
    source: AuthoritySource,
    expectedStateVersion: number
  ): MutationResult {
    const decision = resolveLayerActivationChange(source);
    if (!decision.allowed) {
      return { committed: false, reason: decision.reason };
    }

    if (isStale(expectedStateVersion, this.session.stateVersion)) {
      return {
        committed: false,
        reason: `Stale state version: proposal expected ${expectedStateVersion}, current is ${this.session.stateVersion}.`
      };
    }

    const layer = this.session.layers.find((item) => item.id === layerId);
    if (!layer) {
      return { committed: false, reason: `Unknown layer id: ${layerId}` };
    }

    const previousKeywords = [...(layer.keywords ?? [])];
    const nextKeywords = LayerSchema.shape.keywords.parse(keywords);
    this.session.layers = this.session.layers.map((item) =>
      item.id === layerId ? { ...item, keywords: nextKeywords } : item
    );
    const newVersion = nextVersion(this.session.stateVersion);
    this.session.stateVersion = newVersion;

    this.eventLog.append({
      turn: newVersion,
      timestamp: new Date().toISOString(),
      type: "layer_keywords_changed",
      payload: { layerId, keywords: nextKeywords, previousKeywords, source }
    });

    return { committed: true, newStateVersion: newVersion };
  }

  /**
   * Marks an once-layer spent after it has been in play for a turn.
   * Player/system only — the AI cannot retire a beat.
   */
  markLayerSpent(
    layerId: string,
    source: AuthoritySource,
    expectedStateVersion: number
  ): MutationResult {
    const decision = resolveLayerActivationChange(source);
    if (!decision.allowed) {
      return { committed: false, reason: decision.reason };
    }

    if (isStale(expectedStateVersion, this.session.stateVersion)) {
      return {
        committed: false,
        reason: `Stale state version: proposal expected ${expectedStateVersion}, current is ${this.session.stateVersion}.`
      };
    }

    const layer = this.session.layers.find((item) => item.id === layerId);
    if (!layer) {
      return { committed: false, reason: `Unknown layer id: ${layerId}` };
    }
    if (layer.spent) {
      return { committed: true, newStateVersion: this.session.stateVersion };
    }

    this.session.layers = this.session.layers.map((item) =>
      item.id === layerId ? { ...item, spent: true, active: false } : item
    );
    const newVersion = nextVersion(this.session.stateVersion);
    this.session.stateVersion = newVersion;

    this.eventLog.append({
      turn: newVersion,
      timestamp: new Date().toISOString(),
      type: "layer_spent",
      payload: { layerId, previousActive: layer.active, source }
    });

    return { committed: true, newStateVersion: newVersion };
  }

  /**
   * Removes a layer permanently — e.g. a player rejecting an
   * AI-proposed layer during review. Same privilege level as
   * activation changes: AI sources can never remove a layer, including
   * one they proposed themselves. Undoable, same as every other
   * mutation here — the removed layer's full record is captured in the
   * event so undo can restore it exactly.
   */
  removeLayer(layerId: string, source: AuthoritySource, expectedStateVersion: number): MutationResult {
    const decision = resolveLayerActivationChange(source);
    if (!decision.allowed) {
      return { committed: false, reason: decision.reason };
    }

    if (isStale(expectedStateVersion, this.session.stateVersion)) {
      return {
        committed: false,
        reason: `Stale state version: proposal expected ${expectedStateVersion}, current is ${this.session.stateVersion}.`
      };
    }

    const layer = this.session.layers.find((l) => l.id === layerId);
    if (!layer) {
      return { committed: false, reason: `Unknown layer id: ${layerId}` };
    }

    this.session.layers = this.session.layers.filter((l) => l.id !== layerId);
    const newVersion = nextVersion(this.session.stateVersion);
    this.session.stateVersion = newVersion;

    this.eventLog.append({
      turn: newVersion,
      timestamp: new Date().toISOString(),
      type: "layer_removed",
      payload: { layer, source }
    });

    return { committed: true, newStateVersion: newVersion };
  }

  /**
   * Player-triggered compaction: drop the source layers and insert the
   * compact replacements in one undoable mutation. AI sources are
   * rejected — rewriting standing behavior is a player action.
   */
  compactReplaceLayers(
    removeIds: string[],
    replacements: Array<{
      type: LayerType;
      content: string;
      active: boolean;
      aiGenerated: boolean;
      priority: number;
      keywords?: string[];
    }>,
    source: AuthoritySource,
    expectedStateVersion: number
  ): MutationResult {
    const decision = resolveLayerActivationChange(source);
    if (!decision.allowed) {
      return { committed: false, reason: decision.reason };
    }

    if (isStale(expectedStateVersion, this.session.stateVersion)) {
      return {
        committed: false,
        reason: `Stale state version: proposal expected ${expectedStateVersion}, current is ${this.session.stateVersion}.`
      };
    }

    if (removeIds.length < 2 || replacements.length === 0) {
      return { committed: false, reason: "Compaction needs at least two source layers and one replacement." };
    }

    const removed: Layer[] = [];
    for (const id of removeIds) {
      const layer = this.session.layers.find((item) => item.id === id);
      if (!layer) return { committed: false, reason: `Unknown layer id: ${id}` };
      removed.push(layer);
    }

    const added = replacements.map((item) =>
      LayerSchema.parse({
        id: crypto.randomUUID(),
        type: item.type,
        priority: item.priority,
        content: item.content,
        active: item.active,
        aiGenerated: item.aiGenerated,
        keywords: item.keywords ?? []
      })
    );

    const removeSet = new Set(removeIds);
    this.session.layers = [...this.session.layers.filter((layer) => !removeSet.has(layer.id)), ...added];
    const newVersion = nextVersion(this.session.stateVersion);
    this.session.stateVersion = newVersion;

    this.eventLog.append({
      turn: newVersion,
      timestamp: new Date().toISOString(),
      type: "layers_compacted",
      payload: { removed, added, source }
    });

    return { committed: true, newStateVersion: newVersion };
  }

  /**
   * Appends a memory entry (§16-19). Like conversation history, memory
   * is canonical state and goes through the same validated,
   * event-logged path rather than being spliced in directly.
   */
  addMemoryEntry(
    type: MemoryType,
    entry: { content: string; importance: number; createdAtTurn?: number },
    expectedStateVersion: number
  ): MutationResult {
    if (isStale(expectedStateVersion, this.session.stateVersion)) {
      return {
        committed: false,
        reason: `Stale state version: proposal expected ${expectedStateVersion}, current is ${this.session.stateVersion}.`
      };
    }

    const fullEntry = MemoryEntrySchema.parse({
      id: crypto.randomUUID(),
      createdAtTurn: entry.createdAtTurn ?? this.session.stateVersion,
      importance: entry.importance,
      content: entry.content
    });

    this.session.memory = {
      ...this.session.memory,
      [type]: [...this.session.memory[type], fullEntry]
    };
    const newVersion = nextVersion(this.session.stateVersion);
    this.session.stateVersion = newVersion;

    this.eventLog.append({
      turn: newVersion,
      timestamp: new Date().toISOString(),
      type: "memory_entry_added",
      payload: { memoryType: type, entry: fullEntry }
    });

    return { committed: true, newStateVersion: newVersion };
  }

  /**
   * Undo — §31. Reverses the most recent undoable mutation using the
   * data captured in its own event (previousValue/previousLock/
   * previousActive, or the added record itself for pure additions).
   * This is itself a new commit, not a history rewrite: it advances
   * the state version and logs a "mutation_undone" event referencing
   * the original, rather than deleting or rolling back the event log.
   * Repeated calls walk further back one undoable event at a time.
   *
   * Privileged like lock/layer-activation changes: AI sources can never
   * trigger undo — it's a player/system recovery action, not something
   * the AI proposes or approves.
   */
  undoLastMutation(source: AuthoritySource, expectedStateVersion: number): MutationResult {
    const isAiSource = source === "ai_approved_state_mutation" || source === "ai_inference";
    if (isAiSource) {
      return { committed: false, reason: "AI-sourced requests can never trigger undo." };
    }

    if (isStale(expectedStateVersion, this.session.stateVersion)) {
      return {
        committed: false,
        reason: `Stale state version: proposal expected ${expectedStateVersion}, current is ${this.session.stateVersion}.`
      };
    }

    const target = this.findUndoableEvent();
    if (!target) {
      return { committed: false, reason: "No undoable mutation found in the event log." };
    }

    const outcome = this.applyUndo(target, source);
    if (!outcome.committed) {
      return outcome;
    }

    return { committed: true, newStateVersion: this.session.stateVersion };
  }

  /**
   * Undoes a specific set of events — e.g. everything a single turn
   * produced (Pass 2 mutations + the character's reply), without
   * touching the player's message that preceded them. Used by
   * SessionEngine's Regenerate feature (§31). `eventIds` should be
   * given in the order they were originally created; they're reversed
   * newest-first internally, same as a manual chain of individual
   * undos would be.
   *
   * All-or-nothing at the point of failure: if an event partway through
   * the batch can't be reversed (e.g. its target no longer resolves),
   * everything reversed *before* that point stays reversed — this
   * method does not roll back its own partial progress — but nothing
   * after the failure is attempted, and the caller (SessionEngine) is
   * expected to treat any failure here as fatal to whatever redo it was
   * about to attempt, rather than proceeding on inconsistent state.
   */
  undoEvents(eventIds: string[], source: AuthoritySource, expectedStateVersion: number): MutationResult {
    const isAiSource = source === "ai_approved_state_mutation" || source === "ai_inference";
    if (isAiSource) {
      return { committed: false, reason: "AI-sourced requests can never trigger undo." };
    }

    if (isStale(expectedStateVersion, this.session.stateVersion)) {
      return {
        committed: false,
        reason: `Stale state version: proposal expected ${expectedStateVersion}, current is ${this.session.stateVersion}.`
      };
    }

    for (let i = eventIds.length - 1; i >= 0; i--) {
      const eventId = eventIds[i]!;
      const event = this.eventLog.findById(eventId);
      if (!event) {
        return { committed: false, reason: `Cannot undo: event ${eventId} not found in the log.` };
      }
      const outcome = this.applyUndo(event, source);
      if (!outcome.committed) {
        return outcome;
      }
    }

    return { committed: true, newStateVersion: this.session.stateVersion };
  }

  /** Scans backward for the most recent undoable event not already covered by a prior undo. */
  private findUndoableEvent(): ReturnType<EventLog["all"]>[number] | undefined {
    const events = this.eventLog.all();
    const alreadyUndone = new Set<string>();
    for (const e of events) {
      if (e.type === "mutation_undone") {
        const undoneId = (e.payload as { undoneEventId?: string } | undefined)?.undoneEventId;
        if (undoneId) alreadyUndone.add(undoneId);
      }
    }
    for (let i = events.length - 1; i >= 0; i--) {
      const candidate = events[i]!;
      if (UNDOABLE_EVENT_TYPES.has(candidate.type) && !alreadyUndone.has(candidate.id)) {
        return candidate;
      }
    }
    return undefined;
  }

  /** Reverses one event's effect, bumps the version, and logs the mutation_undone marker. Shared by both public undo entry points. */
  private applyUndo(
    target: { id: string; type: string; payload?: unknown },
    source: AuthoritySource
  ): MutationResult {
    const applied = this.reverseEvent(target);
    if (!applied.ok) {
      return { committed: false, reason: applied.reason };
    }

    const newVersion = nextVersion(this.session.stateVersion);
    this.session.stateVersion = newVersion;

    this.eventLog.append({
      turn: newVersion,
      timestamp: new Date().toISOString(),
      type: "mutation_undone",
      payload: { undoneEventId: target.id, undoneEventType: target.type, source }
    });

    return { committed: true, newStateVersion: newVersion };
  }

  private reverseEvent(event: { type: string; payload?: unknown }): { ok: true } | { ok: false; reason: string } {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      case "physical_state_changed": {
        this.session.physical = p.previousState as Session["physical"];
        return { ok: true };
      }
      case "state_mutation_committed": {
        const target = this.resolveLockableTarget(p.path as string);
        if (!target) return { ok: false, reason: `Cannot undo: target path no longer resolvable (${String(p.path)}).` };
        target.container[target.key] = { ...target.field, value: p.previousValue };
        return { ok: true };
      }
      case "lock_state_changed": {
        const target = this.resolveLockableTarget(p.path as string);
        if (!target) return { ok: false, reason: `Cannot undo: target path no longer resolvable (${String(p.path)}).` };
        target.container[target.key] = { ...target.field, lock: p.previousLock as LockState };
        return { ok: true };
      }
      case "conversation_turn_appended": {
        const turnNumber = (p as unknown as ConversationTurn).turn;
        this.session.conversation = this.session.conversation.filter(
          (c) => (c as unknown as ConversationTurn).turn !== turnNumber
        );
        return { ok: true };
      }
      case "conversation_turn_edited": {
        const turnNumber = p.turn as number;
        const previousContent = p.previousContent as string;
        this.session.conversation = this.session.conversation.map((c) =>
          (c as unknown as ConversationTurn).turn === turnNumber
            ? { ...(c as unknown as ConversationTurn), content: previousContent }
            : c
        );
        return { ok: true };
      }
      case "layer_added": {
        const layer = p.layer as Layer;
        this.session.layers = this.session.layers.filter((l) => l.id !== layer.id);
        return { ok: true };
      }
      case "layer_removed": {
        const layer = p.layer as Layer;
        this.session.layers = [...this.session.layers, layer];
        return { ok: true };
      }
      case "layers_compacted": {
        const removed = p.removed as Layer[];
        const added = p.added as Layer[];
        const addedIds = new Set(added.map((layer) => layer.id));
        this.session.layers = [
          ...this.session.layers.filter((layer) => !addedIds.has(layer.id)),
          ...removed
        ];
        return { ok: true };
      }
      case "layer_activation_changed": {
        const layerId = p.layerId as string;
        const previousActive = p.previousActive as boolean;
        this.session.layers = this.session.layers.map((l) =>
          l.id === layerId ? { ...l, active: previousActive } : l
        );
        return { ok: true };
      }
      case "layer_keywords_changed": {
        const layerId = p.layerId as string;
        const previousKeywords = p.previousKeywords as string[];
        this.session.layers = this.session.layers.map((l) =>
          l.id === layerId ? { ...l, keywords: previousKeywords } : l
        );
        return { ok: true };
      }
      case "layer_spent": {
        const layerId = p.layerId as string;
        const previousActive = p.previousActive as boolean;
        this.session.layers = this.session.layers.map((l) =>
          l.id === layerId ? { ...l, spent: false, active: previousActive } : l
        );
        return { ok: true };
      }
      case "memory_entry_added": {
        const memoryType = p.memoryType as MemoryType;
        const entry = p.entry as { id: string };
        this.session.memory = {
          ...this.session.memory,
          [memoryType]: this.session.memory[memoryType].filter((e) => e.id !== entry.id)
        };
        return { ok: true };
      }
      default:
        return { ok: false, reason: `Don't know how to undo event type "${event.type}".` };
    }
  }

  /**
   * Resolves a dot-path like "characters.emma.mood" or
   * "relationships.emma.trust" to its lockable field container.
   */
  private resolveLockableTarget(
    path: string
  ): { container: Record<string, { value: unknown; lock: LockState }>; key: string; field: { value: unknown; lock: LockState }; lock: LockState } | undefined {
    const parts = path.split(".");

    if (parts[0] === "player" && parts.length === 2 && (parts[1] === "position" || parts[1] === "status")) {
      if (!this.session.player) {
        this.session.player = {
          position: { value: this.session.scene?.location ?? "here", lock: "unlocked" },
          status: { value: "awake", lock: "unlocked" }
        };
      }
      return lockableFrom(this.session.player as Record<string, unknown>, parts[1]);
    }

    if (parts[0] === "characters" && parts.length === 4 && parts[2] === "stats" && parts[1] && parts[3]) {
      const stats = this.session.characters[parts[1]]?.stats as Record<string, unknown> | undefined;
      if (!stats) return undefined;
      return lockableFrom(stats, parts[3]);
    }

    if (parts.length !== 3 || !parts[1] || !parts[2]) return undefined;

    if (parts[0] === "characters") {
      const character = this.session.characters[parts[1]] as
        | Record<string, unknown>
        | undefined;
      if (!character) return undefined;
      const key = parts[2];
      if ((key === "clothing" || key === "holding" || key === "pose") && !isLockableField(character[key])) {
        character[key] = { value: "", lock: "unlocked" };
      }
      return lockableFrom(character, key);
    }

    if (parts[0] === "relationships") {
      const relationship = this.session.relationships[parts[1]] as
        | Record<string, unknown>
        | undefined;
      if (!relationship) return undefined;
      if (parts[2] !== "trust" && parts[2] !== "familiarity" && parts[2] !== "tension") return undefined;
      return lockableFrom(relationship, parts[2]);
    }

    return undefined;
  }

  /**
   * Player-controlled runtime config (which local model to call).
   * Not world state — does not bump stateVersion — but is persisted
   * with the session so setup and the status bar stay in sync.
   */
  setRuntimeModel(model: string): void {
    const next = model.trim();
    if (!next || next === this.session.runtime.model) return;
    this.session.runtime = { ...this.session.runtime, model: next };
    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "runtime_model_changed",
      payload: { model: next }
    });
  }

  /**
   * Pass 1 reply cap (Ollama num_predict). Not world state — no stateVersion bump.
   */
  setRuntimeMaxReplyTokens(tokens: number): void {
    const next = Math.max(64, Math.min(1024, Math.round(tokens)));
    if (next === (this.session.runtime.maxReplyTokens ?? DEFAULT_MAX_REPLY_TOKENS)) return;
    this.session.runtime = { ...this.session.runtime, maxReplyTokens: next };
    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "runtime_max_reply_changed",
      payload: { maxReplyTokens: next }
    });
  }

  /**
   * Draft for the next Start. Player-owned. Does not replace why they arrived.
   */
  setOutgoingHandoff(text: string): void {
    const next = clipHandoff(text);
    if (next === (this.session.outgoingHandoff ?? "").trim()) return;
    if (next) this.session.outgoingHandoff = next;
    else delete this.session.outgoingHandoff;
    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "outgoing_handoff_changed",
      payload: { outgoingHandoff: next }
    });
  }

  setHandoff(text: string): void {
    const next = clipHandoff(text);
    if (next === (this.session.handoff ?? "").trim()) return;
    if (next) this.session.handoff = next;
    else delete this.session.handoff;
    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "handoff_changed",
      payload: { handoff: next }
    });
  }

  setWhatNowOpen(open: boolean): void {
    if (Boolean(this.session.whatNowOpen) === open) return;
    this.session.whatNowOpen = open;
    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "what_now_open_changed",
      payload: { open }
    });
  }

  /** Show this trigger’s buttons. Other groups stay for later. */
  armWhatNowSet(setId: string): void {
    const set = sessionWhatNowSets(this.session).find((item) => item.id === setId);
    if (!set) return;
    this.session.whatNow = set.choices;
    this.session.whatNowKeywords = set.keywords.length > 0 ? set.keywords : undefined;
    this.session.whatNowActiveSetId = set.id;
    this.setWhatNowOpen(true);
  }

  /** This trigger’s listed fork is taken — other groups may still wait. */
  spendWhatNow(setId?: string): void {
    const id = setId?.trim() || this.session.whatNowActiveSetId?.trim();
    if (!this.session.whatNow?.length && !this.session.whatNowOpen && !this.session.whatNowSets?.length) return;
    if (id && this.session.whatNowSets?.length) {
      this.session.whatNowSets = this.session.whatNowSets.filter((item) => item.id !== id);
      if (this.session.whatNowSets.length === 0) this.session.whatNowSets = undefined;
    } else {
      this.session.whatNowSets = undefined;
    }
    this.session.whatNow = undefined;
    this.session.whatNowKeywords = undefined;
    this.session.whatNowActiveSetId = undefined;
    this.session.whatNowOpen = false;
    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "what_now_spent",
      payload: { setId: id ?? "" }
    });
  }

  setRoomOpened(roomId: string, opened: boolean): void {
    const id = roomId.trim();
    if (!id) return;
    const current = this.session.openedRoomIds ?? [];
    const has = current.includes(id);
    if (opened === has) return;
    this.session.openedRoomIds = opened ? [...current, id] : current.filter((item) => item !== id);
    if (this.session.openedRoomIds.length === 0) this.session.openedRoomIds = [];
    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "room_opened_changed",
      payload: { roomId: id, opened }
    });
  }

  /** Sets a story flag ("brosch_given"). No-op, no event, if already set. */
  setStoryFlag(flag: string): void {
    const next = nextFlagsAfterSet(this.session.storyFlags, flag);
    if (!next) return;
    this.session.storyFlags = next;
    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "story_flag_set",
      payload: { flag: flag.trim() }
    });
  }

  /** Clears a story flag. No-op, no event, if it was not set. */
  clearStoryFlag(flag: string): void {
    const next = nextFlagsAfterClear(this.session.storyFlags, flag);
    if (!next) return;
    this.session.storyFlags = next;
    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "story_flag_cleared",
      payload: { flag: flag.trim() }
    });
  }

  openRoomsNamedInText(text: string): void {
    for (const id of roomIdsNamedInText(this.session, text)) {
      this.setRoomOpened(id, true);
    }
  }

  openRoomAtDest(dest: string | undefined): void {
    const id = roomIdForDest(this.session, dest);
    if (id) this.setRoomOpened(id, true);
  }

  setPartyMember(characterId: string, withPlayer: boolean): void {
    const id = characterId.trim();
    if (!id || !this.session.characters[id]) return;
    if (withPlayer) {
      this.acceptParty(id);
      return;
    }
    this.leaveParty(id);
  }

  acceptParty(characterId: string): void {
    const id = characterId.trim();
    if (!id || !this.session.characters[id]) return;
    if (!canAcceptParty(this.session, id)) return;
    const party = this.session.partyIds ?? [];
    const pending = this.session.partyPendingIds ?? [];
    this.session.partyPendingIds = pending.filter((item) => item !== id);
    if (this.session.partyPendingIds.length === 0) this.session.partyPendingIds = [];
    this.session.partyIds = [...party, id];
    this.session.partyHoldIds = holdingPartyIds(this.session);
    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "party_member_changed",
      payload: { characterId: id, withPlayer: true }
    });
  }

  leaveParty(characterId: string): void {
    const next = nextPartyAfterLeave(this.session, characterId);
    if (!next) return;
    this.session.partyIds = next.partyIds;
    this.session.partyPendingIds = next.partyPendingIds;
    this.session.partyHoldIds = holdingPartyIds(this.session);
    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "party_member_changed",
      payload: { characterId: characterId.trim(), withPlayer: false, waitlist: true }
    });
  }

  holdParty(characterId: string): void {
    const id = characterId.trim();
    if (!id || !this.session.characters[id]) return;
    const party = this.session.partyIds ?? [];
    if (!party.includes(id)) return;
    const hold = holdingPartyIds(this.session);
    if (hold.includes(id)) return;
    this.session.partyHoldIds = [...hold, id];
    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "party_hold_changed",
      payload: { characterId: id, hold: true }
    });
  }

  followParty(characterId: string): void {
    const id = characterId.trim();
    if (!id) return;
    const hold = holdingPartyIds(this.session);
    if (!hold.includes(id)) return;
    this.session.partyHoldIds = hold.filter((item) => item !== id);
    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "party_hold_changed",
      payload: { characterId: id, hold: false }
    });
  }

  dismissParty(characterId: string): void {
    const id = characterId.trim();
    if (!id) return;
    const party = this.session.partyIds ?? [];
    const pending = this.session.partyPendingIds ?? [];
    const inParty = party.includes(id);
    const inPending = pending.includes(id);
    if (!inParty && !inPending) return;
    if (inParty) {
      this.session.partyIds = party.filter((item) => item !== id);
      if (this.session.partyIds.length === 0) this.session.partyIds = [];
    }
    if (inPending) {
      this.session.partyPendingIds = pending.filter((item) => item !== id);
      if (this.session.partyPendingIds.length === 0) this.session.partyPendingIds = [];
    }
    this.session.partyHoldIds = holdingPartyIds(this.session);
    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "party_member_changed",
      payload: { characterId: id, withPlayer: false, pending: inPending && !inParty }
    });
  }

  offerPartyFromReply(characterId: string, reply: string): void {
    this.applyPending(nextPendingAfterOffer(this.session, characterId, reply), characterId.trim());
  }

  offerPartyFromProposal(value: string): boolean {
    const next = nextPendingAfterIds(this.session, idsFromOfferValue(value));
    if (!next) return false;
    this.applyPending(next);
    return true;
  }

  private applyPending(next: string[] | undefined, characterId?: string): void {
    if (!next) return;
    this.session.partyPendingIds = next;
    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "party_offer_changed",
      payload: { ...(characterId ? { characterId } : {}), pending: true, partyPendingIds: next }
    });
  }

  travelToLandmark(patch: LandmarkTravelPatch): void {
    if (this.session.scene?.placeId === patch.placeId) return;
    applyLandmarkTravel(this.session, patch);
    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "landmark_traveled",
      payload: { placeId: patch.placeId, location: patch.location }
    });
  }

  syncPartyFromPlayerText(playerMessage: string, focusId: string): void {
    const next = nextPartyAfterPlayerText(this.session, playerMessage, focusId);
    const party = this.session.partyIds ?? [];
    const pending = this.session.partyPendingIds ?? [];
    if (
      party.join("\0") === next.partyIds.join("\0") &&
      pending.join("\0") === next.partyPendingIds.join("\0")
    ) {
      return;
    }
    this.session.partyIds = next.partyIds;
    this.session.partyPendingIds = next.partyPendingIds;
    this.session.partyHoldIds = holdingPartyIds(this.session);
    this.eventLog.append({
      turn: this.session.stateVersion,
      timestamp: new Date().toISOString(),
      type: "party_member_changed",
      payload: { partyIds: next.partyIds, partyPendingIds: next.partyPendingIds }
    });
  }
}

const LOCK_STATES = new Set<string>(["unlocked", "player_locked", "system_locked"]);
const METER_FIELDS = new Set(["energy", "trust", "familiarity", "tension"]);
const EMPTY_HANDS = /^(empty|none|nothing|empty hands)$/i;

function isLockableField(value: unknown): value is { value: unknown; lock: LockState } {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as { value?: unknown; lock?: unknown };
  return "value" in rec && typeof rec.lock === "string" && LOCK_STATES.has(rec.lock);
}

function lockableFrom(
  container: Record<string, unknown>,
  key: string
): {
  container: Record<string, { value: unknown; lock: LockState }>;
  key: string;
  field: { value: unknown; lock: LockState };
  lock: LockState;
} | undefined {
  const field = container[key];
  if (!isLockableField(field)) return undefined;
  return {
    container: container as Record<string, { value: unknown; lock: LockState }>,
    key,
    field,
    lock: field.lock
  };
}

function coerceMutationValue(path: string, value: unknown, session: Session): unknown | undefined {
  const statPath = parseStatPath(path);
  if (statPath) {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(n)) return undefined;
    const def = session.ruleset?.attributes.find((item) => item.id === statPath.statId);
    const { min, max } = attributeRange(def ?? {});
    return Math.max(min, Math.min(max, Math.round(n)));
  }
  const field = path.split(".").pop() ?? "";
  if (METER_FIELDS.has(field)) {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(n)) return undefined;
    return Math.max(0, Math.min(100, Math.round(n)));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (field === "holding") {
      if (!trimmed || EMPTY_HANDS.test(trimmed)) return "";
      return trimmed;
    }
    if (field === "pose") {
      return trimmed;
    }
    if (trimmed !== "") return trimmed;
  }
  return undefined;
}
