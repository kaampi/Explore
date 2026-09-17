import { describe, it, expect } from "vitest";
import { isStale, nextVersion, hashState, createSnapshot } from "@state/StateVersioning";
import type { Session } from "@state/StateSchema";

function baseSession(): Session {
  return {
    schemaVersion: 2,
    id: "s1",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 5,
    characters: {
      emma: {
        position: { value: "table", lock: "unlocked" },
        mood: { value: "calm", lock: "unlocked" }
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

describe("StateVersioning", () => {
  it("treats a matching version as not stale", () => {
    expect(isStale(5, 5)).toBe(false);
  });

  it("treats a mismatched version as stale", () => {
    expect(isStale(4, 5)).toBe(true);
  });

  it("increments version by exactly one", () => {
    expect(nextVersion(5)).toBe(6);
  });

  it("produces the same hash for the same state regardless of key order", () => {
    const a = baseSession();
    const b = {
      ...baseSession(),
      characters: {
        emma: {
          mood: { value: "calm", lock: "unlocked" as const },
          position: { value: "table", lock: "unlocked" as const }
        }
      }
    };
    expect(hashState(a)).toBe(hashState(b));
  });

  it("produces a different hash when state actually differs", () => {
    const a = baseSession();
    const b = { ...baseSession(), stateVersion: 6 };
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it("createSnapshot captures the current version and a timestamp", () => {
    const session = baseSession();
    const snapshot = createSnapshot(session);
    expect(snapshot.stateVersion).toBe(5);
    expect(snapshot.hash).toBe(hashState(session));
    expect(() => new Date(snapshot.takenAt).toISOString()).not.toThrow();
  });
});
