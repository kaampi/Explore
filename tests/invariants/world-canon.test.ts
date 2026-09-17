import { describe, it, expect } from "vitest";
import { isUngroundedPlace, isUngroundedObject, isUngroundedInvention, namedRoomsInCanon, matchRoomMention, collapsesNamedRoomToVenue } from "@state/WorldCanon";
import type { Session } from "@state/StateSchema";

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
    scene: { location: "The Aurora Room — a quiet late-night bar", environment: {} },
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

describe("isUngroundedPlace", () => {
  it("rejects a spare room that is not in the bar scene", () => {
    expect(isUngroundedPlace("spare room down the hall", makeSession())).toBe(true);
  });

  it("allows sleeping in the established scene", () => {
    expect(isUngroundedPlace("asleep at the bar", makeSession())).toBe(false);
  });

  it("allows a guest room when the place note already names it", () => {
    const session = makeSession({
      layers: [
        {
          id: "place-1",
          type: "environment",
          priority: 0,
          content: "An inn. Guest rooms upstairs.",
          active: true,
          aiGenerated: false
        }
      ]
    });
    expect(isUngroundedPlace("guest room upstairs", session)).toBe(false);
  });

  it("allows Emma's room when the Aurora adjoining note names it", () => {
    const session = makeSession({
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
      ]
    });
    expect(isUngroundedPlace("Emma's room", session)).toBe(false);
    expect(isUngroundedPlace("guest room upstairs", session)).toBe(false);
  });

  it("rejects Emma's room when the bar has no adjoining map", () => {
    expect(isUngroundedPlace("Emma's room", makeSession())).toBe(true);
  });

  it("rejects a stray dog that is not a placed object", () => {
    expect(isUngroundedObject("A stray dog waits by the door.", makeSession())).toBe(true);
    expect(isUngroundedInvention("A stray dog waits by the door.", makeSession())).toBe(true);
  });

  it("allows a dog when an object card already names it", () => {
    const session = makeSession({
      objects: [{ id: "obj-dog", name: "a mongrel dog", note: "Asleep under the bar.", tags: [] }]
    });
    expect(isUngroundedObject("A stray dog waits by the door.", session)).toBe(false);
    expect(isUngroundedInvention("A stray dog waits by the door.", session)).toBe(false);
  });

  it("treats named rooms on the place card as canon without a place note", () => {
    const session = makeSession({
      scene: {
        location: "The Aurora Room — a quiet late-night bar",
        environment: {},
        rooms: [
          {
            id: "room-emmas",
            label: "Emma's room",
            keywords: ["staff room"],
            description: "A narrow bed, a chair, curtains drawn."
          }
        ]
      }
    });
    expect(isUngroundedPlace("Emma's room", session)).toBe(false);
    expect(namedRoomsInCanon(session)).toEqual(["Emma's room"]);
    expect(matchRoomMention("I walk into the staff room", session)).toBe("Emma's room");
  });

  it("does not treat dormant keyword lore as canon", () => {
    const session = makeSession({
      layers: [
        {
          id: "place-1",
          type: "environment",
          priority: 0,
          content: "An inn. Guest rooms upstairs.",
          keywords: ["guest"],
          active: true,
          aiGenerated: false
        }
      ]
    });
    expect(isUngroundedPlace("guest room upstairs", session)).toBe(true);
  });

  it("treats keyword lore as canon once chat wakes it", () => {
    const session = makeSession({
      conversation: [{ turn: 1, role: "player", content: "Is there a guest room?" }],
      layers: [
        {
          id: "place-1",
          type: "environment",
          priority: 0,
          content: "An inn. Guest rooms upstairs.",
          keywords: ["guest"],
          active: true,
          aiGenerated: false
        }
      ]
    });
    expect(isUngroundedPlace("guest room upstairs", session)).toBe(false);
  });

  it("treats a placed guest key as canon for the guest room", () => {
    const session = makeSession({
      objects: [
        {
          id: "key",
          name: "Guest-house key",
          note: "Unlocks the guest room upstairs.",
          tags: ["key"]
        }
      ]
    });
    expect(isUngroundedPlace("guest room upstairs", session)).toBe(false);
  });
});

describe("namedRoomsInCanon", () => {
  it("lists rooms named in an active place note", () => {
    const session = makeSession({
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
      ]
    });
    expect(namedRoomsInCanon(session)).toEqual(["Emma's room", "guest room", "cellar", "toilets"]);
  });

  it("resolves her room to Emma's room when that room is in canon", () => {
    const session = makeSession({
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
      ]
    });
    expect(matchRoomMention("her staff room", session)).toBe("Emma's room");
    expect(matchRoomMention("Emmas room", session)).toBe("Emma's room");
    expect(matchRoomMention("a hotel lobby", session)).toBeUndefined();
  });
});

describe("collapsesNamedRoomToVenue", () => {
  const aurora = makeSession({
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
    ]
  });

  it("rejects swapping Emma's room for the venue title or the bar", () => {
    expect(collapsesNamedRoomToVenue("The Aurora Room", "Emma's room", aurora)).toBe(true);
    expect(
      collapsesNamedRoomToVenue("The Aurora Room — a quiet late-night bar", "Emma's room", aurora)
    ).toBe(true);
    expect(collapsesNamedRoomToVenue("behind the bar", "Emma's room", aurora)).toBe(true);
  });

  it("allows moving to another named room", () => {
    expect(collapsesNamedRoomToVenue("guest room", "Emma's room", aurora)).toBe(false);
  });
});

describe("rooms from the place card", () => {
  it("maps her den from keywords on that night's rooms, not a hardcoded Emma", () => {
    const session = makeSession({
      scene: {
        location: "The Hollow — limestone caves",
        environment: {},
        rooms: [
          {
            id: "room-mira",
            label: "Mira's den",
            keywords: ["her den", "staff den", "my den"],
            description: "A bedroll and a lamp."
          },
          {
            id: "room-crypt",
            label: "the crypt",
            keywords: ["crypt", "ossuary"],
            description: "Cold stone."
          }
        ]
      },
      characters: {
        mira: {
          name: "Mira",
          position: { value: "at The Hollow", lock: "unlocked" },
          mood: { value: "wary", lock: "unlocked" }
        }
      }
    });
    expect(namedRoomsInCanon(session)).toEqual(["Mira's den", "the crypt"]);
    expect(matchRoomMention("I walk into her den", session)).toBe("Mira's den");
    expect(matchRoomMention("the staff den", session)).toBe("Mira's den");
    expect(matchRoomMention("the crypt", session)).toBe("the crypt");
    expect(isUngroundedPlace("a hotel lobby", session)).toBe(true);
  });
});
