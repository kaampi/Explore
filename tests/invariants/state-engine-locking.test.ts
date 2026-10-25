import { describe, it, expect, beforeEach } from "vitest";
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
        mood: { value: "angry", lock: "unlocked" }
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

describe("StateEngine.proposeLockChange", () => {
  let engine: StateEngine;
  let eventLog: EventLog;

  beforeEach(() => {
    eventLog = new EventLog();
    engine = new StateEngine(makeSession(), eventLog);
  });

  it("lets the player lock a field", () => {
    const result = engine.proposeLockChange({
      path: "characters.emma.mood",
      requestedLock: "player_locked",
      source: "player_manual_state",
      expectedStateVersion: 0
    });

    expect(result.committed).toBe(true);
    expect(engine.getSession().characters.emma?.mood.lock).toBe("player_locked");
    expect(eventLog.last()?.type).toBe("lock_state_changed");
  });

  it("rejects the AI trying to lock or unlock a field", () => {
    const result = engine.proposeLockChange({
      path: "characters.emma.mood",
      requestedLock: "player_locked",
      source: "ai_approved_state_mutation",
      expectedStateVersion: 0
    });

    expect(result.committed).toBe(false);
    expect(engine.getSession().characters.emma?.mood.lock).toBe("unlocked");
  });

  it("locking a field then immediately blocks an AI value mutation on it", () => {
    engine.proposeLockChange({
      path: "characters.emma.mood",
      requestedLock: "player_locked",
      source: "player_manual_state",
      expectedStateVersion: 0
    });

    // state version has advanced to 1 after the lock change
    const mutationResult = engine.proposeMutation({
      path: "characters.emma.mood",
      value: "calm",
      source: "ai_approved_state_mutation",
      expectedStateVersion: 1
    });

    expect(mutationResult.committed).toBe(false);
    expect(engine.getSession().characters.emma?.mood.value).toBe("angry");
  });

  it("rejects a stale lock-change proposal", () => {
    const result = engine.proposeLockChange({
      path: "characters.emma.mood",
      requestedLock: "player_locked",
      source: "player_manual_state",
      expectedStateVersion: 999
    });

    expect(result.committed).toBe(false);
  });
});

