import { describe, it, expect } from "vitest";
import { StateEngine } from "@state/StateEngine";
import { EventLog } from "@events/EventLog";
import type { Session } from "@state/StateSchema";

function makeSession(): Session {
  return {
    openedRoomIds: [],
    storyFlags: [],
    partyIds: [],
    partyHoldIds: [],
    partyPendingIds: [],
    schemaVersion: 2,
    id: "test-session",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 0,
    characters: {
      emma: {
        position: { value: "table", lock: "unlocked" },
        mood: { value: "angry", lock: "player_locked" }
      }
    },
    relationships: {},
    layers: [],
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: []
  };
}

describe("Invariant: UI may not mutate canonical state without going through State Engine", () => {
  it("throws when writing to a top-level field on the returned session", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    const session = engine.getSession();

    expect(() => {
      // @ts-expect-error deliberately bypassing the type system, like a
      // careless UI call site might.
      session.stateVersion = 999;
    }).toThrow(TypeError);
  });

  it("throws when writing to a nested field on the returned session", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    const session = engine.getSession();

    expect(() => {
      // @ts-expect-error same as above, nested this time.
      session.characters.emma.mood.value = "calm";
    }).toThrow(TypeError);
  });

  it("does not let a mutated snapshot leak back into the engine's internal state", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    const firstSnapshot = engine.getSession();

    try {
      // @ts-expect-error deliberate bypass attempt
      firstSnapshot.characters.emma.mood.value = "calm";
    } catch {
      // expected to throw; ignore for this assertion
    }

    const secondSnapshot = engine.getSession();
    expect(secondSnapshot.characters.emma?.mood.value).toBe("angry");
  });

  it("legitimate mutation through proposeMutation still works", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    const result = engine.proposeMutation({
      path: "characters.emma.position",
      value: "bar",
      source: "player_manual_state",
      expectedStateVersion: 0
    });

    expect(result.committed).toBe(true);
    expect(engine.getSession().characters.emma?.position.value).toBe("bar");
  });
});

