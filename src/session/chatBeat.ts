import type { StateEvent } from "@events/EventLog";
import { ConversationTurnSchema, type ConversationTurn } from "@state/StateSchema";
import { UNDOABLE_EVENT_TYPES } from "@state/StateEngine";

export type ChatBeat = {
  player: ConversationTurn;
  reply: ConversationTurn;
};

export function parseLiveTurns(conversation: unknown[]): ConversationTurn[] {
  return conversation.flatMap((row) => {
    const parsed = ConversationTurnSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Player line + the NPC reply that followed it. */
export function chatBeatFor(turns: ConversationTurn[], conversationTurn: number): ChatBeat | null {
  const idx = turns.findIndex((turn) => turn.turn === conversationTurn);
  if (idx < 0) return null;
  const target = turns[idx]!;
  if (target.role === "player") {
    const reply = turns.slice(idx + 1).find((turn) => turn.role === "character");
    if (!reply?.speaker) return null;
    return { player: target, reply };
  }
  if (target.role === "character") {
    const player = [...turns.slice(0, idx)].reverse().find((turn) => turn.role === "player");
    if (!player || !target.speaker) return null;
    return { player, reply: target };
  }
  return null;
}

export function beatHasLaterChat(turns: ConversationTurn[], beat: ChatBeat): boolean {
  return turns.some((turn) => turn.turn > beat.reply.turn);
}

function appendEventForTurn(events: readonly StateEvent[], turn: number): StateEvent | undefined {
  return events.find((event) => {
    if (event.type !== "conversation_turn_appended") return false;
    const payload = event.payload as { turn?: number } | undefined;
    return payload?.turn === turn;
  });
}

function stillLive(events: readonly StateEvent[]): StateEvent[] {
  const undone = new Set<string>();
  for (const event of events) {
    if (event.type !== "mutation_undone") continue;
    const id = (event.payload as { undoneEventId?: string } | undefined)?.undoneEventId;
    if (id) undone.add(id);
  }
  return events.filter((event) => !undone.has(event.id));
}

/** Player append through NPC reply — Inspector's chain for this bubble. */
export function inspectEventsForBeat(events: readonly StateEvent[], beat: ChatBeat): StateEvent[] {
  const all = stillLive(events);
  const start = appendEventForTurn(all, beat.player.turn);
  const end = appendEventForTurn(all, beat.reply.turn);
  if (!start || !end) return [];
  const from = all.findIndex((event) => event.id === start.id);
  const to = all.findIndex((event) => event.id === end.id);
  if (from < 0 || to < 0 || to < from) return [];
  const nextPlayer = all.findIndex((event, index) => {
    if (index <= to) return false;
    if (event.type !== "conversation_turn_appended") return false;
    return (event.payload as { role?: string } | undefined)?.role === "player";
  });
  return all.slice(from, nextPlayer < 0 ? all.length : nextPlayer);
}

/** Undoable events after the NPC reply — later chat to rewind. */
export function undoIdsAfterReply(events: readonly StateEvent[], beat: ChatBeat): string[] {
  const all = stillLive(events);
  const end = appendEventForTurn(all, beat.reply.turn);
  if (!end) return [];
  const to = all.findIndex((event) => event.id === end.id);
  if (to < 0) return [];
  return all
    .slice(to + 1)
    .filter((event) => UNDOABLE_EVENT_TYPES.has(event.type))
    .map((event) => event.id);
}

/** Undoable events after the player line through the NPC reply — regenerate's batch. */
export function undoIdsForBeatReplay(events: readonly StateEvent[], beat: ChatBeat): string[] {
  const all = stillLive(events);
  const start = appendEventForTurn(all, beat.player.turn);
  const end = appendEventForTurn(all, beat.reply.turn);
  if (!start || !end) return [];
  const from = all.findIndex((event) => event.id === start.id);
  const to = all.findIndex((event) => event.id === end.id);
  if (from < 0 || to < 0 || to < from) return [];
  return all
    .slice(from + 1, to + 1)
    .filter((event) => UNDOABLE_EVENT_TYPES.has(event.type))
    .map((event) => event.id);
}
