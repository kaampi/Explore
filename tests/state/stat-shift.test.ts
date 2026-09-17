import { describe, it, expect } from "vitest";
import { StateEngine } from "@state/StateEngine";
import { EventLog } from "@events/EventLog";
import { parseSession, type Session } from "@state/StateSchema";
import { clampAiStatValue, movableStatsForCharacter } from "@state/statShift";

function makeSession(): Session {
  return parseSession({
    schemaVersion: 2,
    id: "stats-live",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 0,
    ruleset: {
      name: "Närhet",
      attributes: [
        {
          id: "arousal",
          name: "Arousal",
          kind: "number",
          min: 0,
          max: 100,
          maxShift: 15,
          description: "",
          highMeaning: "",
          lowMeaning: "",
          midMeaning: "",
          options: []
        },
        {
          id: "boldness",
          name: "Boldness",
          kind: "number",
          min: 0,
          max: 100,
          maxShift: 3,
          description: "",
          highMeaning: "",
          lowMeaning: "",
          midMeaning: "",
          options: []
        },
        {
          id: "strength",
          name: "Styrka",
          kind: "number",
          min: 1,
          max: 18,
          maxShift: 0,
          description: "",
          highMeaning: "",
          lowMeaning: "",
          midMeaning: "",
          options: []
        }
      ]
    },
    characters: {
      emma: {
        position: { value: "bar", lock: "unlocked" },
        mood: { value: "warm", lock: "unlocked" },
        stats: {
          arousal: { value: 40, lock: "unlocked" },
          boldness: { value: 50, lock: "unlocked" },
          strength: { value: 12, lock: "unlocked" }
        }
      }
    },
    relationships: {},
    layers: [],
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: []
  });
}

describe("clampAiStatValue", () => {
  it("caps a jump to ±maxShift inside the field scale", () => {
    expect(clampAiStatValue(40, 100, { min: 0, max: 100, maxShift: 15 })).toBe(55);
    expect(clampAiStatValue(40, 0, { min: 0, max: 100, maxShift: 15 })).toBe(25);
    expect(clampAiStatValue(50, 80, { min: 0, max: 100, maxShift: 3 })).toBe(53);
  });
});

describe("Pass 2 rule-set stats", () => {
  it("lists only fields whose maxShift is above 0", () => {
    expect(movableStatsForCharacter(makeSession(), "emma").map((row) => row.id)).toEqual([
      "arousal",
      "boldness"
    ]);
  });

  it("lets a kiss raise arousal, but only by the field's cap", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    const result = engine.proposeMutation({
      path: "characters.emma.stats.arousal",
      value: 90,
      source: "ai_approved_state_mutation",
      expectedStateVersion: 0
    });
    expect(result.committed).toBe(true);
    expect(engine.getSession().characters.emma?.stats?.arousal.value).toBe(55);
  });

  it("nudges boldness a little", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    engine.proposeMutation({
      path: "characters.emma.stats.boldness",
      value: 80,
      source: "ai_approved_state_mutation",
      expectedStateVersion: 0
    });
    expect(engine.getSession().characters.emma?.stats?.boldness.value).toBe(53);
  });

  it("rejects AI writes on a frozen field", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    const result = engine.proposeMutation({
      path: "characters.emma.stats.strength",
      value: 16,
      source: "ai_approved_state_mutation",
      expectedStateVersion: 0
    });
    expect(result.committed).toBe(false);
    expect(engine.getSession().characters.emma?.stats?.strength.value).toBe(12);
  });

  it("lets the player set a frozen field anyway", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    const result = engine.proposeMutation({
      path: "characters.emma.stats.strength",
      value: 16,
      source: "player_manual_state",
      expectedStateVersion: 0
    });
    expect(result.committed).toBe(true);
    expect(engine.getSession().characters.emma?.stats?.strength.value).toBe(16);
  });
});
