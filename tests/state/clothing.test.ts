import { describe, it, expect } from "vitest";
import { dressForPublicBarWrites, isUndressedClothing, playerKeepsUndressed } from "@state/clothing";
import { EXAMPLE_AURORA_ROOMS } from "@library/exampleTemplates";
import type { Session } from "@state/StateSchema";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    schemaVersion: 2,
    id: "s1",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 0,
    characters: {
      emma: {
        name: "Emma",
        position: { value: "behind the bar", lock: "unlocked" },
        mood: { value: "content, loving", lock: "unlocked" },
        clothing: { value: "nude", lock: "unlocked" }
      }
    },
    scene: {
      location: "The Aurora Room — a quiet late-night bar",
      environment: {},
      rooms: EXAMPLE_AURORA_ROOMS
    },
    player: {
      position: { value: "at the bar", lock: "unlocked" },
      status: { value: "awake", lock: "unlocked" }
    },
    relationships: {},
    layers: [],
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: [],
    ...overrides
  };
}

describe("isUndressedClothing", () => {
  it("treats nude and a towel as undressed", () => {
    expect(isUndressedClothing("nude")).toBe(true);
    expect(isUndressedClothing("a towel")).toBe(true);
    expect(isUndressedClothing("a bartender's apron over indoor clothes")).toBe(false);
  });
});

describe("dressForPublicBarWrites", () => {
  it("dresses her for work when she is nude behind the bar", () => {
    expect(dressForPublicBarWrites(makeSession(), "I sit at the bar", "emma")).toEqual([
      { path: "characters.emma.clothing", value: "a bartender's apron over indoor clothes" }
    ]);
  });

  it("leaves nude alone in a private room", () => {
    const session = makeSession({
      characters: {
        emma: {
          name: "Emma",
          position: { value: "Emma's room", lock: "unlocked" },
          mood: { value: "content", lock: "unlocked" },
          clothing: { value: "nude", lock: "unlocked" }
        }
      }
    });
    expect(dressForPublicBarWrites(session, "I look at her", "emma")).toEqual([]);
  });

  it("honors the player asking her to stay undressed", () => {
    expect(playerKeepsUndressed("Stay nude behind the bar")).toBe(true);
    expect(dressForPublicBarWrites(makeSession(), "Stay nude behind the bar", "emma")).toEqual([]);
  });
});
