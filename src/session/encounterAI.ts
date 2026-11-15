import type { CompletionRequest, StreamChunk } from "../llm/types";
import type { Session } from "../state/StateSchema";
import type { StateEngine } from "../state/StateEngine";
import type { EncounterAction, EncounterGame } from "../game/EncounterSchema";
import { publicCommands, type PublicCommand } from "../game/catalog";
import { greetingTarget, spokenInteraction, speechAddressee } from "../game/dialogue";
import { proposeEncounterText } from "../game/intention";
import { canNarrateOutcome } from "../game/narration";
import { pass1PredictTokens } from "../state/StateSchema";
import {
  buildFreeReplyMessages,
  buildInterpretDoMessages,
  buildInterpretSayMessages,
  buildNarrateMessages,
} from "./encounterPrompt";

/** The narrow part of an LLM adapter these functions need, so tests can pass a mock. */
export type Provider = {
  streamCompletion: (request: CompletionRequest) => AsyncGenerator<StreamChunk>;
};

type TextOptions = {
  signal?: AbortSignal | undefined;
  onDelta?: ((text: string) => void) | undefined;
};

export const INTERPRET_TIMEOUT_MS = 12_000;
export const TEXT_TIMEOUT_MS = 30_000;
const MAX_INTERPRET_REPLY_CHARS = 512;
const MAX_TEXT_CHARS = 600;

export type CallResult = { status: "ok"; text: string } | { status: "cancelled" | "failed" };

/** True when the AI may be used at all: exploration only, never during combat or after the end. */
export function aiAllowed(game: EncounterGame | undefined): game is EncounterGame {
  return Boolean(game) && game!.state.phase === "exploration";
}

async function callProvider(
  provider: Provider,
  request: Omit<CompletionRequest, "signal">,
  options: TextOptions & { timeoutMs: number; maxChars: number },
): Promise<CallResult> {
  if (options.signal?.aborted) return { status: "cancelled" };
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, options.timeoutMs);
  const outcomeIfStopped = (): CallResult =>
    options.signal?.aborted ? { status: "cancelled" } : { status: "failed" };
  try {
    let text = "";
    let finished = false;
    for await (const chunk of provider.streamCompletion({
      ...request,
      signal: controller.signal,
    })) {
      if (controller.signal.aborted) return outcomeIfStopped();
      if (chunk.type === "error") return { status: "failed" };
      if (chunk.type === "text_delta") {
        text += chunk.text;
        if (text.length > options.maxChars * 4) return { status: "failed" };
        options.onDelta?.(text);
      }
      if (chunk.type === "done") {
        if (chunk.finishReason === "cancelled") return outcomeIfStopped();
        finished = true;
      }
    }
    if (controller.signal.aborted || !finished) return outcomeIfStopped();
    return { status: "ok", text };
  } catch {
    return outcomeIfStopped();
  } finally {
    clearTimeout(timer);
    controller.abort();
    options.signal?.removeEventListener("abort", abort);
  }
}

/**
 * The only accepted answer is JSON with exactly one key, "action", that is null or one of the
 * refs that were sent. Anything else counts as "no match".
 */
export function parseChoice(raw: string, validRefs: string[]): string | null {
  if (raw.length > MAX_INTERPRET_REPLY_CHARS) return null;
  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/, "")
      .replace(/\s*```$/, "");
    const parsed: unknown = JSON.parse(cleaned);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const keys = Object.keys(parsed);
    if (keys.length !== 1 || keys[0] !== "action") return null;
    const value = (parsed as { action: unknown }).action;
    if (typeof value !== "string") return null;
    return validRefs.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export type InterpretResult =
  | { status: "match"; command: PublicCommand }
  | { status: "none" | "skipped" | "cancelled" | "failed" };

async function chooseOne(
  provider: Provider,
  messages: CompletionRequest["messages"],
  options: PublicCommand[],
  signal?: AbortSignal,
): Promise<InterpretResult> {
  const result = await callProvider(
    provider,
    { messages, temperature: 0, maxTokens: 40 },
    { timeoutMs: INTERPRET_TIMEOUT_MS, signal, maxChars: MAX_INTERPRET_REPLY_CHARS },
  );
  if (result.status !== "ok") return { status: result.status };
  const ref = parseChoice(
    result.text,
    options.map((option) => option.ref),
  );
  const command = options.find((option) => option.ref === ref);
  return command ? { status: "match", command } : { status: "none" };
}

/** Prepared conversations with this person that the player can still have. */
function openTopics(game: EncounterGame, addresseeId: string): PublicCommand[] {
  return publicCommands(game).filter((command) => {
    if (command.blocked || command.action.kind !== "interaction") return false;
    const interactionId = command.action.interactionId;
    return (
      game.definition.interactions.find((i) => i.id === interactionId)?.counterpartyId ===
      addresseeId
    );
  });
}

export async function interpretSay(
  session: Session,
  addresseeId: string,
  text: string,
  provider: Provider,
  signal?: AbortSignal,
): Promise<InterpretResult> {
  const game = session.encounter;
  if (!aiAllowed(game)) return { status: "skipped" };
  const options = openTopics(game, addresseeId);
  if (options.length === 0) return { status: "none" };
  return chooseOne(
    provider,
    buildInterpretSayMessages(session, addresseeId, text, options),
    options,
    signal,
  );
}

export async function interpretDo(
  session: Session,
  text: string,
  provider: Provider,
  signal?: AbortSignal,
): Promise<InterpretResult> {
  const game = session.encounter;
  if (!aiAllowed(game)) return { status: "skipped" };
  const options = publicCommands(game);
  return chooseOne(provider, buildInterpretDoMessages(session, text, options), options, signal);
}

/** Remove what the model must not write: quotes of the player's line and lines spoken as the player. */
export function cleanReply(raw: string, playerLine: string, playerName: string): string {
  const quoted = playerLine.trim();
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.toLowerCase().startsWith(`${playerName.toLowerCase()}:`));
  let text = lines.join(" ");
  if (quoted) text = text.split(quoted).join("");
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > MAX_TEXT_CHARS) {
    const cut = text.slice(0, MAX_TEXT_CHARS);
    const lastEnd = Math.max(
      cut.lastIndexOf("."),
      cut.lastIndexOf("!"),
      cut.lastIndexOf("?"),
      cut.lastIndexOf("”"),
    );
    text = lastEnd > 0 ? cut.slice(0, lastEnd + 1) : cut;
  }
  return text;
}

export async function freeReply(
  session: Session,
  addresseeId: string,
  playerLine: string,
  provider: Provider,
  options: TextOptions = {},
): Promise<CallResult> {
  const game = session.encounter;
  if (!aiAllowed(game)) return { status: "failed" };
  const topics = openTopics(game, addresseeId).map((command) => command.label);
  const messages = buildFreeReplyMessages(session, addresseeId, playerLine, topics);
  const result = await callProvider(
    provider,
    {
      messages,
      temperature: session.runtime.temperature,
      maxTokens: pass1PredictTokens(session.runtime.maxReplyTokens),
    },
    {
      timeoutMs: TEXT_TIMEOUT_MS,
      signal: options.signal,
      onDelta: options.onDelta,
      maxChars: MAX_TEXT_CHARS,
    },
  );
  if (result.status !== "ok") return result;
  const playerName = game.state.actors[game.definition.playerId]!.name;
  const text = cleanReply(result.text, playerLine, playerName);
  return text ? { status: "ok", text } : { status: "failed" };
}

function eventFactLines(game: EncounterGame, actionId: string): string[] {
  const { definition: d, state: s } = game;
  const entry = game.history.find((item) => item.id === actionId);
  if (!entry) return [];
  const who = (id: string) => s.actors[id]?.name ?? id;
  const where = (id: string) => d.places.find((p) => p.id === id)?.name ?? id;
  return entry.events.flatMap((event) => {
    if (event.kind === "move")
      return [`${who(event.actorId)} moves from ${where(event.from)} to ${where(event.to)}.`];
    if (event.kind === "unlock")
      return [`${who(event.actorId)} unlocks ${s.barriers[event.barrierId]?.name ?? "a door"}.`];
    if (event.kind === "open")
      return [`${who(event.actorId)} opens ${s.barriers[event.barrierId]?.name ?? "a door"}.`];
    if (event.kind === "blocked") return [`The action was not possible: ${event.reason}`];
    return [];
  });
}

export async function narrateOutcome(
  session: Session,
  actionId: string,
  provider: Provider,
  options: TextOptions = {},
): Promise<CallResult> {
  const game = session.encounter;
  if (!aiAllowed(game)) return { status: "failed" };
  const entry = game.history.find((item) => item.id === actionId);
  if (!entry || !canNarrateOutcome(entry.events, entry.combat)) return { status: "failed" };
  const messages = buildNarrateMessages(session, eventFactLines(game, actionId), entry.text);
  const result = await callProvider(
    provider,
    {
      messages,
      temperature: session.runtime.temperature,
      maxTokens: pass1PredictTokens(session.runtime.maxReplyTokens),
    },
    {
      timeoutMs: TEXT_TIMEOUT_MS,
      signal: options.signal,
      onDelta: options.onDelta,
      maxChars: MAX_TEXT_CHARS,
    },
  );
  if (result.status !== "ok") return result;
  const text = cleanReply(result.text, "", "");
  // Numbers belong to the engine. Wording with digits is thrown away.
  if (!text || /\d/.test(text)) return { status: "failed" };
  return { status: "ok", text };
}

export type SayPlan =
  /** A prepared answer matched in code. Send the line as before; no AI. */
  | { kind: "authored" }
  /** The AI matched a roll-free, flag-only conversation. Send the line with this id. */
  | { kind: "matched"; interactionId: string }
  /** The AI matched something that needs the player's confirmation. */
  | { kind: "review"; action: EncounterAction }
  /** Nothing prepared fits. The engine records the line; this person may answer freely. */
  | { kind: "free"; addresseeId: string }
  /** Nobody to talk to, no model, or the AI is off. The engine decides as it does today. */
  | { kind: "plain" }
  | { kind: "cancelled" };

/** Decide how to treat a spoken line, following the order in the design. */
export async function planSay(
  session: Session,
  text: string,
  provider: Provider | undefined,
  options: { signal?: AbortSignal | undefined; lastSpeakerId?: string | undefined } = {},
): Promise<SayPlan> {
  const game = session.encounter;
  if (!game) return { kind: "plain" };
  const { definition: d, state: s } = game;
  if (spokenInteraction(d, s, text) || greetingTarget(d, s, text)) return { kind: "authored" };
  if (!provider || !aiAllowed(game)) return { kind: "plain" };
  if (session.adventure?.narration?.freeReplies === false) return { kind: "plain" };
  const addressee = speechAddressee(d, s, text, options.lastSpeakerId);
  if (!addressee) return { kind: "plain" };
  const interpreted = await interpretSay(session, addressee.id, text, provider, options.signal);
  if (interpreted.status === "cancelled") return { kind: "cancelled" };
  if (interpreted.status === "match" && interpreted.command.action.kind === "interaction") {
    const interactionId = interpreted.command.action.interactionId;
    const interaction = d.interactions.find((i) => i.id === interactionId);
    const flagsOnly = interaction
      ? interaction.success.effects
          .concat(interaction.failure.effects)
          .every((e) => e.kind === "flag")
      : false;
    if (interaction && !interaction.check && flagsOnly) return { kind: "matched", interactionId };
    return { kind: "review", action: interpreted.command.action };
  }
  return { kind: "free", addresseeId: addressee.id };
}

export type DoPlan =
  | { kind: "review"; action: EncounterAction; blocked?: string }
  | { kind: "none" }
  | { kind: "cancelled" };

/** Local reading first, then the AI against the public list. A match is always only a proposal. */
export async function planDo(
  session: Session,
  text: string,
  provider: Provider | undefined,
  signal?: AbortSignal,
): Promise<DoPlan> {
  const game = session.encounter;
  if (!game) return { kind: "none" };
  const local = proposeEncounterText(game, text);
  if (local) return { kind: "review", action: local };
  if (!provider || !aiAllowed(game)) return { kind: "none" };
  const interpreted = await interpretDo(session, text, provider, signal);
  if (interpreted.status === "cancelled") return { kind: "cancelled" };
  if (interpreted.status !== "match") return { kind: "none" };
  const { action, blocked } = interpreted.command;
  return { kind: "review", action, ...(blocked ? { blocked } : {}) };
}

export type AttachResult = "attached" | "failed" | "cancelled" | "stale";

/**
 * Ask for a free reply to a line the engine has already recorded, then attach it.
 * On any failure the turn keeps the engine's text and nothing else changes.
 */
export async function replyToRecordedLine(args: {
  engine: StateEngine;
  provider: Provider;
  actionId: string;
  sceneId: string;
  addresseeId: string;
  text: string;
  model: string;
  signal?: AbortSignal | undefined;
  onDelta?: ((text: string) => void) | undefined;
}): Promise<AttachResult> {
  const result = await freeReply(
    args.engine.getSession(),
    args.addresseeId,
    args.text,
    args.provider,
    {
      signal: args.signal,
      onDelta: args.onDelta,
    },
  );
  if (result.status === "cancelled") return "cancelled";
  if (result.status !== "ok") return "failed";
  if (args.signal?.aborted) return "cancelled";
  if (args.engine.getSession().encounter?.definition.id !== args.sceneId) return "stale";
  try {
    const attached = args.engine.attachEncounterNarration({
      actionId: args.actionId,
      sceneId: args.sceneId,
      text: result.text,
      kind: "free-reply",
      speakerId: args.addresseeId,
      model: args.model,
    });
    return attached ? "attached" : "stale";
  } catch {
    return "failed";
  }
}

/** Same for a settled move or door result. */
export async function narrateRecordedTurn(args: {
  engine: StateEngine;
  provider: Provider;
  actionId: string;
  sceneId: string;
  model: string;
  signal?: AbortSignal | undefined;
  onDelta?: ((text: string) => void) | undefined;
}): Promise<AttachResult> {
  const result = await narrateOutcome(args.engine.getSession(), args.actionId, args.provider, {
    signal: args.signal,
    onDelta: args.onDelta,
  });
  if (result.status === "cancelled") return "cancelled";
  if (result.status !== "ok") return "failed";
  if (args.signal?.aborted) return "cancelled";
  if (args.engine.getSession().encounter?.definition.id !== args.sceneId) return "stale";
  try {
    const attached = args.engine.attachEncounterNarration({
      actionId: args.actionId,
      sceneId: args.sceneId,
      text: result.text,
      kind: "narrated-outcome",
      model: args.model,
    });
    return attached ? "attached" : "stale";
  } catch {
    return "failed";
  }
}
