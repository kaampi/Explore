import { describe, it, expect } from "vitest";
import { hereIntro, herePrompt } from "@state/placeIntro";
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
    scene: {
      location: "The Aurora Room — a quiet late-night bar",
      environment: { lighting: "low" },
      note: "A quiet late-night bar. Jazz on the speakers.",
      rooms: [
        {
          fromRoomIds: [],
          gate: "open" as const,
          id: "room-emmas",
          label: "Emma's room",
          keywords: ["staff room"],
          description: "A narrow bed, a chair, curtains drawn."
        }
      ]
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

describe("hereIntro", () => {
  it("uses the venue intro at the bar", () => {
    expect(hereIntro(makeSession())).toEqual({
      title: "at the bar",
      body: "A quiet late-night bar. Jazz on the speakers.",
      room: false
    });
  });

  it("uses the room intro when the player is in that room, not the bar", () => {
    const session = makeSession({
      player: {
        position: { value: "Emma's room", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      }
    });
    expect(hereIntro(session)).toEqual({
      title: "Emma's room",
      body: "A narrow bed, a chair, curtains drawn.",
      room: true
    });
  });

  it("does not fall back to the bar intro when a named room has no description", () => {
    const session = makeSession({
      player: {
        position: { value: "Emma's room", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      },
      scene: {
        location: "The Aurora Room — a quiet late-night bar",
        environment: { lighting: "low" },
        note: "A quiet late-night bar.",
        rooms: [{
          description: "",
          fromRoomIds: [],
          gate: "open" as const,
          id: "room-emmas", label: "Emma's room", keywords: ["staff room"] }]
      }
    });
    expect(hereIntro(session)).toBeUndefined();
  });
});

describe("herePrompt", () => {
  it("uses the compact venue text, not the long intro", () => {
    const session = makeSession({
      scene: {
        location: "The Aurora Room — a quiet late-night bar",
        environment: { lighting: "low" },
        note: "A long typewriter intro about every shadow and door.",
        brief:
          "The Aurora Room is a hidden, atmospheric jazz bar with subdued lighting, weathered wooden surfaces and dark doors lurking in the shadows.",
        rooms: [
          {
            fromRoomIds: [],
            gate: "open" as const,
            id: "room-emmas",
            label: "Emma's room",
            keywords: ["staff room"],
            description: "A narrow bed, a chair, curtains drawn."
          }
        ]
      }
    });
    expect(hereIntro(session)?.body).toBe("A long typewriter intro about every shadow and door.");
    expect(herePrompt(session)).toEqual({
      title: "at the bar",
      body: "The Aurora Room is a hidden, atmospheric jazz bar with subdued lighting, weathered wooden surfaces and dark doors lurking in the shadows.",
      room: false
    });
  });

  it("falls back to the intro when For the model is empty", () => {
    expect(herePrompt(makeSession())).toEqual(hereIntro(makeSession()));
  });

  it("uses the room brief when the player is in that room", () => {
    const session = makeSession({
      player: {
        position: { value: "Emma's room", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      },
      scene: {
        location: "The Aurora Room — a quiet late-night bar",
        environment: { lighting: "low" },
        note: "A quiet late-night bar. Jazz on the speakers.",
        rooms: [
          {
            fromRoomIds: [],
            gate: "open" as const,
            id: "room-emmas",
            label: "Emma's room",
            keywords: ["staff room"],
            description: "A long walk-in intro for the picture.",
            brief: "A narrow staff room. Bed, chair, curtains drawn."
          }
        ]
      }
    });
    expect(hereIntro(session)?.body).toBe("A long walk-in intro for the picture.");
    expect(herePrompt(session)).toEqual({
      title: "Emma's room",
      body: "A narrow staff room. Bed, chair, curtains drawn.",
      room: true
    });
  });
});

