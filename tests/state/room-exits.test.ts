import { describe, it, expect } from "vitest";
import { destinationRoomFromPlayerText, ROOM_FROM_LANDMARK } from "@state/playerDestination";
import { mapExits } from "@state/roomExits";
import { roomIdsNamedInText } from "@state/roomGate";
import type { Session } from "@state/StateSchema";

const rooms = [
  {
    id: "room-emmas",
    label: "Emma's room",
    keywords: ["staff room", "her room"],
    description: "",
    fromRoomIds: [ROOM_FROM_LANDMARK],
    gate: "locked" as const
  },
  {
    id: "room-toilets",
    label: "toilets",
    keywords: ["gents"],
    description: "",
    fromRoomIds: [ROOM_FROM_LANDMARK],
    gate: "open" as const
  },
  {
    id: "room-secret",
    label: "secret room",
    keywords: ["hidden door"],
    description: "",
    fromRoomIds: [ROOM_FROM_LANDMARK],
    gate: "hidden" as const
  }
];

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
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
    scene: { location: "The Aurora Room — a quiet late-night bar", environment: {}, rooms },
    player: {
      position: { value: "at the bar", lock: "unlocked" },
      status: { value: "awake", lock: "unlocked" }
    },
    openedRoomIds: [],
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

describe("mapExits", () => {
  it("from the bar: open rooms as buttons, locked visible but shut, hidden omitted", () => {
    const exits = mapExits(makeSession());
    expect(exits.map((item) => item.label)).toEqual(["Emma's room", "toilets"]);
    expect(exits.find((item) => item.id === "room-toilets")?.enabled).toBe(true);
    expect(exits.find((item) => item.id === "room-emmas")?.enabled).toBe(false);
    expect(exits.some((item) => item.id === "room-secret")).toBe(false);
  });

  it("from the toilets: only the landmark", () => {
    const exits = mapExits(
      makeSession({
        player: {
          position: { value: "toilets", lock: "unlocked" },
          status: { value: "awake", lock: "unlocked" }
        }
      })
    );
    expect(exits).toEqual([
      {
        id: ROOM_FROM_LANDMARK,
        label: "The Aurora Room",
        dest: "at the bar",
        enabled: true,
        kind: "landmark"
      }
    ]);
  });

  it("shows a hidden room after it is named", () => {
    const session = makeSession({ openedRoomIds: ["room-secret"] });
    expect(mapExits(session).some((item) => item.id === "room-secret" && item.enabled)).toBe(true);
  });
});

describe("locked and hidden walks", () => {
  it("does not walk into a closed room until it is opened", () => {
    expect(destinationRoomFromPlayerText("I walk into Emma's room", makeSession())).toBeUndefined();
    expect(
      destinationRoomFromPlayerText(
        "I walk into Emma's room",
        makeSession({ openedRoomIds: ["room-emmas"] })
      )
    ).toBe("Emma's room");
  });

  it("still walks into an open listed room", () => {
    expect(destinationRoomFromPlayerText("I walk to the toilets", makeSession())).toBe("toilets");
  });

  it("opens a hidden room when chat names it", () => {
    expect(roomIdsNamedInText(makeSession(), "I found a hidden door")).toEqual(["room-secret"]);
  });

  it("does not offer an unlinked room from Emma's room", () => {
    const session = makeSession({
      scene: {
        location: "The Aurora Room — a quiet late-night bar",
        environment: {},
        rooms: [
          ...rooms,
          {
            id: "room-entrance",
            label: "Entrance",
            keywords: [],
            description: "",
            fromRoomIds: [],
            gate: "open"
          }
        ]
      },
      openedRoomIds: ["room-emmas"],
      player: {
        position: { value: "Emma's room", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      }
    });
    expect(mapExits(session).map((item) => item.label)).toEqual(["The Aurora Room"]);
    expect(destinationRoomFromPlayerText("I walk to the Entrance", session)).toBeUndefined();
  });

  it("walks back along a door: cellar to Main room", () => {
    const session = makeSession({
      scene: {
        location: "Old womans cabin",
        environment: {},
        rooms: [
          { id: "main", label: "Main room", keywords: [], description: "", fromRoomIds: [ROOM_FROM_LANDMARK], gate: "open" },
          {
            id: "cellar",
            label: "Cellar",
            keywords: ["secret hatch"],
            description: "",
            fromRoomIds: ["main"],
            gate: "open"
          }
        ]
      },
      player: {
        position: { value: "Cellar", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      }
    });
    expect(mapExits(session).map((item) => item.label)).toEqual(["Main room"]);
    expect(destinationRoomFromPlayerText("I walk back to the Main room", session)).toBe("Main room");
  });
});
