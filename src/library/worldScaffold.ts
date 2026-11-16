import {
  emptyCampaignScene,
  newCampaignTemplate,
  type CampaignPlayer,
  type CampaignScene,
  type CampaignTemplate,
  type CharacterTemplate,
  type ObjectTemplate,
  type PlaceTemplate,
  type RealmTemplate,
  type RulesetTemplate,
} from "./LibrarySchema";
import { adventureMapPlaces, type AdventureMapPlace } from "./adventureMap";
import { makePlayableScene } from "./playableCampaign";
import { addPickUp, placeItem } from "./sceneParts";
import { syncAdventure } from "./sceneSync";
import type { MapNode } from "./worldMap";

/** Most scenes one free-play game is built with. A bigger world is played from a town or a building. */
export const MAX_WORLD_SCENES = 300;

type Route = NonNullable<RealmTemplate["worldMap"]>["routes"][number];

export type ScaffoldLibrary = {
  characters: CharacterTemplate[];
  objects: ObjectTemplate[];
  places: PlaceTemplate[];
  rulesets: RulesetTemplate[];
};

export type ScaffoldOptions = {
  player: CampaignPlayer;
  rulesetId?: string | undefined;
  /** The map place the player begins in. */
  startNodeId: string;
};

type Link = CampaignTemplate["sceneLinks"][number];
type Door = { id: string; name: string; locked: boolean };

/**
 * Free play in a world is an adventure built from its map: a scene for every place, a link for
 * every way between places, and the people and things the map and cards say are there. Nothing
 * is saved: the result is an ordinary adventure that starts like any other.
 */
export function scaffoldFromWorld(
  world: RealmTemplate,
  library: ScaffoldLibrary,
  options: ScaffoldOptions,
): { campaign: CampaignTemplate; skipped: string[] } {
  const map = world.worldMap;
  if (!map) throw new Error("This world has no map to play on.");
  const skipped: string[] = [];
  const all = adventureMapPlaces(world, library.places);
  const usable = all.filter((entry) => {
    const { node } = entry;
    if (node.isArea) skipped.push(`${node.name} (a local area, not a place)`);
    else if (node.visibility === "hidden") skipped.push(`${node.name} (hidden)`);
    else return true;
    return false;
  });
  const start = usable.find((entry) => entry.node.id === options.startNodeId);
  if (!start) throw new Error("Choose a place on the map to begin in.");

  const chosen = usable.length > MAX_WORLD_SCENES ? nearby(map, usable, start.node) : usable;
  if (chosen.length > MAX_WORLD_SCENES)
    throw new Error(
      `This world has ${usable.length} places. Choose a town or a building as the start, so that only that part is built.`,
    );
  if (chosen.length < usable.length)
    for (const entry of usable)
      if (!chosen.includes(entry)) skipped.push(`${entry.node.name} (too far from the start)`);
  const ordered = [start, ...chosen.filter((entry) => entry !== start)];
  const byNode = new Map(ordered.map((entry) => [entry.node.id, entry]));

  const sceneOf = new Map<string, CampaignScene>();
  const base = newCampaignTemplate({
    name: world.name ? `${world.name} · free play` : "Free play",
    realmId: world.id,
    mapWorldId: world.id,
    placeIds: ordered.map((entry) => entry.place.id),
    ...(options.rulesetId ? { rulesetId: options.rulesetId } : {}),
    player: options.player,
    people: [],
    objectIds: [],
    scenes: [],
  });
  const peopleIds = new Set<string>();
  const objectIds = new Set<string>();
  const scenes = ordered.map((entry, index) => {
    const { node, place } = entry;
    const people = node.characterIds
      .filter((id) => library.characters.some((card) => card.id === id))
      .map((characterId) => {
        peopleIds.add(characterId);
        return {
          characterId,
          position: "here",
          mood: "",
          clothing: "",
          holding: "",
          trust: "0",
          familiarity: "0",
          tension: "0",
        };
      });
    const here = library.objects.filter(
      (card) =>
        card.startingLocation?.kind === "place" && card.startingLocation.placeId === place.id,
    );
    for (const card of here) objectIds.add(card.id);
    return {
      ...emptyCampaignScene(),
      name: node.name,
      placeId: place.id,
      mapNodeId: node.id,
      usePlaceIntro: false,
      position: { x: (index % 6) * 300, y: Math.floor(index / 6) * 220 },
      people,
      objectIds: here.map((card) => card.id),
    } satisfies CampaignScene;
  });
  base.people = [...peopleIds].map((characterId) => ({ characterId, stats: {}, lore: [] }));
  base.objectIds = [...objectIds];

  const built = scenes.map((scene, index) => {
    const entry = ordered[index]!;
    let playable = makePlayableScene(
      base,
      scene,
      ordered.map((e) => e.place),
      library.characters,
      library.objects,
      library.rulesets,
    );
    const game = structuredClone(playable.encounter!);
    game.definition.description = entry.place.note.trim() || `You arrive at ${entry.node.name}.`;
    playable = { ...playable, encounter: game };
    for (const id of scene.objectIds) {
      const card = library.objects.find((item) => item.id === id)!;
      playable = addPickUp(placeItem(playable, card, { position: "here" }), card.id);
    }
    sceneOf.set(entry.node.id, playable);
    return playable;
  });

  const { links, doors } = routeLinks(map, byNode, sceneOf);
  for (const [sceneId, list] of doors) {
    const scene = built.find((item) => item.id === sceneId)!;
    const game = structuredClone(scene.encounter!);
    for (const door of list)
      game.state.barriers[door.id] = {
        id: door.id,
        name: door.name,
        position: "here",
        open: false,
        locked: door.locked,
        blocked: false,
        shared: true,
      };
    scene.encounter = game;
  }
  const campaign: CampaignTemplate = { ...base, scenes: built, sceneLinks: links };
  return { campaign: syncAdventure(campaign, library), skipped };
}

/** The part of a big world to build: everything inside the start's outermost place, and its neighbours. */
function nearby(
  map: NonNullable<RealmTemplate["worldMap"]>,
  entries: AdventureMapPlace[],
  start: MapNode,
): AdventureMapPlace[] {
  const parentOf = new Map(map.nodes.map((node) => [node.id, node.parentId]));
  const top = (id: string) => {
    let current = id;
    const seen = new Set<string>();
    while (parentOf.get(current) && !seen.has(current)) {
      seen.add(current);
      current = parentOf.get(current)!;
    }
    return current;
  };
  const home = top(start.id);
  const inside = new Set(entries.filter((e) => top(e.node.id) === home).map((e) => e.node.id));
  for (const route of map.routes) {
    if (inside.has(route.from)) inside.add(route.to);
    if (inside.has(route.to)) inside.add(route.from);
  }
  return entries.filter((e) => inside.has(e.node.id));
}

const insideOf = (parent: MapNode | undefined, child: MapNode) =>
  !!parent && child.parentId === parent.id;

/** A way through a wall: a door in a building, not a path across open ground. */
function isDoorway(a: MapNode, b: MapNode, byNode: Map<string, AdventureMapPlace>) {
  if (insideOf(a, b) || insideOf(b, a)) return Boolean((insideOf(a, b) ? a : b).interior);
  const parent = a.parentId && a.parentId === b.parentId ? byNode.get(a.parentId)?.node : undefined;
  return Boolean(parent?.interior);
}

function label(from: MapNode, to: MapNode) {
  if (insideOf(from, to)) return `Enter ${to.name}`;
  if (insideOf(to, from)) return `Leave ${to.name}`;
  return `Go to ${to.name}`;
}

function routeLinks(
  map: NonNullable<RealmTemplate["worldMap"]>,
  byNode: Map<string, AdventureMapPlace>,
  sceneOf: Map<string, CampaignScene>,
) {
  const links: Link[] = [];
  const doors = new Map<string, Door[]>();
  const routed = new Set<string>();
  const addDoor = (sceneId: string, door: Door) => {
    const list = doors.get(sceneId) ?? [];
    if (!list.some((item) => item.id === door.id)) list.push(door);
    doors.set(sceneId, list);
  };
  const connect = (
    id: string,
    access: "open" | "locked",
    a: MapNode,
    b: MapNode,
    directions: [MapNode, MapNode][],
  ) => {
    const doorway = access === "locked" || isDoorway(a, b, byNode);
    for (const [from, to] of directions) {
      const source = sceneOf.get(from.id),
        target = sceneOf.get(to.id);
      if (!source || !target) continue;
      if (doorway) {
        const name =
          insideOf(a, b) || insideOf(b, a)
            ? `${(insideOf(a, b) ? a : b).name} entrance`
            : `${to.name} door`;
        addDoor(source.id, { id, name, locked: access === "locked" });
        addDoor(target.id, { id, name, locked: access === "locked" });
      }
      links.push({
        id: crypto.randomUUID(),
        fromSceneId: source.id,
        toSceneId: target.id,
        label: label(from, to),
        requiresFlags: [],
        requiresAbsentFlags: [],
        ...(doorway ? { requiresOpenBarriers: [id] } : {}),
        setsFlags: [],
      });
    }
  };
  for (const route of map.routes as Route[]) {
    const a = byNode.get(route.from)?.node,
      b = byNode.get(route.to)?.node;
    if (!a || !b || route.access === "hidden") continue;
    // A way to something inside does not bring the place itself any nearer to its surroundings.
    if (!insideOf(a, b)) routed.add(a.id);
    if (!insideOf(b, a)) routed.add(b.id);
    connect(
      route.id,
      route.access,
      a,
      b,
      route.bothWays
        ? [
            [a, b],
            [b, a],
          ]
        : [[a, b]],
    );
  }
  // A place inside another that no route reaches is entered by its own entrance.
  for (const { node } of byNode.values()) {
    const parent = node.parentId ? byNode.get(node.parentId)?.node : undefined;
    if (!parent || routed.has(node.id)) continue;
    const entrance = node.entrance ?? "open";
    if (entrance === "none" || entrance === "hidden") continue;
    connect(`entrance:${node.id}`, entrance, parent, node, [
      [parent, node],
      [node, parent],
    ]);
  }
  return { links, doors };
}
