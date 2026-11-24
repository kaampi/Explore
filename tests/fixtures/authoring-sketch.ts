import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { openingScene } from "../../src/library/adventureReach";
import { chooseAdventureMap } from "../../src/library/adventureMap";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { applyPatch, type AuthoringPatch } from "../../src/library/authoringPatch";
import {
  newCampaignTemplate,
  newPlaceTemplate,
  type CampaignTemplate,
  type ObjectTemplate,
  type PlaceTemplate,
  type RealmTemplate,
} from "../../src/library/LibrarySchema";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import type { CheckLibrary } from "../../src/game/authoringChecks";

/** The sketch from docs/storyboard-ai.sv.md: a watchtower, a guildhall, and a crypt that needs the seal. */
export const places: PlaceTemplate[] = [
  newPlaceTemplate({ id: "p-tower", name: "Watchtower hill", note: "Wind sings in the arrows." }),
  newPlaceTemplate({ id: "p-hall", name: "Guild street", note: "Long tables, cold hearth." }),
  newPlaceTemplate({ id: "p-crypt", name: "Under the hall", note: "Dust and old stone." }),
  newPlaceTemplate({ id: "p-cellar", name: "Cellar steps", note: "Damp and dark." }),
];

export const sketch: AuthoringPatch = {
  ops: [
    {
      op: "addScene",
      tempId: "new:tower",
      name: "Watchtower",
      placeId: "p-tower",
      arrival: "Wind sings in the arrows.",
    },
    {
      op: "addScene",
      tempId: "new:hall",
      name: "Guildhall",
      placeId: "p-hall",
      arrival: "Long tables, cold hearth.",
    },
    {
      op: "addScene",
      tempId: "new:crypt",
      name: "Crypt",
      placeId: "p-crypt",
      arrival: "Dust and old stone.",
    },
    {
      op: "addItem",
      tempId: "new:seal",
      name: "Seal",
      description: "A wax seal.",
      inSceneId: "new:hall",
    },
    {
      op: "addAction",
      sceneId: "new:hall",
      label: "Take the seal",
      outcome: "You pocket the seal.",
      gives: [{ itemTempId: "new:seal" }],
    },
    { op: "addLink", from: "new:tower", to: "new:hall", label: "Down the stairs" },
    {
      op: "addLink",
      from: "new:hall",
      to: "new:crypt",
      label: "Down to the crypt",
      lockName: "Needs the seal",
      requires: [{ kind: "item", itemId: "new:seal" }],
    },
    { op: "addLink", from: "new:crypt", to: "new:hall", label: "Back up" },
  ],
};

export const emptyLibrary: CheckLibrary = { objects: [] as ObjectTemplate[], places };

export function sketchAdventure() {
  const base = newCampaignTemplate({ id: "adv", name: "Sketch" });
  const built = applyPatch(base, emptyLibrary, sketch);
  const [tower, hall, crypt] = built.newSceneIds as [string, string, string];
  const campaign: CampaignTemplate = { ...built.campaign, startSceneId: tower };
  const library: CheckLibrary = { ...emptyLibrary, objects: built.library.objects };
  return { campaign, library, tower, hall, crypt, seal: built.library.objects[0]!.id };
}

/** Start an adventure the way a real start does, and hand back the engine that plays it. */
export function startRun(
  campaign: CampaignTemplate,
  library: CheckLibrary,
  worlds: RealmTemplate[] = [],
  fromScene?: string,
) {
  const start = campaign.scenes.find((scene) => scene.id === fromScene) ?? openingScene(campaign)!;
  const session = startPlayableCampaign(campaign, start, library.places ?? [], "run", worlds, {
    objects: library.objects,
  });
  return new StateEngine(session, new EventLog());
}

let counter = 0;
const next = (prefix: string) => `${prefix}-${++counter}`;

/** Play an action the engine offers in the scene the player is in. */
export function act(engine: StateEngine, interactionId: string): void {
  const live = engine.getSession();
  engine.executeEncounterAction({
    id: next("act"),
    expectedRevision: live.encounter!.state.revision,
    expectedSceneId: live.sceneId!,
    action: { kind: "interaction", interactionId },
  } as never);
}

/** Play the action with this label. */
export function actByLabel(engine: StateEngine, label: string): void {
  const action = engine
    .getSession()
    .encounter!.definition.interactions.find((item) => item.label === label);
  if (!action) throw new Error(`No action “${label}” in this scene.`);
  act(engine, action.id);
}

/** Unlock and open a door of the scene: the one with this name, or the only one. */
export function openTheDoor(engine: StateEngine, name?: string): void {
  const doors = Object.values(engine.getSession().encounter!.state.barriers);
  const door = name ? doors.find((item) => item.name === name) : doors[0];
  if (!door) throw new Error(`No door${name ? ` “${name}”` : ""} in this scene.`);
  for (const operation of ["unlock", "open"] as const) {
    const live = engine.getSession();
    engine.executeEncounterAction({
      id: next("door"),
      expectedRevision: live.encounter!.state.revision,
      expectedSceneId: live.sceneId!,
      action: { kind: "interact", barrierId: door.id, operation },
    } as never);
  }
}

/** Take the route with this label out of the scene the player is in. */
export function goBy(engine: StateEngine, campaign: CampaignTemplate, label: string): void {
  const live = engine.getSession();
  const link = campaign.sceneLinks.find(
    (item) => item.label === label && item.fromSceneId === live.sceneId,
  );
  if (!link) throw new Error(`No route “${label}” from this scene.`);
  engine.transitionAdventure({
    id: next("go"),
    linkId: link.id,
    expectedStateVersion: live.stateVersion,
  });
}

/** An adventure bound to a map, with two scenes on it: the village square and the old watchtower. */
export function mappedAdventure() {
  const built = connectedAdventureExample();
  const [square, tower] = built.places;
  built.realm.worldMap = {
    distanceScale: { value: 2, unit: "km", kmPerUnit: 1 },
    mapType: "world",
    nodes: [
      {
        id: "square-node",
        placeId: square!.id,
        name: square!.name,
        kind: "Square",
        x: 20,
        y: 30,
        intro: square!.note,
        description: "Village square.",
        population: "",
        characterIds: [],
      },
      {
        id: "tower-node",
        placeId: tower!.id,
        name: tower!.name,
        kind: "Building",
        x: 60,
        y: 20,
        intro: tower!.note,
        description: "Old tower.",
        population: "",
        characterIds: [],
      },
    ],
    routes: [
      {
        id: "road",
        from: "square-node",
        to: "tower-node",
        type: "road",
        mode: "Walk",
        duration: "2 hours",
        access: "open",
        bothWays: true,
      },
    ],
  };
  const campaign = chooseAdventureMap(built.campaign, built.realm, built.places);
  const library: CheckLibrary = {
    objects: built.objects,
    places: built.places,
    worlds: [built.realm],
  };
  return { campaign, library, realm: built.realm, square: square!, tower: tower! };
}

export const where = (engine: StateEngine) => engine.getSession().encounter!.definition.title;
