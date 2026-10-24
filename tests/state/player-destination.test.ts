import { describe, it, expect } from "vitest";
import { destinationRoomFromPlayerText, destinationPlaceFromPlayerText, dropAiPlayerPosition, filterUninvitedFollowProposals, sideRoomStage, spatialWritesForTurn, beatLocation, venueBuildingName, venueFloorToken, WHAT_NOW_FLOOR, WHAT_NOW_STAY, sceneStageKey, sceneStageLabel, sceneContinuesAfterNight } from "@state/playerDestination";
import { matchRoomMention } from "@state/WorldCanon";
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
    scene: { location: "The Aurora Room — a quiet late-night bar", environment: {} },
    player: {
      position: { value: "at the bar", lock: "unlocked" },
      status: { value: "awake", lock: "unlocked" }
    },
    relationships: {},
    layers: [
      {
        id: "place-1",
        type: "environment",
        priority: 0,
        content:
          "Adjoining the bar: toilets off the hall, Emma's room behind the staff door, a guest room upstairs, and a cellar door behind the bar.",
        active: true,
        aiGenerated: false
      }
    ],
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: [],
    ...overrides
  };
}

describe("destinationRoomFromPlayerText", () => {
  it("reads a walk into Emma's room, with or without the apostrophe", () => {
    expect(destinationRoomFromPlayerText("I walk into Emma's room", makeSession())).toBe("Emma's room");
    expect(destinationRoomFromPlayerText("I walk into Emmas room", makeSession())).toBe("Emma's room");
  });
  it("reads climbing into her bed as Emma's room", () => {
    expect(
      destinationRoomFromPlayerText("*I climb donw into her bed*", makeSession())
    ).toBe("Emma's room");
  });

  it("reads staff room and Swedish as the same place", () => {
    expect(destinationRoomFromPlayerText("*I walk into her staff room*", makeSession())).toBe("Emma's room");
    expect(destinationRoomFromPlayerText("Jag går in i Emmas rum", makeSession())).toBe("Emma's room");
  });

  it("does not teleport on a question about the room", () => {
    expect(destinationRoomFromPlayerText("Where is Emma's room?", makeSession())).toBeUndefined();
  });

  it("does not invent a hotel", () => {
    expect(destinationRoomFromPlayerText("I walk into a hotel", makeSession())).toBeUndefined();
  });

  it("does nothing when the map has no named rooms", () => {
    expect(
      destinationRoomFromPlayerText(
        "I walk into Emma's room",
        makeSession({ layers: [] })
      )
    ).toBeUndefined();
  });
});

describe("sideRoomStage", () => {
  it("treats the player's live room as the stage", () => {
    expect(
      sideRoomStage(
        makeSession({
          player: {
            position: { value: "Emma's room", lock: "unlocked" },
            status: { value: "awake", lock: "unlocked" }
          }
        })
      )
    ).toBe("Emma's room");
  });

  it("does not treat the bar as a side room", () => {
    expect(sideRoomStage(makeSession())).toBeUndefined();
  });

  it("treats a stored Emmas room without apostrophe as the same stage", () => {
    expect(
      sideRoomStage(
        makeSession({
          player: {
            position: { value: "Emmas room", lock: "unlocked" },
            status: { value: "awake", lock: "unlocked" }
          }
        })
      )
    ).toBe("Emma's room");
  });
});

describe("beatLocation", () => {
  it("prefers the named room over the bar venue", () => {
    expect(
      beatLocation(
        makeSession({
          player: {
            position: { value: "Emma's room", lock: "unlocked" },
            status: { value: "awake", lock: "unlocked" }
          }
        })
      )
    ).toBe("Emma's room");
  });

  it("strips the bar tagline from the venue name", () => {
    expect(venueBuildingName("The Aurora Room — a quiet late-night bar")).toBe("The Aurora Room");
  });
});

describe("sceneStageKey", () => {
  it("treats at the bar and behind the bar as the same venue scene", () => {
    const atBar = makeSession();
    const behind = makeSession({
      player: {
        position: { value: "behind the bar", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      }
    });
    expect(sceneStageKey(atBar)).toBe(sceneStageKey(behind));
    expect(sceneStageLabel(atBar)).toBe("The Aurora Room");
  });

  it("treats Emma's room as a different scene from the bar", () => {
    const bar = makeSession();
    const room = makeSession({
      player: {
        position: { value: "Emma's room", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      }
    });
    expect(sceneStageKey(bar)).not.toBe(sceneStageKey(room));
    expect(sceneStageLabel(room)).toBe("Emma's room");
  });
});

describe("spatialWritesForTurn", () => {
  it("moves both people into Emma's room and clears a bar pose on a bed beat", () => {
    const session = makeSession({
      characters: {
        emma: {
          name: "Emma",
          position: { value: "behind the bar", lock: "unlocked" },
          mood: { value: "reserved", lock: "unlocked" },
          pose: { value: "polishing a glass", lock: "unlocked" }
        }
      }
    });
    expect(
      spatialWritesForTurn(
        session,
        "*I climb donw into her bed* *I lay in a spoon postion with Emma behind me* Can you hold me Emma.",
        "emma"
      )
    ).toEqual([
      { path: "player.position", value: "Emma's room" },
      { path: "characters.emma.position", value: "Emma's room" },
      { path: "characters.emma.pose", value: "" }
    ]);
  });

  it("wakes the player when they walk into a named room", () => {
    const session = makeSession({
      player: {
        position: { value: "The Aurora Room", lock: "unlocked" },
        status: { value: "asleep", lock: "unlocked" }
      }
    });
    expect(spatialWritesForTurn(session, "I walk into Emmas room", "emma")).toEqual(
      expect.arrayContaining([
        { path: "player.position", value: "Emma's room" },
        { path: "player.status", value: "awake" },
        { path: "characters.emma.position", value: "Emma's room" }
      ])
    );
  });

  it("does not drag her to the toilets", () => {
    expect(spatialWritesForTurn(makeSession(), "I walk into the toilets", "emma")).toEqual([
      { path: "player.position", value: "toilets" }
    ]);
  });

  it("on let's go, uses the room the player last named; Emma's room still has Emma in it", () => {
    const session = makeSession({
      characters: {
        emma: {
          name: "Emma",
          position: { value: "behind the bar", lock: "unlocked" },
          mood: { value: "reserved", lock: "unlocked" }
        }
      },
      conversation: [
        { turn: 1, role: "character", speaker: "emma", content: "You could take the guest room upstairs." },
        { turn: 2, role: "player", content: "What about Emma's room?" },
        { turn: 3, role: "character", speaker: "emma", content: "You can sleep in my room." },
        { turn: 4, role: "player", content: "Let's go." }
      ]
    });
    expect(spatialWritesForTurn(session, "Let's go.", "emma")).toEqual([
      { path: "player.position", value: "Emma's room" },
      { path: "characters.emma.position", value: "Emma's room" }
    ]);
  });

  it("does not walk because a reply or relic named a room", () => {
    const session = makeSession({
      conversation: [
        {
          turn: 1,
          role: "character",
          speaker: "vikky",
          content: "Aye, I'm in. Emma's room is just through that door. She nods towards the staff door."
        }
      ],
      objects: [{ tags: [], id: "key", name: "Guest-house key", note: "Unlocks Emma's room behind the staff door." }]
    });
    expect(spatialWritesForTurn(session, "Vikky are you in?", "vikky")).toEqual([]);
    expect(spatialWritesForTurn(session, "Let's go.", "vikky")).toEqual([]);
    expect(destinationRoomFromPlayerText("I use the guest-house key", session)).toBeUndefined();
    expect(destinationRoomFromPlayerText("I open the staff door", session)).toBeUndefined();
  });

  it("following to the guest room does not bring Emma unless she is in the party", () => {
    const session = makeSession({
      characters: {
        emma: {
          name: "Emma",
          position: { value: "behind the bar", lock: "unlocked" },
          mood: { value: "reserved", lock: "unlocked" }
        }
      }
    });
    expect(spatialWritesForTurn(session, "I follow you to the guest room", "emma")).toEqual([
      { path: "player.position", value: "guest room" }
    ]);
    expect(
      spatialWritesForTurn({ ...session, partyIds: ["emma"] }, "I follow you to the guest room", "emma")
    ).toEqual([
      { path: "player.position", value: "guest room" },
      { path: "characters.emma.position", value: "guest room" }
    ]);
  });

  it("does not walk to the last named room when the player asks who will follow", () => {
    const session = makeSession({
      scene: {
        location: "The Aurora Room — a quiet late-night bar",
        environment: {},
        rooms: EXAMPLE_AURORA_ROOMS
      },
      conversation: [
        { turn: 1, role: "character", speaker: "emma", content: "The Ladies Room is down the hall." }
      ]
    });
    expect(
      spatialWritesForTurn(session, "So who is up for it? Who wants to follow me?", "emma")
    ).toEqual([]);
    expect(destinationRoomFromPlayerText("Who wants to follow me?", session)).toBeUndefined();
  });

  it("drops Pass 2 player.position", () => {
    expect(
      dropAiPlayerPosition([
        { path: "player.position", value: "Emma's room" },
        { path: "characters.emma.mood", value: "wry" }
      ])
    ).toEqual([{ path: "characters.emma.mood", value: "wry" }]);
  });
});

describe("matchRoomMention", () => {
  it("maps her room to Emma's room when that room is in canon", () => {
    expect(matchRoomMention("I am in her room", makeSession())).toBe("Emma's room");
    expect(matchRoomMention("I walk into Emmas room", makeSession())).toBe("Emma's room");
  });

  it("does not treat show me, shower, or looking as the toilets", () => {
    const session = makeSession({
      scene: {
        location: "The Aurora Room — a quiet late-night bar",
        environment: {},
        rooms: EXAMPLE_AURORA_ROOMS
      }
    });
    expect(matchRoomMention("Show me", session)).toBeUndefined();
    expect(matchRoomMention("Show me.", session)).toBeUndefined();
    expect(matchRoomMention("I want a shower", session)).toBeUndefined();
    expect(matchRoomMention("I am looking at Emma", session)).toBeUndefined();
  });

  it("still maps bathroom and loo as whole words to the toilets", () => {
    const session = makeSession({
      scene: {
        location: "The Aurora Room — a quiet late-night bar",
        environment: {},
        rooms: EXAMPLE_AURORA_ROOMS
      }
    });
    expect(matchRoomMention("I walk into the bathroom", session)).toBe("toilets");
    expect(matchRoomMention("I go to the loo", session)).toBe("toilets");
  });
});

describe("return to the bar", () => {
  function inEmmasRoom(): Session {
    return makeSession({
      player: {
        position: { value: "Emma's room", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      },
      characters: {
        emma: {
          name: "Emma",
          position: { value: "Emma's room", lock: "unlocked" },
          mood: { value: "reserved", lock: "unlocked" }
        }
      }
    });
  }

  it("reads a walk back to the bar from a named room", () => {
    expect(destinationPlaceFromPlayerText("I walk to the bar", inEmmasRoom())).toBe("at the bar");
    expect(destinationPlaceFromPlayerText("Jag går till baren", inEmmasRoom())).toBe("at the bar");
  });

  it("moves the player to the bar without dragging Emma unless she is in the party", () => {
    expect(spatialWritesForTurn(inEmmasRoom(), "I walk to the bar", "emma")).toEqual([
      { path: "player.position", value: "at the bar" }
    ]);
    expect(spatialWritesForTurn(inEmmasRoom(), "We go to the bar", "emma")).toEqual([
      { path: "player.position", value: "at the bar" }
    ]);
    expect(
      spatialWritesForTurn({ ...inEmmasRoom(), partyIds: ["emma"] }, "We go to the bar", "emma")
    ).toEqual([
      { path: "player.position", value: "at the bar" },
      { path: "characters.emma.position", value: "at the bar" }
    ]);
  });

  it("drops Pass 2 writes that tag Emma along to the player's new place", () => {
    const session = inEmmasRoom();
    expect(
      filterUninvitedFollowProposals(
        [
          { path: "player.position", value: "at the bar" },
          { path: "characters.emma.position", value: "at the bar" },
          { path: "characters.emma.mood", value: "quiet" }
        ],
        session,
        "emma"
      )
    ).toEqual([
      { path: "player.position", value: "at the bar" },
      { path: "characters.emma.mood", value: "quiet" }
    ]);
    expect(
      filterUninvitedFollowProposals(
        [{ path: "characters.emma.position", value: "at the bar" }],
        { ...session, player: { position: { value: "at the bar", lock: "unlocked" }, status: { value: "awake", lock: "unlocked" } } },
        "emma"
      )
    ).toEqual([]);
  });

  it("does not rewrite the bar when the player is already there", () => {
    expect(destinationPlaceFromPlayerText("I walk to the bar", makeSession())).toBeUndefined();
    expect(spatialWritesForTurn(makeSession(), "I walk to the bar", "emma")).toEqual([]);
  });

  it("honors a What now? room even when the button text has no walk verb", () => {
    expect(spatialWritesForTurn(makeSession(), "Go with Emma to her room", "emma", "Emma's room")).toEqual(
      expect.arrayContaining([
        { path: "player.position", value: "Emma's room" },
        { path: "characters.emma.position", value: "Emma's room" }
      ])
    );
  });

  it("ignores a What now? room that is not listed tonight", () => {
    expect(spatialWritesForTurn(makeSession(), "Go to the hotel", "emma", "the hotel")).toEqual([]);
  });

  it("treats a return to the bar after Emma's room as the same night continuing", () => {
    const session = inEmmasRoom();
    expect(
      sceneContinuesAfterNight(session, "I walk to the bar", "emma's room", "the aurora room")
    ).toBe(true);
    expect(sceneContinuesAfterNight(makeSession(), "Hi", "the aurora room", "the aurora room")).toBe(false);
  });

  it("uses the landmark name as the floor when the place is not a bar", () => {
    const hollow = makeSession({
      scene: {
        location: "The Hollow — limestone caves",
        environment: {},
        rooms: [
          {
            fromRoomIds: [],
            gate: "open" as const,
            id: "crypt",
            label: "the crypt",
            keywords: ["crypt"],
            description: "Cold stone."
          }
        ]
      },
      player: {
        position: { value: "the crypt", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      }
    });
    expect(venueFloorToken(hollow)).toBe("at The Hollow");
    expect(destinationPlaceFromPlayerText("I walk back to The Hollow", hollow)).toBe("at The Hollow");
    expect(destinationPlaceFromPlayerText("Stay on the floor", hollow)).toBe("at The Hollow");
    expect(spatialWritesForTurn(hollow, "Stay on the floor", "mira", WHAT_NOW_FLOOR)).toEqual([
      { path: "player.position", value: "at The Hollow" }
    ]);
  });

  it("does not move the body for a What now? that stays in this beat", () => {
    expect(spatialWritesForTurn(inEmmasRoom(), "I lie", "emma", WHAT_NOW_STAY)).toEqual([]);
    expect(spatialWritesForTurn(makeSession(), "I tell her the truth", "emma", WHAT_NOW_STAY)).toEqual([]);
  });
});

describe("Reachable from", () => {
  const cabinRooms = [
    {
      fromRoomIds: [],
      gate: "open" as const,
      id: "main", label: "Main room", keywords: [], description: "" },
    {
      gate: "open" as const,
      id: "cellar",
      label: "Cellar",
      keywords: ["secret hatch", "hidden hatch"],
      fromRoomIds: ["main"],
      description: ""
    }
  ];

  it("does not take a hatch from outside the landmark", () => {
    const session = makeSession({
      scene: { location: "Old womans cabin", environment: {}, rooms: cabinRooms },
      player: {
        position: { value: "Old womans cabin", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      }
    });
    expect(destinationRoomFromPlayerText("I go through the secret hatch", session)).toBeUndefined();
  });

  it("takes a hatch when the player is in the listed room", () => {
    const session = makeSession({
      scene: { location: "Old womans cabin", environment: {}, rooms: cabinRooms },
      player: {
        position: { value: "Main room", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      }
    });
    expect(destinationRoomFromPlayerText("I go through the secret hatch", session)).toBe("Cellar");
  });
});

