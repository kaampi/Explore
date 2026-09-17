import { describe, it, expect } from "vitest";
import { focusCharacterId, lastCharacterSpeaker, othersInScene } from "@state/sceneFocus";
import type { Session } from "@state/StateSchema";

function makeSession(): Session {
  return {
    schemaVersion: 2,
    id: "group",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 0,
    characters: {
      emma: {
        name: "Emma",
        familyName: "Miller",
        pronoun: "she",
        position: { value: "behind the bar", lock: "unlocked" },
        mood: { value: "friendly", lock: "unlocked" }
      },
      pierre: {
        name: "Pierre",
        pronoun: "he",
        position: { value: "at the counter", lock: "unlocked" },
        mood: { value: "friendly", lock: "unlocked" }
      }
    },
    relationships: {},
    layers: [],
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: [],
    player: {
      position: { value: "at the bar", lock: "unlocked" },
      status: { value: "awake", lock: "unlocked" }
    }
  };
}

describe("focusCharacterId", () => {
  it("routes a named address to that person", () => {
    const session = makeSession();
    expect(focusCharacterId(session, "Pierre, what are you drinking?")).toBe("pierre");
    expect(focusCharacterId(session, "Hi Emma")).toBe("emma");
  });

  it("routes sitting next to a man to the only he", () => {
    expect(focusCharacterId(makeSession(), "*I sit down next to a man at the counter* A beer please")).toBe(
      "pierre"
    );
  });

  it("keeps the last speaker when the line names no one", () => {
    const session = makeSession();
    session.conversation = [
      { turn: 1, role: "player", content: "Hi Pierre", speaker: undefined },
      { turn: 2, role: "character", speaker: "pierre", content: "Hey." }
    ];
    expect(lastCharacterSpeaker(session)).toBe("pierre");
    expect(focusCharacterId(session, "A beer please")).toBe("pierre");
  });

  it("falls back to the first cast member on an empty scene line", () => {
    expect(focusCharacterId(makeSession(), "Hi")).toBe("emma");
  });

  it("does not keep a last speaker who stayed behind", () => {
    const session = makeSession();
    session.player = {
      position: { value: "Market Streets", lock: "unlocked" },
      status: { value: "awake", lock: "unlocked" }
    };
    session.characters.emma.position = { value: "Emma's room", lock: "unlocked" };
    session.conversation = [
      { turn: 1, role: "player", content: "Hi", speaker: undefined },
      { turn: 2, role: "character", speaker: "emma", content: "Stay." }
    ];
    session.characters.pierre.position = { value: "Market Streets", lock: "unlocked" };
    expect(focusCharacterId(session, "I walk to Market Streets.")).toBe("pierre");
  });
});

describe("othersInScene", () => {
  it("lists people with the focus, not a leftover roommate after the player leaves", () => {
    const session = makeSession();
    session.player = {
      position: { value: "Market Streets", lock: "unlocked" },
      status: { value: "awake", lock: "unlocked" }
    };
    session.characters.emma.position = { value: "Emma's room", lock: "unlocked" };
    session.characters.pierre.position = { value: "Emma's room", lock: "unlocked" };
    expect(othersInScene(session, "emma")).toEqual([]);
  });
});
