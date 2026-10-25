import { describe, it, expect } from "vitest";
import {
  resolveWhatNowIntercept,
  shouldArmWhatNowAfterTurn,
  whatNowBlocksComposer
} from "@state/whatNowGate";
import { WHAT_NOW_STAY } from "@state/playerDestination";
import type { Session } from "@state/StateSchema";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    openedRoomIds: [],
    storyFlags: [],
    partyIds: [],
    partyHoldIds: [],
    partyPendingIds: [],
    schemaVersion: 2,
    id: "s1",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 0,
    characters: {
      emma: {
        position: { value: "behind the bar", lock: "unlocked" },
        mood: { value: "reserved", lock: "unlocked" }
      }
    },
    scene: { location: "The Aurora Room — a quiet late-night bar", environment: {} },
    player: {
      position: { value: "at the bar", lock: "unlocked" },
      status: { value: "awake", lock: "unlocked" }
    },
    whatNow: [
      { id: "wn1", label: "Go with Emma to her room", room: "Emma's room" },
      { id: "wn2", label: "Stay at the bar", room: "at the bar" }
    ],
    whatNowOpen: false,
    relationships: {},
    layers: [
      {
        id: "place-1",
        type: "environment",
        priority: 0,
        content:
          "Adjoining the bar: toilets off the hall, Emma's room behind the staff door, a guest room upstairs, and a cellar door behind the bar.",
        active: true,
        aiGenerated: false
      }
    ],
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: [],
    ...overrides
  };
}

describe("resolveWhatNowIntercept", () => {
  it("lets ordinary chat through before the opening is over", () => {
    expect(resolveWhatNowIntercept(makeSession(), "I'll have a whiskey.")).toEqual({ kind: "pass" });
    expect(whatNowBlocksComposer(makeSession())).toBe(false);
  });

  it("takes a listed room as the fork, even when typed", () => {
    expect(resolveWhatNowIntercept(makeSession(), "I walk into Emma's room")).toEqual({
      kind: "pass",
      goTo: "Emma's room"
    });
  });

  it("opens the fork instead of inventing a hotel", () => {
    expect(resolveWhatNowIntercept(makeSession(), "I walk to the hotel")).toEqual({
      kind: "open",
      setId: "replies"
    });
    expect(resolveWhatNowIntercept(makeSession(), "I sleep on the street")).toEqual({
      kind: "open",
      setId: "replies"
    });
  });

  it("does not treat a walk to the bar as leaving the map", () => {
    expect(resolveWhatNowIntercept(makeSession(), "I walk to the bar")).toEqual({ kind: "pass" });
  });

  it("does not open because the player asked about a room", () => {
    expect(resolveWhatNowIntercept(makeSession(), "Do you have a room?")).toEqual({ kind: "pass" });
  });

  it("still lets a canon walk that is not a fork option", () => {
    expect(resolveWhatNowIntercept(makeSession(), "I walk to the toilets")).toEqual({ kind: "pass" });
  });

  it("blocks typing once the fork is open", () => {
    const open = makeSession({ whatNowOpen: true });
    expect(resolveWhatNowIntercept(open, "I'll have a whiskey.")).toEqual({ kind: "blocked" });
    expect(whatNowBlocksComposer(open)).toBe(true);
    expect(resolveWhatNowIntercept(open, "Go with Emma to her room", "Emma's room")).toEqual({
      kind: "pass",
      goTo: "Emma's room"
    });
  });

  it("takes a this-beat button as the fork without a new room", () => {
    const open = makeSession({
      whatNow: [
        { id: "wn1", label: "I tell her the truth", room: WHAT_NOW_STAY },
        { id: "wn2", label: "I lie", room: WHAT_NOW_STAY }
      ],
      whatNowOpen: true
    });
    expect(resolveWhatNowIntercept(open, "I lie", WHAT_NOW_STAY)).toEqual({
      kind: "pass",
      goTo: WHAT_NOW_STAY
    });
    expect(resolveWhatNowIntercept(open, "I'll have a whiskey.")).toEqual({ kind: "blocked" });
  });

  it("does not arm when she denies a room and invents hotels", () => {
    const session = makeSession({
      conversation: [
        {
          turn: 2,
          role: "character",
          content: "Actually, we don't have guest rooms here. I can recommend a few local hotels."
        }
      ]
    });
    expect(shouldArmWhatNowAfterTurn(session)).toBe(false);
  });

  it("arms when she offers to show her room", () => {
    const session = makeSession({
      conversation: [
        {
          turn: 4,
          role: "character",
          content: "If you'd like, I can show you. It's not much, but it's mine."
        }
      ]
    });
    expect(shouldArmWhatNowAfterTurn(session)).toBe(true);
  });

  it("arms when Look for words are in her line, not because the player said okay", () => {
    const session = makeSession({
      whatNowKeywords: ["last call"],
      conversation: [{ turn: 1, role: "character", content: "Last call, love." }]
    });
    expect(resolveWhatNowIntercept(session, "Okay.")).toEqual({ kind: "pass" });
    expect(shouldArmWhatNowAfterTurn(session)).toBe(true);
  });

  it("opens the matching trigger, not the other list", () => {
    const session = makeSession({
      whatNow: undefined,
      whatNowSets: [
        {
          id: "call",
          keywords: ["last call"],
          choices: [{ id: "a", label: "I stay for last call", room: WHAT_NOW_STAY }]
        },
        {
          id: "follow",
          keywords: ["follow me"],
          choices: [{ id: "b", label: "I go with her", room: "Emma's room" }]
        }
      ]
    });
    expect(resolveWhatNowIntercept(session, "She said last call")).toEqual({ kind: "open", setId: "call" });
    expect(resolveWhatNowIntercept(session, "I'll follow me out")).toEqual({ kind: "open", setId: "follow" });
  });
});

