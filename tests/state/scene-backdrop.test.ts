import { describe, it, expect } from "vitest";
import { matchSceneRoom, sceneBackdrop } from "@state/sceneBackdrop";
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
      thumbDataUrl: "data:thumb-venue",
      imageDataUrl: "data:image-venue",
      rooms: [
        {
          description: "",
          fromRoomIds: [],
          gate: "open" as const,
          id: "room-emmas",
          label: "Emma's room",
          keywords: ["staff room", "emmas room"],
          thumbDataUrl: "data:thumb-emma",
          imageDataUrl: "data:image-emma"
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

function expectedBackdrop(
  thumb: string,
  image: string,
  extras: Array<{ thumbDataUrl: string; imageDataUrl: string }> = [],
  play: "fade" | "random" = "fade"
) {
  return {
    thumbDataUrl: thumb,
    imageDataUrl: image,
    pictures: [{ thumbDataUrl: thumb, imageDataUrl: image }, ...extras],
    picturePlay: extras.length > 0 ? play : "fade"
  };
}

describe("sceneBackdrop", () => {
  it("uses the venue picture at the bar", () => {
    expect(sceneBackdrop(makeSession())).toEqual(expectedBackdrop("data:thumb-venue", "data:image-venue"));
  });

  it("uses the room picture when the player is in that room, not the venue", () => {
    const session = makeSession({
      player: {
        position: { value: "Emma's room", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      }
    });
    expect(sceneBackdrop(session)).toEqual(expectedBackdrop("data:thumb-emma", "data:image-emma"));
  });

  it("uses the room picture when position names the room inside a longer phrase", () => {
    const session = makeSession({
      player: {
        position: { value: "in Emma's room", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      }
    });
    expect(sceneBackdrop(session)).toEqual(expectedBackdrop("data:thumb-emma", "data:image-emma"));
  });

  it("matches Emmas room without an apostrophe to the room picture", () => {
    const session = makeSession({
      player: {
        position: { value: "Emmas room", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      }
    });
    expect(sceneBackdrop(session)).toEqual(expectedBackdrop("data:thumb-emma", "data:image-emma"));
  });

  it("does not fall back to the bar when a named room has no picture", () => {
    const session = makeSession({
      player: {
        position: { value: "Emma's room", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      },
      scene: {
        location: "The Aurora Room — a quiet late-night bar",
        environment: { lighting: "low" },
        imageDataUrl: "data:image-venue",
        rooms: [{
          description: "",
          fromRoomIds: [],
          gate: "open" as const,
          id: "room-emmas", label: "Emma's room", keywords: ["staff room"] }]
      }
    });
    expect(sceneBackdrop(session)).toEqual({ pictures: [], picturePlay: "fade" });
  });

  it("does not keep the bar photo when the player is in a named room with no picture on the session", () => {
    const session = makeSession({
      player: {
        position: { value: "Emma's room", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      },
      scene: {
        location: "The Aurora Room — a quiet late-night bar",
        environment: { lighting: "low" },
        thumbDataUrl: "data:thumb-venue",
        imageDataUrl: "data:image-venue",
        rooms: []
      }
    });
    expect(sceneBackdrop(session)).toEqual({ pictures: [], picturePlay: "fade" });
  });

  it("exposes extra room pictures and the play mode", () => {
    const session = makeSession({
      player: {
        position: { value: "Emma's room", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      },
      scene: {
        location: "The Aurora Room — a quiet late-night bar",
        environment: { lighting: "low" },
        thumbDataUrl: "data:thumb-venue",
        imageDataUrl: "data:image-venue",
        rooms: [
          {
            description: "",
            fromRoomIds: [],
            gate: "open" as const,
            id: "room-emmas",
            label: "Emma's room",
            keywords: ["staff room"],
            thumbDataUrl: "data:thumb-emma",
            imageDataUrl: "data:image-emma",
            gallery: [{ thumbDataUrl: "data:thumb-emma-2", imageDataUrl: "data:image-emma-2" }],
            picturePlay: "random"
          }
        ]
      }
    });
    expect(sceneBackdrop(session)).toEqual(
      expectedBackdrop(
        "data:thumb-emma",
        "data:image-emma",
        [{ thumbDataUrl: "data:thumb-emma-2", imageDataUrl: "data:image-emma-2" }],
        "random"
      )
    );
  });

  it("matches staff room as Emma's room", () => {
    expect(matchSceneRoom("staff room", makeSession().scene!.rooms!)?.id).toBe("room-emmas");
  });

  it("uses the realm picture when the landmark has none", () => {
    const session = makeSession({
      scene: {
        location: "A cave mouth",
        realm: "The Hollow",
        environment: {},
        realmVisual: {
          thumbDataUrl: "data:thumb-realm",
          imageDataUrl: "data:image-realm"
        }
      }
    });
    expect(sceneBackdrop(session).imageDataUrl).toBe("data:image-realm");
  });
});

