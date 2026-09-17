import { describe, it, expect } from "vitest";
import { EventLog } from "@events/EventLog";
import { StateEngine } from "@state/StateEngine";
import { applyLandmarkTravel, mapLandmarkTravels } from "@state/landmarkTravel";
import { EXAMPLE_AURORA_ROOMS, EXAMPLE_PLACE_ID, EXAMPLE_REALM_DUNBAAR_ID } from "@library/exampleTemplates";
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
        mood: { value: "neutral", lock: "unlocked" }
      }
    },
    scene: {
      location: "The Aurora Room — a quiet late-night bar",
      placeId: EXAMPLE_PLACE_ID,
      environment: { lighting: "low" },
      rooms: EXAMPLE_AURORA_ROOMS,
      note: "Jazz and dark wood."
    },
    player: {
      position: { value: "at the bar", lock: "unlocked" },
      status: { value: "awake", lock: "unlocked" }
    },
    partyIds: [],
    layers: [
      {
        id: "layer-place",
        type: "environment",
        priority: 10,
        content: "Jazz and dark wood.",
        active: true,
        aiGenerated: false
      },
      {
        id: "layer-core-emma",
        type: "core",
        priority: 0,
        content: "A reserved bartender.",
        active: true,
        aiGenerated: false
      }
    ],
    relationships: {},
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: [],
    ...overrides
  };
}

const oasis = {
  id: "place-oasis",
  name: "Red Oasis",
  realmId: EXAMPLE_REALM_DUNBAAR_ID
};

const places = [
  { id: EXAMPLE_PLACE_ID, name: "The Aurora Room — a quiet late-night bar", realmId: EXAMPLE_REALM_DUNBAAR_ID },
  oasis
];

describe("mapLandmarkTravels", () => {
  it("lists other landmarks from the floor, not from a side room", () => {
    expect(mapLandmarkTravels(makeSession(), places).map((item) => item.label)).toEqual(["Red Oasis"]);
    expect(
      mapLandmarkTravels(
        makeSession({
          player: {
            position: { value: "Emma's room", lock: "unlocked" },
            status: { value: "awake", lock: "unlocked" }
          }
        }),
        places
      )
    ).toEqual([]);
  });
});

describe("applyLandmarkTravel", () => {
  it("swaps Here and keeps people who did not come along", () => {
    const session = makeSession({ partyIds: [] });
    applyLandmarkTravel(session, {
      placeId: oasis.id,
      location: oasis.name,
      lighting: "lanterns",
      note: "Warm sand.",
      rooms: [{ id: "tent", label: "tent", keywords: [] }],
      placeLayers: [
        {
          id: "layer-place",
          type: "environment",
          priority: 10,
          content: "Warm sand.",
          active: true,
          aiGenerated: false
        }
      ]
    });
    expect(session.scene?.placeId).toBe(oasis.id);
    expect(session.scene?.location).toBe("Red Oasis");
    expect(session.scene?.rooms?.map((room) => room.label)).toEqual(["tent"]);
    expect(session.player?.position.value).toBe("Red Oasis");
    expect(session.characters.emma?.position.value).toBe("behind the bar");
    expect(session.layers.some((layer) => layer.id === "layer-core-emma")).toBe(true);
    expect(session.layers.find((layer) => layer.id === "layer-place")?.content).toBe("Warm sand.");
  });

  it("brings accepted companions", () => {
    const session = makeSession({ partyIds: ["emma"] });
    applyLandmarkTravel(session, {
      placeId: oasis.id,
      location: oasis.name,
      placeLayers: []
    });
    expect(session.characters.emma?.position.value).toBe("Red Oasis");
  });

  it("does not bring a member on Stay", () => {
    const session = makeSession({ partyIds: ["emma"], partyHoldIds: ["emma"] });
    applyLandmarkTravel(session, {
      placeId: oasis.id,
      location: oasis.name,
      placeLayers: []
    });
    expect(session.characters.emma?.position.value).toBe("behind the bar");
    expect(session.player?.position.value).toBe("Red Oasis");
  });
});

describe("StateEngine.travelToLandmark", () => {
  it("writes the new landmark onto the live session", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    engine.travelToLandmark({
      placeId: oasis.id,
      location: oasis.name,
      placeLayers: []
    });
    expect(engine.getSession().scene?.placeId).toBe(oasis.id);
    expect(engine.getEventLog().last()?.type).toBe("landmark_traveled");
  });
});
