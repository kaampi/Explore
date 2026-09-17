import type { Session, ConversationTurn } from "@state/StateSchema";
import type { StateEngine } from "@state/StateEngine";
import type { LLMAdapter } from "@llm/LLMAdapter";
import { retryWithBackoff, type RetryOptions } from "@llm/retry";
import { assembleContext, parseConversationTurns } from "@context/ContextEngine";
import { DEFAULT_BUDGET } from "@context/ContextBudgetManager";
import { getEffectiveActiveLayers } from "@layers/LayerEngine";
import { herePrompt } from "@state/placeIntro";
import {
  formatCondensationEntry,
  getHighestCondensedTurnEnd
} from "./condensationMarker";

/**
 * Rolling Conversation Memory — Phase 4 (project_spec.md).
 *
 * The Context Budget Manager drops old conversation turns under the
 * 8,000-token ceiling, but that's a per-turn, non-persistent decision
 * unless this module writes a recap. Once a batch falls out of the live
 * window — either because a full count-based batch is due, or because
 * those turns would be dropped this beat — it is condensed into an
 * episodic recap. ContextEngine then keeps the recap and omits the
 * condensed turns from the live chat.
 *
 * This intentionally does NOT delete anything from `session.conversation`.
 * Old turns stay in canonical state; they just stop being the only
 * record of what happened once condensed.
 */

export { getHighestCondensedTurnEnd, parseCondensationRange } from "./condensationMarker";

export interface RollingMemoryOptions {
  /** Turns more recent than this many turns back are never condensed by count. */
  keepRecentTurns: number;
  /** Count-based condensation only fires once a full batch of this size has accumulated. */
  batchSize: number;
  /**
   * On a named-room / venue change, keep this many newest beats live
   * (the doorway) and recap the rest.
   */
  keepRecentOnPlaceChange?: number;
  /** Scene-break keys from `sceneStageKey`. */
  previousStage?: string;
  currentStage?: string;
  /** Human labels for the recap ("Emma's room"), not the lookup key. */
  previousPlace?: string;
  currentPlace?: string;
  /** Notes captured before a place move, so Here is still the old room. */
  standingNotes?: string[];
}

export const DEFAULT_ROLLING_MEMORY_OPTIONS: RollingMemoryOptions = {
  keepRecentTurns: 20,
  batchSize: 10
};

export const CONVERSATION_SUMMARIZER_SYSTEM = [
  "You condense older roleplay beats that are leaving the live window. The next writer must continue the same scene without those full turns.",
  "Standing notes and Here are already on file. Recap events only. Do not copy personality, place layout, or a relationship thesis from those notes.",
  "Write a factual recap:",
  "- Go in order. Who did or said what, where, what was decided, what objects, rooms, clothing, or body facts were established in these beats.",
  "- Keep concrete details that still matter. Quote or paraphrase promises only if they were actually spoken.",
  "- Do not upgrade or invent. Affection is not lifelong commitment. One night is not marriage. A moan is not a vow. If they did not say it, do not write it.",
  "- Do not write a theme, moral, or relationship thesis. Twenty beats must not become one sentence.",
  "- Length: 8–14 short sentences, or one short bullet per important beat. No chapter.",
  "Third person, past tense. Output only the recap."
].join("\n");

const DEFAULT_KEEP_ON_PLACE_CHANGE = 4;

/**
 * Selects turns the 8,000-token ceiling would drop from this assembly.
 * Already-condensed turns are not in the live window, so they cannot
 * appear here.
 */
export function selectTurnsDroppedByBudget(session: Session): ConversationTurn[] {
  const assembled = assembleContext(session, { budget: DEFAULT_BUDGET });
  const droppedTurnNumbers = new Set<number>();
  for (const block of assembled.droppedBlocks) {
    if (block.source !== "conversation") continue;
    const match = /^conversation-(\d+)$/.exec(block.id);
    if (match?.[1]) droppedTurnNumbers.add(Number(match[1]));
  }
  if (droppedTurnNumbers.size === 0) return [];

  const { turns } = parseConversationTurns(session, undefined);
  return turns.filter((turn) => droppedTurnNumbers.has(turn.turn));
}

/**
 * Beats left behind when the player changes named room / venue.
 * The newest `keepRecentOnPlaceChange` stays live (the doorway).
 */
export function selectPlaceChangeBatch(
  session: Session,
  options: RollingMemoryOptions
): ConversationTurn[] | null {
  if (!options.previousStage || !options.currentStage) return null;
  if (options.previousStage === options.currentStage) return null;

  const keep = options.keepRecentOnPlaceChange ?? DEFAULT_KEEP_ON_PLACE_CHANGE;
  const { turns } = parseConversationTurns(session, undefined);
  const highestCondensed = getHighestCondensedTurnEnd(session);
  const live = turns.filter((turn) => turn.turn > highestCondensed);
  const leftover = live.slice(0, Math.max(0, live.length - keep));
  if (leftover.length < 2) return null;
  return leftover.slice(0, options.batchSize);
}

/**
 * Standing notes already in context — recap must not copy these.
 */
export function standingNotesForSummarizer(session: Session): string[] {
  const notes: string[] = [];
  const here = herePrompt(session);
  if (here?.body.trim()) {
    notes.push(`Here (${here.title}): ${clipNote(here.body)}`);
  }
  for (const layer of getEffectiveActiveLayers(session)) {
    if (layer.id === "layer-place") continue;
    const text = layer.content.trim();
    if (!text) continue;
    notes.push(`${layer.type}: ${clipNote(text)}`);
    if (notes.length >= 8) break;
  }
  return notes;
}

function clipNote(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > 220 ? `${one.slice(0, 220)}…` : one;
}

export type SummarizerKnown = {
  notes: string[];
  previousPlace?: string;
  currentPlace?: string;
};

export function summarizerUserContent(
  turns: ConversationTurn[],
  known?: SummarizerKnown
): string {
  const transcript = turns.map((t) => `${t.speaker ?? t.role}: ${t.content}`).join("\n");
  const parts: string[] = [];
  if (known?.previousPlace && known.currentPlace && known.previousPlace !== known.currentPlace) {
    parts.push(
      `Scene moved from ${known.previousPlace} to ${known.currentPlace}. Recap what happened at ${known.previousPlace}. The live chat continues in the new place.`
    );
  }
  if (known?.notes && known.notes.length > 0) {
    parts.push(
      [
        "Already in standing notes / Here (do not repeat, do not rewrite as a personality or relationship thesis):",
        ...known.notes.map((note) => `- ${note}`)
      ].join("\n")
    );
  }
  parts.push(`Beats to condense:\n${transcript}`);
  return parts.join("\n\n");
}

/**
 * Selects the next batch of turns to condense, or null if there isn't
 * anything due. Prefers a place-change leftover, then turns the token
 * ceiling would drop, then the oldest count-based batch.
 */
export function selectBatchToCondense(
  session: Session,
  options: RollingMemoryOptions = DEFAULT_ROLLING_MEMORY_OPTIONS
): ConversationTurn[] | null {
  const moved = selectPlaceChangeBatch(session, options);
  if (moved && moved.length > 0) return moved;

  const dropped = selectTurnsDroppedByBudget(session);
  if (dropped.length > 0) {
    return dropped.slice(0, options.batchSize);
  }

  const { turns } = parseConversationTurns(session, undefined);
  const highestCondensed = getHighestCondensedTurnEnd(session);
  const notYetCondensed = turns.filter((t) => t.turn > highestCondensed);

  const eligibleCount = notYetCondensed.length - options.keepRecentTurns;
  if (eligibleCount < options.batchSize) return null;

  return notYetCondensed.slice(0, options.batchSize);
}

export type ConversationSummarizer = (
  turns: ConversationTurn[],
  known?: SummarizerKnown
) => Promise<string>;

function naiveFallbackSummary(turns: ConversationTurn[]): string {
  const beats = turns.map((turn) => {
    const who = turn.speaker ?? turn.role;
    const one = turn.content.replace(/\s+/g, " ").trim();
    const clipped = one.length > 90 ? `${one.slice(0, 90)}…` : one;
    return `${who}: ${clipped}`;
  });
  const joined = beats.join(" | ");
  return joined.length > 900 ? `${joined.slice(0, 900)}…` : joined;
}

export interface LLMSummarizerOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleepImpl?: RetryOptions["sleepImpl"];
  onFailure?: (error: unknown) => void;
}

/**
 * Builds an LLM-backed summarizer. Same tolerant-degradation shape as
 * Pass 2 (§33.3) — but the fallback differs on purpose: Pass 2 falls
 * back to *nothing* (no proposed mutation is always safe), whereas here
 * a beat-by-beat clip is a better outcome than losing the batch's gist
 * entirely, so exhausting retries falls back to `naiveFallbackSummary`.
 */
export function createLLMConversationSummarizer(
  llmAdapter: LLMAdapter,
  options: LLMSummarizerOptions = {}
): ConversationSummarizer {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 200;

  return async (turns: ConversationTurn[], known?: SummarizerKnown): Promise<string> => {
    try {
      return await retryWithBackoff(
        async () => {
          let collected = "";
          for await (const chunk of llmAdapter.streamCompletion({
            messages: [
              { role: "system", content: CONVERSATION_SUMMARIZER_SYSTEM },
              { role: "user", content: summarizerUserContent(turns, known) }
            ],
            temperature: 0.3,
            maxTokens: 512
          })) {
            if (chunk.type === "text_delta") collected += chunk.text;
            else if (chunk.type === "error")
              throw new Error(`Provider error during summarization: ${chunk.message}`);
          }
          if (!collected.trim()) throw new Error("Summarizer returned an empty response.");
          return collected.trim();
        },
        { maxAttempts, baseDelayMs, sleepImpl: options.sleepImpl }
      );
    } catch (err) {
      options.onFailure?.(err);
      return naiveFallbackSummary(turns);
    }
  };
}

export interface CondensationResult {
  condensed: boolean;
  turnRange?: [number, number];
}

function knownFactsFrom(session: Session, options: RollingMemoryOptions): SummarizerKnown {
  const known: SummarizerKnown = {
    notes: options.standingNotes ?? standingNotesForSummarizer(session)
  };
  if (options.previousPlace) known.previousPlace = options.previousPlace;
  if (options.currentPlace) known.currentPlace = options.currentPlace;
  return known;
}

/**
 * Runs one condensation attempt: selects a batch if one is due,
 * summarizes it, and writes the result as an episodic memory entry
 * through StateEngine. No-op if no batch is due yet.
 */
export async function runRollingMemoryCondensation(
  stateEngine: StateEngine,
  summarizer: ConversationSummarizer,
  options: RollingMemoryOptions = DEFAULT_ROLLING_MEMORY_OPTIONS
): Promise<CondensationResult> {
  const session = stateEngine.getSession();
  const batch = selectBatchToCondense(session, options);
  if (!batch || batch.length === 0) return { condensed: false };

  const placeMove =
    Boolean(selectPlaceChangeBatch(session, options)) &&
    options.previousPlace &&
    options.currentPlace &&
    options.previousPlace !== options.currentPlace;

  let summary = await summarizer(batch, knownFactsFrom(session, options));
  if (placeMove) {
    summary = `Left ${options.previousPlace} for ${options.currentPlace}. ${summary}`;
  }
  const startTurn = batch[0]!.turn;
  const endTurn = batch[batch.length - 1]!.turn;
  const content = formatCondensationEntry(startTurn, endTurn, summary);

  const currentVersion = stateEngine.getSession().stateVersion;
  stateEngine.addMemoryEntry(
    "episodic",
    { content, importance: 0.85, createdAtTurn: endTurn },
    currentVersion
  );

  return { condensed: true, turnRange: [startTurn, endTurn] };
}

/**
 * Condenses overflow in a few passes so a long saved chat can shrink
 * before Pass 1, without stalling on an unbounded summarizer loop.
 */
export async function runRollingMemoryUntilQuiet(
  stateEngine: StateEngine,
  summarizer: ConversationSummarizer,
  options: RollingMemoryOptions = DEFAULT_ROLLING_MEMORY_OPTIONS,
  maxPasses = 3
): Promise<CondensationResult[]> {
  const results: CondensationResult[] = [];
  for (let i = 0; i < maxPasses; i++) {
    const result = await runRollingMemoryCondensation(stateEngine, summarizer, options);
    results.push(result);
    if (!result.condensed) break;
  }
  return results;
}
