import { describe, it, expect } from "vitest";
import { sceneAudio } from "@state/sceneAudio";
import { EXAMPLE_AURORA_ROOMS } from "@library/exampleTemplates";
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
      audioDataUrl: "data:audio/mpeg;base64,venue",
      rooms: [
        {
          description: "",
          fromRoomIds: [],
          gate: "open" as const,
          id: "room-emmas",
          label: "Emma's room",
          keywords: ["staff room", "emmas room"],
          audioDataUrl: "data:audio/mpeg;base64,emma"
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

describe("sceneAudio", () => {
  it("uses the venue loop at the bar", () => {
    expect(sceneAudio(makeSession())).toEqual({
      clips: ["data:audio/mpeg;base64,venue"],
      audioPlay: "fade"
    });
  });

  it("keeps the venue loop when the player is at the venue name", () => {
    const session = makeSession({
      player: {
        position: { value: "The Aurora Room — a quiet late-night bar", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      },
      scene: {
        location: "The Aurora Room — a quiet late-night bar",
        environment: { lighting: "low" },
        audioDataUrl: "data:audio/mpeg;base64,venue",
        rooms: EXAMPLE_AURORA_ROOMS
      }
    });
    expect(sceneAudio(session)).toEqual({
      clips: ["data:audio/mpeg;base64,venue"],
      audioPlay: "fade"
    });
  });

  it("uses the room loop when the player is in that room, not the venue", () => {
    const session = makeSession({
      player: {
        position: { value: "Emma's room", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      }
    });
    expect(sceneAudio(session)).toEqual({
      clips: ["data:audio/mpeg;base64,emma"],
      audioPlay: "fade"
    });
  });

  it("goes quiet in a named room with no sound instead of keeping the bar loop", () => {
    const session = makeSession({
      player: {
        position: { value: "Emma's room", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      },
      scene: {
        location: "The Aurora Room — a quiet late-night bar",
        environment: { lighting: "low" },
        audioDataUrl: "data:audio/mpeg;base64,venue",
        rooms: [{
          description: "",
          fromRoomIds: [],
          gate: "open" as const,
          id: "room-emmas", label: "Emma's room", keywords: ["staff room"] }]
      }
    });
    expect(sceneAudio(session)).toEqual({ clips: [], audioPlay: "fade" });
  });

  it("exposes extra room loops and the play mode", () => {
    const session = makeSession({
      player: {
        position: { value: "Emma's room", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      },
      scene: {
        location: "The Aurora Room — a quiet late-night bar",
        environment: { lighting: "low" },
        audioDataUrl: "data:audio/mpeg;base64,venue",
        rooms: [
          {
            description: "",
            fromRoomIds: [],
            gate: "open" as const,
            id: "room-emmas",
            label: "Emma's room",
            keywords: ["staff room"],
            audioDataUrl: "data:audio/mpeg;base64,emma",
            audioGallery: ["data:audio/mpeg;base64,emma-2"],
            audioPlay: "random"
          }
        ]
      }
    });
    expect(sceneAudio(session)).toEqual({
      clips: ["data:audio/mpeg;base64,emma", "data:audio/mpeg;base64,emma-2"],
      audioPlay: "random"
    });
  });
});

