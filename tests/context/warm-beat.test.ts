import { describe, it, expect } from "vitest";
import { assembleContext, isWarmBeat, metersFromSession } from "@context/ContextEngine";
import type { Session } from "@state/StateSchema";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    storyFlags: [],
    schemaVersion: 2,
    id: "s1",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 0,
    characters: {
      emma: {
        position: { value: "bar", lock: "unlocked" },
        mood: { value: "reserved", lock: "unlocked" }
      }
    },
    scene: { location: "downtown bar", environment: { lighting: "dim" } },
    relationships: {},
    layers: [],
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: [],
    openedRoomIds: [],
    partyIds: [],
    partyHoldIds: [],
    partyPendingIds: [],
    ...overrides
  };
}

describe("isWarmBeat", () => {
  it("gates on trust alone when no desire field is marked", () => {
    expect(isWarmBeat({ trust: 89 })).toBe(true);
    expect(isWarmBeat({ trust: 40 })).toBe(false);
    expect(isWarmBeat({ trust: 89, stats: [{ id: "boldness", label: "Boldness", value: 18 }] })).toBe(
      true
    );
  });

  it("uses the marked field's band, not a raw 0–100 threshold", () => {
    expect(isWarmBeat({ trust: 89, desireBand: "high" })).toBe(true);
    expect(isWarmBeat({ trust: 50, desireBand: "high" })).toBe(true);
    expect(isWarmBeat({ trust: 40, desireBand: "high" })).toBe(false);
    expect(isWarmBeat({ trust: 89, desireBand: "mid" })).toBe(true);
    expect(isWarmBeat({ trust: 50, desireBand: "mid" })).toBe(false);
    expect(isWarmBeat({ trust: 89, desireBand: "low" })).toBe(false);
  });
});

describe("metersFromSession desire band", () => {
  it("bands a 0–100 closeness field the same way as today", () => {
    const session = makeSession({
      characters: {
        emma: {
          position: { value: "bar", lock: "unlocked" },
          mood: { value: "reserved", lock: "unlocked" },
          stats: { desire: { value: 100, lock: "unlocked" } }
        }
      },
      relationships: {
        emma: {
          trust: { value: 89, lock: "unlocked" },
          familiarity: { value: 79, lock: "unlocked" },
          tension: { value: 5, lock: "unlocked" }
        }
      },
      ruleset: {
        name: "Närhet",
        attributes: [
          {
            id: "desire",
            name: "Längtan",
            kind: "number",
            min: 0,
            max: 100,
            description: "",
            highMeaning: "",
            lowMeaning: "",
            midMeaning: "",
            options: [],
            maxShift: 15,
            role: "desire"
          }
        ]
      }
    });
    expect(metersFromSession(session, "emma").desireBand).toBe("high");
    expect(isWarmBeat(metersFromSession(session, "emma"))).toBe(true);
  });

  it("treats 14/18 as high when that field is the closeness signal", () => {
    const session = makeSession({
      characters: {
        emma: {
          position: { value: "bar", lock: "unlocked" },
          mood: { value: "reserved", lock: "unlocked" },
          stats: { passion: { value: 14, lock: "unlocked" } }
        }
      },
      relationships: {
        emma: {
          trust: { value: 55, lock: "unlocked" },
          familiarity: { value: 20, lock: "unlocked" },
          tension: { value: 5, lock: "unlocked" }
        }
      },
      ruleset: {
        name: "Fantasy",
        attributes: [
          {
            id: "passion",
            name: "Passion",
            kind: "number",
            min: 1,
            max: 18,
            description: "",
            highMeaning: "",
            lowMeaning: "",
            midMeaning: "",
            options: [],
            maxShift: 1,
            role: "desire"
          }
        ]
      }
    });
    const meters = metersFromSession(session, "emma");
    expect(meters.desireBand).toBe("high");
    expect(isWarmBeat(meters)).toBe(true);
    expect(assembleContext(session).includedBlocks.some((block) => block.id === "closeness-this-beat-emma")).toBe(
      true
    );
  });

  it("does not use an unmarked 1–18 high as desire", () => {
    const session = makeSession({
      characters: {
        emma: {
          position: { value: "bar", lock: "unlocked" },
          mood: { value: "reserved", lock: "unlocked" },
          stats: { boldness: { value: 18, lock: "unlocked" } }
        }
      },
      relationships: {
        emma: {
          trust: { value: 40, lock: "unlocked" },
          familiarity: { value: 10, lock: "unlocked" },
          tension: { value: 5, lock: "unlocked" }
        }
      },
      ruleset: {
        name: "Fantasy",
        attributes: [
          {
            id: "boldness",
            name: "Boldness",
            kind: "number",
            min: 1,
            max: 18,
            description: "",
            highMeaning: "",
            lowMeaning: "",
            midMeaning: "",
            options: [],
            maxShift: 0
          }
        ]
      }
    });
    const meters = metersFromSession(session, "emma");
    expect(meters.desireBand).toBeUndefined();
    expect(isWarmBeat(meters)).toBe(false);
  });
});

