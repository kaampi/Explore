import { describe, it, expect } from "vitest";
import { EventLog } from "@events/EventLog";
import {
  beatHasLaterChat,
  chatBeatFor,
  inspectEventsForBeat,
  parseLiveTurns,
  undoIdsAfterReply,
  undoIdsForBeatReplay
} from "@session/chatBeat";
import type { ConversationTurn } from "@state/StateSchema";

const player: ConversationTurn = { turn: 1, role: "player", content: "Hej" };
const reply: ConversationTurn = { turn: 3, role: "character", speaker: "emma", content: "Kväll." };
const later: ConversationTurn = { turn: 5, role: "player", content: "Again" };

describe("chatBeatFor", () => {
  it("pairs a player line with the following NPC reply", () => {
    const beat = chatBeatFor([player, reply], 1);
    expect(beat?.player.content).toBe("Hej");
    expect(beat?.reply.speaker).toBe("emma");
  });

  it("pairs an NPC reply with the preceding player line", () => {
    const beat = chatBeatFor([player, reply], 3);
    expect(beat?.player.turn).toBe(1);
    expect(beat?.reply.turn).toBe(3);
  });

  it("knows when later chat exists", () => {
    const beat = chatBeatFor([player, reply, later], 1);
    expect(beat && beatHasLaterChat([player, reply, later], beat)).toBe(true);
    const only = chatBeatFor([player, reply], 1);
    expect(only && beatHasLaterChat([player, reply], only)).toBe(false);
  });
});

describe("inspectEventsForBeat", () => {
  it("includes the player line, reply, and turn_committed after the reply", () => {
    const log = new EventLog();
    log.append({
      turn: 1,
      timestamp: "t",
      type: "conversation_turn_appended",
      payload: player
    });
    log.append({
      turn: 2,
      timestamp: "t",
      type: "state_mutation_committed",
      payload: { path: "characters.emma.mood", value: "warm" }
    });
    log.append({
      turn: 3,
      timestamp: "t",
      type: "conversation_turn_appended",
      payload: reply
    });
    log.append({
      turn: 3,
      timestamp: "t",
      type: "turn_committed",
      payload: { mutationsApplied: 1, mutationsRejected: 0 }
    });
    log.append({
      turn: 5,
      timestamp: "t",
      type: "conversation_turn_appended",
      payload: later
    });
    const beat = chatBeatFor([player, reply, later], 3)!;
    const slice = inspectEventsForBeat(log.all(), beat);
    expect(slice.map((event) => event.type)).toEqual([
      "conversation_turn_appended",
      "state_mutation_committed",
      "conversation_turn_appended",
      "turn_committed"
    ]);
    expect(undoIdsAfterReply(log.all(), beat)).toHaveLength(1);
    expect(undoIdsForBeatReplay(log.all(), beat)).toHaveLength(2);
  });
});

describe("parseLiveTurns", () => {
  it("skips malformed rows", () => {
    expect(parseLiveTurns([player, { nope: true }, reply])).toEqual([player, reply]);
  });
});
