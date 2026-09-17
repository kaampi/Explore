import { describe, it, expect } from "vitest";
import { draftSceneHandoff } from "@state/sceneHandoff";
import type { Session } from "@state/StateSchema";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    schemaVersion: 2,
    id: "s1",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 0,
    characters: {},
    scene: { location: "The Aurora Room" },
    relationships: {},
    layers: [],
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: [],
    player: {
      position: { value: "The Aurora Room", lock: "unlocked" },
      status: { value: "awake", lock: "unlocked" }
    },
    ...overrides
  };
}

describe("draftSceneHandoff", () => {
  it("keeps the written agreement", () => {
    expect(draftSceneHandoff(makeSession({ outgoingHandoff: "He asked to sleep. No sex." }))).toBe(
      "He asked to sleep. No sex."
    );
  });

  it("seeds from the last player line when the field is empty", () => {
    expect(
      draftSceneHandoff(
        makeSession({
          handoff: "He asked to sleep. No sex.",
          conversation: [
            { turn: 1, role: "player", content: "I just need to sleep." },
            { turn: 2, role: "character", speaker: "emma", content: "She unbuttons her blouse." }
          ]
        })
      )
    ).toBe("Left The Aurora Room. They said: I just need to sleep.");
  });

  it("uses the outgoing note, not why they arrived", () => {
    expect(
      draftSceneHandoff(
        makeSession({
          handoff: "He asked to sleep. No sex.",
          outgoingHandoff: "We fled to the cabin together."
        })
      )
    ).toBe("We fled to the cabin together.");
  });
});
