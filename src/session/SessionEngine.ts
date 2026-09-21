import { StateEngine, type MutationProposal } from "@state/StateEngine";
import type { AuthoritySource } from "@state/AuthorityResolver";
import { assembleContext, buildPass1Messages, metersFromSession, parseConversationTurns } from "@context/ContextEngine";
import { closeReplyIfCut, stripPass1InstructionLeak } from "@context/PlayerAgency";
import { personNameTerms } from "@library/personName";
import { maskUnheardGivenNames, pass1NameOptions, narrationCallName } from "@state/nameHeard";
import { LLMAdapter } from "@llm/LLMAdapter";
import type { ChatMessage } from "@llm/types";
import { EventLog } from "@events/EventLog";
import { transition, canTransition, type SessionState } from "./SessionStateMachine";
import {
  runRollingMemoryUntilQuiet,
  standingNotesForSummarizer,
  DEFAULT_ROLLING_MEMORY_OPTIONS,
  type ConversationSummarizer,
  type RollingMemoryOptions
} from "@memory/RollingMemory";
import type { LayerProposalExtractor } from "@layers/LayerProposalExtraction";
import { onceLayersFiring } from "@layers/LayerEngine";
import { pass1PredictTokens, type Session } from "@state/StateSchema";
import { checkFavor, rollD100 } from "@state/favorCheck";
import { namedRoomsInCanon } from "@state/WorldCanon";
import { destinationRoomFromPlayerText, dropAiPlayerPosition, filterUninvitedFollowProposals, sceneContinuesAfterNight, sceneStageKey, sceneStageLabel, sideRoomStage, spatialWritesForTurn, venueBuildingName } from "@state/playerDestination";
import {
  listedWhatNowDest,
  resolveWhatNowIntercept,
  setIdListingDest,
  setIdToArmAfterTurn
} from "@state/whatNowGate";
import { dressForPublicBarWrites } from "@state/clothing";
import type { LandmarkTravelPatch } from "@state/landmarkTravel";
import { herePrompt } from "@state/placeIntro";
import { othersInScene } from "@state/sceneFocus";
import { holdingPartyIds, isLeftBehind, travelingPartyIds } from "@state/party";
import { movableStatsForCharacter, type MovableStat } from "@state/statShift";
import { chatBeatFor, parseLiveTurns, undoIdsAfterReply, undoIdsForBeatReplay } from "./chatBeat";

/**
 * Session Engine — Master Spec §2.1, §48.
 * Orchestrates one full turn: append the player's message, assemble
 * context (§10-11), stream Pass 1 dialogue (§32), extract Pass 2
 * proposals, validate and commit them through StateEngine, append the
 * character's reply. Every step advances the Session State Machine —
 * an out-of-order call is a programming error caught immediately by
 * InvalidTransitionError, not a subtle bug.
 */

export interface MutationProposalInput {
  path: string;
  value: unknown;
  source: AuthoritySource;
}

/** Live numbers/mood Pass 2 should shift from, not invent. */
export interface Pass2LiveSnapshot {
  mood?: string;
  clothing?: string;
  holding?: string;
  pose?: string;
  position?: string;
  energy?: number;
  trust?: number;
  familiarity?: number;
  tension?: number;
  playerPosition?: string;
  playerStatus?: string;
  namedRooms?: string[];
  stats?: MovableStat[];
  inParty?: boolean;
  cast?: Array<{ id: string; name: string }>;
  partyIds?: string[];
  partyPendingIds?: string[];
}

export type ProposalExtractor = (
  fullText: string,
  characterId: string,
  live?: Pass2LiveSnapshot,
  playerMessage?: string
) => MutationProposalInput[] | Promise<MutationProposalInput[]>;

const defaultProposalExtractor: ProposalExtractor = () => [];

export interface RunTurnCallbacks {
  /** Invoked once per Pass 1 text chunk as it streams in, for live UI rendering. */
  onTextDelta?: (delta: string) => void;
  /** Invoked after the player message is in conversation history, before Pass 1 streams. */
  onPlayerMessageAppended?: () => void;
  /** Invoked after spatial writes (room change) so the UI can switch backdrop before tokens. */
  onSessionUpdated?: () => void;
}

export interface RunTurnOptions {
  /** What now? destination — a listed room or the venue floor. */
  goTo?: string;
  /** Walk to another landmark in this realm. Swaps Here before Pass 1. */
  travel?: LandmarkTravelPatch;
  /** Director note on regenerate — writing instruction, not a new spoken line. */
  regenNote?: string;
}

export interface TurnResult {
  turnId: string;
  text: string;
  mutationsApplied: number;
  mutationsRejected: number;
  idempotentReplay: boolean;
  /** What now? opened instead of running a turn — no player line was stored. */
  openedWhatNow?: boolean;
}

export class SessionNotIdleError extends Error {
  constructor(current: SessionState) {
    super(`Cannot start a new turn: session is currently "${current}", not "idle".`);
    this.name = "SessionNotIdleError";
  }
}

export class TurnFailedError extends Error {
  constructor(
    public readonly turnId: string,
    message: string,
    public override readonly cause?: unknown
  ) {
    super(`Turn "${turnId}" failed: ${message}`);
    this.name = "TurnFailedError";
  }
}

export class NoTurnToRegenerateError extends Error {
  constructor() {
    super("There is no previous turn to regenerate.");
    this.name = "NoTurnToRegenerateError";
  }
}

export class ReplayNoBeatError extends Error {
  constructor() {
    super("That line has no beat to replay.");
    this.name = "ReplayNoBeatError";
  }
}

export class WhatNowRequiredError extends Error {
  constructor() {
    super("Pick where the night goes.");
    this.name = "WhatNowRequiredError";
  }
}

export interface RollingMemoryConfig {
  summarizer: ConversationSummarizer;
  options?: RollingMemoryOptions;
}

/** What's needed to redo a turn's dialogue+mutations while keeping the same player message. */
interface TurnManifest {
  turnId: string;
  characterId: string;
  playerMessage: string;
  /** Event ids for this turn's mutations + reply append, in creation order — NOT the player message append. */
  eventIds: string[];
}

export class SessionEngine {
  private state: SessionState = "idle";
  private readonly committedTurns = new Map<string, TurnResult>();
  private lastTurnManifest: TurnManifest | null = null;

  constructor(
    private readonly stateEngine: StateEngine,
    private readonly llmAdapter: LLMAdapter,
    private readonly eventLog: EventLog,
    private readonly proposalExtractor: ProposalExtractor = defaultProposalExtractor,
    private readonly rollingMemory?: RollingMemoryConfig,
    private readonly layerProposalExtractor?: LayerProposalExtractor
  ) {}

  getState(): SessionState {
    return this.state;
  }

  /**
   * Runs one turn. Safe to retry with the same `turnId`: a turn that
   * already committed returns its cached result without re-invoking the
   * LLM or re-applying mutations (§51 invariant 17 / turn idempotency,
   * §49). A different `turnId` while a turn is still in flight is
   * rejected — this engine handles one turn at a time.
   */
  async runTurn(
    turnId: string,
    characterId: string,
    playerMessage: string,
    callbacks: RunTurnCallbacks = {},
    options: RunTurnOptions = {}
  ): Promise<TurnResult> {
    const cached = this.committedTurns.get(turnId);
    if (cached) {
      return { ...cached, idempotentReplay: true };
    }

    if (this.state !== "idle") {
      throw new SessionNotIdleError(this.state);
    }

    const intercept = resolveWhatNowIntercept(this.stateEngine.getSession(), playerMessage, options.goTo);
    if (intercept.kind === "open") {
      this.stateEngine.armWhatNowSet(intercept.setId);
      callbacks.onSessionUpdated?.();
      return {
        turnId,
        text: "",
        mutationsApplied: 0,
        mutationsRejected: 0,
        idempotentReplay: false,
        openedWhatNow: true
      };
    }
    if (intercept.kind === "blocked") {
      throw new WhatNowRequiredError();
    }
    const goTo = intercept.goTo;

    try {
      this.state = transition(this.state, "start_turn"); // -> awaiting_response

      const preTurnVersion = this.stateEngine.getSession().stateVersion;
      const appendPlayerResult = this.stateEngine.appendConversationTurn(
        { role: "player", content: playerMessage },
        preTurnVersion
      );
      if (!appendPlayerResult.committed) {
        throw new TurnFailedError(turnId, `Could not append player message: ${appendPlayerResult.reason}`);
      }

      callbacks.onPlayerMessageAppended?.();
      return await this.runDialogueAndCommit(turnId, characterId, playerMessage, callbacks, {
        ...options,
        ...(goTo ? { goTo } : {})
      });
    } catch (err) {
      this.recoverToIdle();
      throw err instanceof TurnFailedError
        ? err
        : new TurnFailedError(turnId, err instanceof Error ? err.message : "Unexpected error", err);
    }
  }

  /**
   * Regenerate — §31. Re-runs the last turn's dialogue (and Pass 2)
   * with the SAME player message, replacing the previous reply and any
   * mutations it produced. The player's message itself is left alone —
   * only the character's response and its downstream state changes are
   * undone before redoing them.
   *
   * Idempotent on `newTurnId`, same as runTurn. Requires a prior
   * successfully-committed turn to exist.
   */
  async regenerateLastTurn(
    newTurnId: string,
    callbacks: RunTurnCallbacks = {},
    options: { note?: string } = {}
  ): Promise<TurnResult> {
    const cached = this.committedTurns.get(newTurnId);
    if (cached) {
      return { ...cached, idempotentReplay: true };
    }

    if (this.state !== "idle") {
      throw new SessionNotIdleError(this.state);
    }

    const manifest = this.lastTurnManifest;
    if (!manifest) {
      throw new NoTurnToRegenerateError();
    }

    try {
      this.state = transition(this.state, "start_turn"); // -> awaiting_response

      const currentVersion = this.stateEngine.getSession().stateVersion;
      const undoResult = this.stateEngine.undoEvents(manifest.eventIds, "player_manual_state", currentVersion);
      if (!undoResult.committed) {
        throw new TurnFailedError(
          newTurnId,
          `Could not undo the previous reply before regenerating: ${undoResult.reason}`
        );
      }

      const regenNote = options.note?.trim();
      return await this.runDialogueAndCommit(newTurnId, manifest.characterId, manifest.playerMessage, callbacks, {
        ...(regenNote ? { regenNote } : {})
      });
    } catch (err) {
      this.recoverToIdle();
      throw err instanceof TurnFailedError
        ? err
        : new TurnFailedError(newTurnId, err instanceof Error ? err.message : "Unexpected error", err);
    }
  }

  /**
   * Replay a beat from a chat line: undo later conversation, then regenerate
   * that NPC reply from the same player message. Optional note is a writing
   * instruction, same as regenerate.
   */
  async replayTurn(
    newTurnId: string,
    conversationTurn: number,
    callbacks: RunTurnCallbacks = {},
    options: { note?: string } = {}
  ): Promise<TurnResult> {
    const cached = this.committedTurns.get(newTurnId);
    if (cached) {
      return { ...cached, idempotentReplay: true };
    }
    if (this.state !== "idle") {
      throw new SessionNotIdleError(this.state);
    }

    const turns = parseLiveTurns(this.stateEngine.getSession().conversation);
    const beat = chatBeatFor(turns, conversationTurn);
    if (!beat?.reply.speaker) {
      throw new ReplayNoBeatError();
    }

    const events = this.stateEngine.getEventLog().all();
    const later = undoIdsAfterReply(events, beat);
    if (later.length > 0) {
      const undone = this.stateEngine.undoEvents(
        later,
        "player_manual_state",
        this.stateEngine.getSession().stateVersion
      );
      if (!undone.committed) {
        throw new TurnFailedError(
          newTurnId,
          `Could not rewind later chat before replaying: ${undone.reason}`
        );
      }
    }

    const beatIds = undoIdsForBeatReplay(this.stateEngine.getEventLog().all(), beat);
    if (beatIds.length === 0) {
      throw new ReplayNoBeatError();
    }
    this.lastTurnManifest = {
      turnId: beat.reply.turn.toString(),
      characterId: beat.reply.speaker,
      playerMessage: beat.player.content,
      eventIds: beatIds
    };
    return this.regenerateLastTurn(newTurnId, callbacks, options);
  }

  /**
   * The shared back half of a turn: context assembly through Pass 1
   * streaming, Pass 2 extraction, mutation application, appending the
   * reply, opportunistic Rolling Memory condensation, and committing.
   * Assumes the player's message is already in conversation history
   * and the session state machine is already in "awaiting_response".
   */
  private async runDialogueAndCommit(
    turnId: string,
    characterId: string,
    playerMessage: string,
    callbacks: RunTurnCallbacks,
    options: RunTurnOptions = {}
  ): Promise<TurnResult> {
    const previousStage = sceneStageKey(this.stateEngine.getSession());
    const previousPlace = sceneStageLabel(this.stateEngine.getSession());
    const notesBeforeMove = standingNotesForSummarizer(this.stateEngine.getSession());
    this.stateEngine.openRoomsNamedInText(playerMessage);
    if (options.goTo?.trim()) this.stateEngine.openRoomAtDest(options.goTo.trim());
    this.stateEngine.syncPartyFromPlayerText(playerMessage, characterId);
    if (options.travel) this.stateEngine.travelToLandmark(options.travel);
    const walkedIn = destinationRoomFromPlayerText(
      playerMessage,
      this.stateEngine.getSession()
    );
    if (!options.travel) {
      applyPlayerDestinationOn(
        this.stateEngine,
        playerMessage,
        characterId,
        ...(options.goTo?.trim() ? [options.goTo.trim()] : [])
      );
    }
    if (listedWhatNowDest(this.stateEngine.getSession(), options.goTo)) {
      this.stateEngine.spendWhatNow(setIdListingDest(this.stateEngine.getSession(), options.goTo));
    }
    callbacks.onSessionUpdated?.();
    const currentStage = sceneStageKey(this.stateEngine.getSession());
    const currentPlace = sceneStageLabel(this.stateEngine.getSession());
    await this.maybeCondenseHistory(
      previousStage !== currentStage
        ? {
            previousStage,
            currentStage,
            previousPlace,
            currentPlace,
            standingNotes: notesBeforeMove
          }
        : undefined
    );
    const session = this.stateEngine.getSession();
    const character = session.characters[characterId];
    const names = pass1NameOptions(session, characterId);
    const meters = metersFromSession(session, characterId);
    const continuation = sceneContinuesAfterNight(session, playerMessage, previousStage, currentStage);
    const plotLayers = onceLayersFiring(session, { continuation });
    const assembled = assembleContext(session, { continuation });
    const { turns } = parseConversationTurns(session, undefined);
    const trust = session.relationships[characterId]?.trust.value;
    const favor = trust !== undefined ? checkFavor(trust, rollD100()) : undefined;
    const stageRoom = sideRoomStage(session);
    const intro = herePrompt(session);
    const introForModel = intro
      ? {
          ...intro,
          title: maskUnheardGivenNames(session, intro.title),
          body: maskUnheardGivenNames(session, intro.body)
        }
      : undefined;
    const outOfSight = isLeftBehind(session, characterId);
    const justArrived =
      !outOfSight && (Boolean(options.travel) || Boolean(walkedIn && stageRoom === walkedIn));
    const messages: ChatMessage[] = buildPass1Messages(assembled, turns, playerMessage, characterId, {
      ...names,
      ...(character?.pronoun ? { pronoun: character.pronoun } : {}),
      ...(session.player?.status.value ? { playerStatus: session.player.status.value } : {}),
      ...(session.player?.position.value
        ? { playerPosition: maskUnheardGivenNames(session, session.player.position.value) }
        : {}),
      ...(character?.position.value
        ? { characterPosition: maskUnheardGivenNames(session, character.position.value) }
        : {}),
      ...(stageRoom && !outOfSight ? { stageRoom: maskUnheardGivenNames(session, stageRoom) } : {}),
      ...(favor ? { favor } : {}),
      meters,
      ...(introForModel ? { hereIntro: introForModel } : {}),
      ...(justArrived ? { justArrived: true } : {}),
      ...(continuation ? { continuation: true } : {}),
      ...(plotLayers.length > 0 ? { plotBeat: true } : {}),
      ...(character?.clothing ? { clothing: character.clothing.value } : {}),
      ...(character?.holding ? { holding: character.holding.value } : {}),
      namedRooms: namedRoomsInCanon(session),
      ...(venueBuildingName(session.scene?.location)
        ? { venueName: venueBuildingName(session.scene?.location) }
        : {}),
      ...(session.handoff?.trim() ? { sceneHandoff: true } : {}),
      ...(session.player?.name?.trim() ? { playerCalled: session.player.name.trim() } : {}),
      ...(options.regenNote?.trim() ? { regenNote: options.regenNote.trim() } : {}),
      characterNames: Object.entries(session.characters).flatMap(([id, entry]) =>
        entry.name ? [id, ...personNameTerms(entry.name, entry.familyName, entry.middleName)] : [id]
      ),
      others: othersInScene(session, characterId),
      party: travelingPartyIds(session)
        .map((id) => maskUnheardGivenNames(session, narrationCallName(session, id)))
        .filter(Boolean),
      partyPending: (session.partyPendingIds ?? [])
        .map((id) => maskUnheardGivenNames(session, narrationCallName(session, id)))
        .filter(Boolean),
      partyHold: holdingPartyIds(session)
        .map((id) => maskUnheardGivenNames(session, narrationCallName(session, id)))
        .filter(Boolean),
      ...(travelingPartyIds(session).includes(characterId) ? { inParty: true } : {}),
      ...(outOfSight ? { outOfSight: true } : {})
    });

    this.state = transition(this.state, "provider_responding"); // -> streaming

    let fullText = "";
    for await (const chunk of this.llmAdapter.streamCompletion({
      messages,
      temperature: session.runtime.temperature,
      seed: session.runtime.seed,
      maxTokens: pass1PredictTokens(session.runtime.maxReplyTokens)
    })) {
      if (chunk.type === "text_delta") {
        fullText += chunk.text;
        callbacks.onTextDelta?.(chunk.text);
      } else if (chunk.type === "error") {
        throw new TurnFailedError(turnId, `Provider error: ${chunk.message}`);
      } else if (chunk.type === "done") {
        if (chunk.finishReason === "cancelled") {
          throw new TurnFailedError(turnId, "Turn was cancelled before completion.");
        }
      }
    }

    fullText = closeReplyIfCut(stripPass1InstructionLeak(fullText));

    this.state = transition(this.state, "stream_complete"); // -> extracting

    const liveSession = this.stateEngine.getSession();
    const proposalInputs = filterUninvitedFollowProposals(
      dropAiPlayerPosition(
        await this.proposalExtractor(
          fullText,
          characterId,
          liveSnapshotFor(liveSession, characterId),
          playerMessage
        )
      ),
      liveSession,
      characterId
    );

    this.state = transition(this.state, "proposals_ready"); // -> committing

    const eventIdsThisTurn: string[] = [];
    let mutationsApplied = 0;
    let mutationsRejected = 0;
    const leftover: typeof proposalInputs = [];
    for (const input of proposalInputs) {
      if (input.path === "party.offer") {
        const ok =
          typeof input.value === "string" && this.stateEngine.offerPartyFromProposal(input.value);
        if (ok) {
          mutationsApplied++;
          const loggedEvent = this.stateEngine.getEventLog().last();
          if (loggedEvent) eventIdsThisTurn.push(loggedEvent.id);
        } else mutationsRejected++;
        continue;
      }
      if (input.path === "partyIds" || input.path === "partyPendingIds") {
        mutationsRejected++;
        continue;
      }
      leftover.push(input);
    }
    for (const input of leftover) {
      const currentVersion = this.stateEngine.getSession().stateVersion;
      const proposal: MutationProposal = { ...input, expectedStateVersion: currentVersion };
      const result = this.stateEngine.proposeMutation(proposal);
      if (result.committed) {
        mutationsApplied++;
        const loggedEvent = this.stateEngine.getEventLog().last();
        if (loggedEvent) eventIdsThisTurn.push(loggedEvent.id);
      } else {
        mutationsRejected++;
      }
    }

    const appendReplyVersion = this.stateEngine.getSession().stateVersion;
    const appendReplyResult = this.stateEngine.appendConversationTurn(
      {
        role: "character",
        speaker: characterId,
        content: fullText,
        ...(isLeftBehind(this.stateEngine.getSession(), characterId) ? { toldBy: "narrator" as const } : {})
      },
      appendReplyVersion
    );
    if (!appendReplyResult.committed) {
      throw new TurnFailedError(turnId, `Could not append character reply: ${appendReplyResult.reason}`);
    }
    this.stateEngine.openRoomsNamedInText(fullText);
    this.stateEngine.offerPartyFromReply(characterId, fullText);
    const replyEvent = this.stateEngine.getEventLog().last();
    if (replyEvent) eventIdsThisTurn.push(replyEvent.id);

    const armSetId = setIdToArmAfterTurn(this.stateEngine.getSession());
    if (armSetId) {
      this.stateEngine.armWhatNowSet(armSetId);
      callbacks.onSessionUpdated?.();
    }

    for (const layer of plotLayers) {
      const spent = this.stateEngine.markLayerSpent(
        layer.id,
        "explicit_scenario_rule",
        this.stateEngine.getSession().stateVersion
      );
      if (spent.committed) {
        const spentEvent = this.stateEngine.getEventLog().last();
        if (spentEvent && spentEvent.type === "layer_spent") eventIdsThisTurn.push(spentEvent.id);
      }
      // Not added to eventIdsThisTurn: like room-opened and party state, a
      // story flag is a durable world fact, not part of the reversible
      // dialogue chain — Regenerate replaces the reply, not what already
      // became true. (reverseEvent() also has no case for it, on purpose.)
      for (const flag of layer.setsFlags ?? []) {
        this.stateEngine.setStoryFlag(flag);
      }
    }

    // AI-Generated Layers: opportunistic, best-effort, same
    // tolerant-degradation shape as Pass 2 and Rolling Memory — a
    // failure here must never fail an otherwise-successful turn. Any
    // proposed layer is force-created inactive by LayerPolicy (or
    // discarded if it invents a room or creature not in canon), so this
    // never has an immediate behavioral effect.
    if (this.layerProposalExtractor) {
      try {
        const layerProposal = await this.layerProposalExtractor(fullText, characterId);
        if (layerProposal) {
          const versionBeforeLayer = this.stateEngine.getSession().stateVersion;
          const layerResult = this.stateEngine.addLayer(
            { ...layerProposal, priority: 5 },
            "ai_approved_state_mutation",
            versionBeforeLayer
          );
          if (layerResult.committed) {
            const layerEvent = this.stateEngine.getEventLog().last();
            if (layerEvent) eventIdsThisTurn.push(layerEvent.id);
          }
        }
      } catch {
        // Deliberately swallowed — see comment above.
      }
    }

    // Captured before Rolling Memory runs, so a condensation triggered
    // by this turn is never itself undone by a later Regenerate call —
    // condensation of *older* history is unrelated to this turn's reply.
    this.lastTurnManifest = { turnId, characterId, playerMessage, eventIds: eventIdsThisTurn };

    // Rolling Conversation Memory: opportunistic, best-effort. A
    // failure here must never fail a turn whose dialogue and
    // mutations have already committed successfully — same
    // tolerant-degradation principle as Pass 2 (§33.3).
    // Rolling Conversation Memory: opportunistic, best-effort. A
    // failure here must never fail a turn whose dialogue and
    // mutations have already committed successfully — same
    // tolerant-degradation principle as Pass 2 (§33.3).
    await this.maybeCondenseHistory();

    this.state = transition(this.state, "committed"); // -> idle

    const result: TurnResult = {
      turnId,
      text: fullText,
      mutationsApplied,
      mutationsRejected,
      idempotentReplay: false
    };
    this.committedTurns.set(turnId, result);

    this.eventLog.append({
      turn: this.stateEngine.getSession().stateVersion,
      timestamp: new Date().toISOString(),
      type: "turn_committed",
      payload: { turnId, mutationsApplied, mutationsRejected }
    });

    return result;
  }

  /**
   * Best-effort recap of beats the 8,000-token ceiling would drop, and
   * of old batches past the recent window. Never fails the turn.
   */
  private async maybeCondenseHistory(
    move?: {
      previousStage: string;
      currentStage: string;
      previousPlace: string;
      currentPlace: string;
      standingNotes: string[];
    }
  ): Promise<void> {
    if (!this.rollingMemory) return;
    try {
      const base = this.rollingMemory.options ?? DEFAULT_ROLLING_MEMORY_OPTIONS;
      await runRollingMemoryUntilQuiet(this.stateEngine, this.rollingMemory.summarizer, {
        ...base,
        ...(move ?? {})
      });
    } catch {
      // Deliberately swallowed — condensation is housekeeping.
    }
  }

  /**
   * Any failure mid-turn moves to "error" then immediately resets to
   * "idle" so the engine remains usable for the next attempt. Guarded
   * with canTransition since the failure itself might be an
   * InvalidTransitionError thrown by the state machine, in which case
   * the state is already wherever it legitimately is.
   */
  private recoverToIdle(): void {
    if (canTransition(this.state, "failure")) {
      this.state = transition(this.state, "failure");
    }
    if (canTransition(this.state, "reset")) {
      this.state = transition(this.state, "reset");
    }
  }
}

function liveSnapshotFor(session: Session, characterId: string): Pass2LiveSnapshot {
  const character = session.characters[characterId];
  const bond = session.relationships[characterId];
  const stats = movableStatsForCharacter(session, characterId);
  return {
    ...(character ? { mood: character.mood.value, position: character.position.value } : {}),
    ...(character?.clothing?.value.trim() ? { clothing: character.clothing.value } : {}),
    ...(character?.holding ? { holding: character.holding.value } : {}),
    ...(character?.pose ? { pose: character.pose.value } : {}),
    ...(character?.energy ? { energy: character.energy.value } : {}),
    ...(bond
      ? {
          trust: bond.trust.value,
          familiarity: bond.familiarity.value,
          tension: bond.tension.value
        }
      : {}),
    ...(session.player
      ? {
          playerPosition: session.player.position.value,
          playerStatus: session.player.status.value
        }
      : {}),
    ...(namedRoomsInCanon(session).length > 0 ? { namedRooms: namedRoomsInCanon(session) } : {}),
    ...(stats.length > 0 ? { stats } : {}),
    cast: Object.entries(session.characters).map(([id, entry]) => ({
      id,
      name: entry.name?.trim() || id
    })),
    partyIds: session.partyIds ?? [],
    partyPendingIds: session.partyPendingIds ?? [],
    ...((session.partyIds ?? []).includes(characterId) &&
    !(session.partyHoldIds ?? []).includes(characterId)
      ? { inParty: true }
      : {})
  };
}

function applyPlayerDestinationOn(
  engine: StateEngine,
  playerMessage: string,
  characterId: string,
  goTo?: string
): void {
  const session = engine.getSession();
  const spatial = goTo?.trim()
    ? spatialWritesForTurn(session, playerMessage, characterId, goTo.trim())
    : spatialWritesForTurn(session, playerMessage, characterId);
  for (const write of spatial) {
    const session = engine.getSession();
    engine.proposeMutation({
      path: write.path,
      value: write.value,
      source: "player_manual_state",
      expectedStateVersion: session.stateVersion
    });
  }
  const dressed = dressForPublicBarWrites(engine.getSession(), playerMessage, characterId);
  for (const write of dressed) {
    const session = engine.getSession();
    engine.proposeMutation({
      path: write.path,
      value: write.value,
      source: "player_manual_state",
      expectedStateVersion: session.stateVersion
    });
  }
}
