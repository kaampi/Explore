import {
  emptyCampaignPlayer,
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
import { actorIdFor, addPickUp, placeItem } from "./sceneParts";
import { syncAdventure } from "./sceneSync";
import type { MapNode } from "./worldMap";
import { parseTravelMinutes } from "../state/gameClock";
import { travelGap } from "./mapTravel";

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
  const placedAt = new Map<string, string>();
  const heldHere = new Map<string, ObjectTemplate[]>();
  const objectIds = new Set<string>();
  const scenes = ordered.map((entry, index) => {
    const { node, place } = entry;
    const people = node.characterIds
      .filter((id) => library.characters.some((card) => card.id === id))
      .filter((id) => {
        const first = placedAt.get(id);
        if (first === undefined) {
          placedAt.set(id, node.name);
          return true;
        }
        const who = library.characters.find((card) => card.id === id)!.name;
        skipped.push(`${who} is also on “${node.name}”, but stands only at “${first}”`);
        return false;
      })
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
    const held = library.objects.filter((card) => {
      const holder = card.startingLocation;
      return (
        holder?.kind === "character" &&
        people.some((person) => person.characterId === holder.characterId)
      );
    });
    for (const card of held) objectIds.add(card.id);
    heldHere.set(node.id, held);
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
    for (const card of heldHere.get(entry.node.id) ?? [])
      if (card.startingLocation?.kind === "character")
        playable = placeItem(playable, card, {
          heldBy: actorIdFor(card.startingLocation.characterId),
        });
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

/**
 * How long a road takes when no time is written on it: the gap between its ends on the map, in
 * the map's own scale, at walking pace. A way blocked by terrain or too short to measure has none.
 */
function estimatedMinutes(
  map: NonNullable<RealmTemplate["worldMap"]>,
  nodes: Map<string, MapNode>,
  route: Route,
): number | undefined {
  if (/blocked/i.test(route.duration) || route.mode.toLowerCase() === "door") return undefined;
  const a = nodes.get(route.from),
    b = nodes.get(route.to);
  if (!a || !b) return undefined;
  const cells = travelGap(a, b);
  if (cells < 0.01) return undefined;
  const level = a.parentId ? nodes.get(a.parentId) : undefined;
  const scale = level?.distanceScale ?? map.distanceScale;
  const speed = route.speedKmh ?? 5;
  const minutes = scale
    ? ((cells * scale.value * scale.kmPerUnit) / speed) * 60
    : cells * (map.minutesPerCell ?? 5);
  return Math.max(1, Math.round(minutes));
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
    minutes?: number,
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
        ...(minutes !== undefined ? { minutes } : {}),
        setsFlags: [],
      });
    }
  };

  // Ways that run on from place to place through crossings are followed to the other end.
  const nodeById = new Map(map.nodes.map((node) => [node.id, node]));
  const leaving = new Map<string, { to: string; route: Route }[]>();
  for (const route of map.routes as Route[]) {
    if (route.access === "hidden") continue;
    const add = (from: string, to: string) =>
      leaving.set(from, [...(leaving.get(from) ?? []), { to, route }]);
    add(route.from, route.to);
    if (route.bothWays) add(route.to, route.from);
  }
  const seenPair = new Set<string>();
  for (const { node: a } of byNode.values()) {
    const queue: { at: string; hops: Route[]; seen: Set<string> }[] = [
      { at: a.id, hops: [], seen: new Set([a.id]) },
    ];
    while (queue.length > 0) {
      const { at, hops, seen } = queue.shift()!;
      for (const step of leaving.get(at) ?? []) {
        if (seen.has(step.to)) continue;
        const next = [...hops, step.route];
        const target = byNode.get(step.to)?.node;
        if (target) {
          const key = `${a.id}>${target.id}`;
          if (seenPair.has(key)) continue;
          seenPair.add(key);
          if (!insideOf(a, target)) routed.add(a.id);
          if (!insideOf(target, a)) routed.add(target.id);
          const locked = next.find((hop) => hop.access === "locked");
          const id = locked?.id ?? next.map((hop) => hop.id).sort()[0]!;
          const times = next.map(
            (hop) => parseTravelMinutes(hop.duration) ?? estimatedMinutes(map, nodeById, hop),
          );
          const minutes = times.every((time) => time !== undefined)
            ? Math.round(times.reduce((sum, time) => sum + time!, 0))
            : undefined;
          connect(id, locked ? "locked" : "open", a, target, [[a, target]], minutes);
        } else if (nodeById.get(step.to)?.isJunction) {
          queue.push({ at: step.to, hops: next, seen: new Set([...seen, step.to]) });
        }
      }
    }
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
  // A place that holds other places can be left for it from one of them. If no way does that,
  // the place inside with the most ways gets the entrance and the exit.
  const withinPlace = (node: MapNode, container: MapNode) => {
    const seen = new Set<string>();
    let at = node.parentId;
    while (at && !seen.has(at)) {
      if (at === container.id) return true;
      seen.add(at);
      at = nodeById.get(at)?.parentId;
    }
    return false;
  };
  const entries = [...byNode.values()].map((entry) => entry.node);
  for (const container of entries) {
    const inside = entries.filter((node) => withinPlace(node, container));
    if (inside.length === 0) continue;
    const containerScene = sceneOf.get(container.id)!.id;
    const insideScenes = new Set(inside.map((node) => sceneOf.get(node.id)!.id));
    if (links.some((l) => l.toSceneId === containerScene && insideScenes.has(l.fromSceneId)))
      continue;
    const doorways = inside.filter(
      (node) =>
        node.parentId === container.id && node.entrance !== "none" && node.entrance !== "hidden",
    );
    if (doorways.length === 0) continue;
    const ways = (node: MapNode) => {
      const scene = sceneOf.get(node.id)!.id;
      return links.filter((l) => l.fromSceneId === scene || l.toSceneId === scene).length;
    };
    const best = doorways.reduce((chosen, node) => (ways(node) > ways(chosen) ? node : chosen));
    const missing = (
      [
        [container, best],
        [best, container],
      ] as [MapNode, MapNode][]
    ).filter(
      ([from, to]) =>
        !links.some(
          (l) =>
            l.fromSceneId === sceneOf.get(from.id)!.id && l.toSceneId === sceneOf.get(to.id)!.id,
        ),
    );
    connect(
      `entrance:${best.id}`,
      best.entrance === "locked" ? "locked" : "open",
      container,
      best,
      missing,
    );
  }
  return { links, doors };
}

/**
 * Scenes and ways for the places of the adventure's map that have no scene yet, added to the
 * adventure as a start to write on. Scenes and ways that are already there are never touched:
 * a place that has a scene is skipped, and a way between two scenes that already exist is left
 * as it is. A way from a new scene to an old one is added without a door, since the old scene
 * cannot be given one, and a locked way to an old scene is left out and reported.
 */
export function scaffoldIntoAdventure(
  campaign: CampaignTemplate,
  world: RealmTemplate,
  library: ScaffoldLibrary,
  options: { startSceneId?: string | undefined } = {},
): { campaign: CampaignTemplate; added: number; skipped: string[]; reconnected: string[] } {
  if (!world.worldMap) throw new Error("This world has no map to build scenes from.");
  const places = adventureMapPlaces(world, library.places);
  const usable = places.filter(({ node }) => !node.isArea && node.visibility !== "hidden");
  const existingFor = (entry: AdventureMapPlace) =>
    campaign.scenes.find(
      (scene) =>
        scene.mapNodeId === entry.node.id || (!scene.mapNodeId && scene.placeId === entry.place.id),
    );
  const missing = usable.filter((entry) => !existingFor(entry));
  if (missing.length === 0)
    return { campaign, added: 0, skipped: ["Every place already has a scene."], reconnected: [] };
  const startEntry = usable.find((entry) => existingFor(entry)) ?? usable[0]!;
  const built = scaffoldFromWorld(world, library, {
    player: campaign.player ?? emptyCampaignPlayer(),
    ...(campaign.rulesetId ? { rulesetId: campaign.rulesetId } : {}),
    startNodeId: startEntry.node.id,
  });
  const skipped = [...built.skipped];
  const isNew = (scene: CampaignScene) =>
    !!scene.mapNodeId && missing.some((entry) => entry.node.id === scene.mapNodeId);
  const newScenes = built.campaign.scenes.filter(isNew);
  if (newScenes.length === 0)
    return {
      campaign,
      added: 0,
      skipped: [...skipped, "Nothing in range of the places already there."],
      reconnected: [],
    };

  // A built scene that stands for a place with a scene of its own is replaced by that scene.
  const standIn = new Map<string, string>();
  for (const scene of built.campaign.scenes) {
    if (isNew(scene)) continue;
    const entry = usable.find((candidate) => candidate.node.id === scene.mapNodeId);
    const old = entry ? existingFor(entry) : undefined;
    if (old) standIn.set(scene.id, old.id);
  }
  const oldIds = new Set(campaign.scenes.map((scene) => scene.id));
  const have = new Set(campaign.sceneLinks.map((link) => `${link.fromSceneId}>${link.toSceneId}`));
  const nameOf = (id: string) =>
    built.campaign.scenes.find((scene) => scene.id === id)?.name ??
    campaign.scenes.find((scene) => scene.id === id)?.name ??
    "a place";
  const freely = reachableFreely(campaign, options.startSceneId);
  const links: Link[] = [];
  const stillNeeded = new Set<string>();
  const reconnected = new Set<string>();
  for (const link of built.campaign.sceneLinks) {
    const from = standIn.get(link.fromSceneId) ?? link.fromSceneId;
    const to = standIn.get(link.toSceneId) ?? link.toSceneId;
    if (oldIds.has(from) && oldIds.has(to)) continue;
    if (have.has(`${from}>${to}`)) continue;
    const touchesOld = oldIds.has(from) || oldIds.has(to);
    // A new way into a scene that is already there could be a detour round the author's own
    // conditions and doors, so it is only added when nothing guards the ways into that scene.
    if (oldIds.has(to) && !freely.has(to)) {
      skipped.push(
        `The way from “${nameOf(from)}” to “${nameOf(to)}” was left out, because “${nameOf(to)}” can only be reached through conditions or doors; add it yourself if you want it`,
      );
      continue;
    }
    let next: Link = { ...link, fromSceneId: from, toSceneId: to };
    if (touchesOld && link.requiresOpenBarriers?.length) {
      const sceneWithDoor = newScenes.find((scene) => scene.id === (oldIds.has(from) ? to : from));
      const locked = link.requiresOpenBarriers.some(
        (id) => sceneWithDoor?.encounter?.state.barriers[id]?.locked,
      );
      if (locked) {
        skipped.push(
          `The locked way between “${nameOf(from)}” and “${nameOf(to)}” was left out; add it yourself with a key`,
        );
        continue;
      }
      const { requiresOpenBarriers: _doors, ...free } = next;
      next = free;
    }
    for (const id of next.requiresOpenBarriers ?? []) stillNeeded.add(id);
    if (oldIds.has(from)) reconnected.add(from);
    links.push(next);
  }
  const lowest = campaign.scenes.reduce(
    (most, scene) => Math.max(most, scene.position?.y ?? 0),
    -220,
  );
  // The scenes of an adventure share one set of skills and one player health, so the new ones
  // take them from a scene that is already there.
  const reference = campaign.scenes.find((scene) => scene.encounter)?.encounter?.definition.rules;
  const scenes = newScenes.map((scene, index) => {
    const game = structuredClone(scene.encounter!);
    if (reference) {
      game.definition.rules.attributes = structuredClone(reference.attributes);
      if (reference.playerHealth === undefined) delete game.definition.rules.playerHealth;
      else game.definition.rules.playerHealth = reference.playerHealth;
    }
    for (const id of Object.keys(game.state.barriers))
      if (!stillNeeded.has(id) && game.state.barriers[id]!.shared) delete game.state.barriers[id];
    return {
      ...scene,
      encounter: game,
      position: { x: (index % 6) * 300, y: lowest + 220 + Math.floor(index / 6) * 220 },
    };
  });
  const known = new Set(campaign.people.map((person) => person.characterId));
  return {
    campaign: {
      ...campaign,
      placeIds: [...new Set([...campaign.placeIds, ...scenes.map((scene) => scene.placeId)])],
      objectIds: [
        ...new Set([...campaign.objectIds, ...scenes.flatMap((scene) => scene.objectIds)]),
      ],
      people: [
        ...campaign.people,
        ...built.campaign.people.filter((person) => !known.has(person.characterId)),
      ],
      scenes: [...campaign.scenes, ...scenes],
      sceneLinks: [...campaign.sceneLinks, ...links],
    },
    added: scenes.length,
    skipped,
    reconnected: campaign.scenes
      .filter((scene) => reconnected.has(scene.id))
      .map((scene) => scene.name),
  };
}

/** The scenes reachable from one scene over the author's ways that have no condition and no door. */
function freelyFrom(campaign: CampaignTemplate, startId: string): Set<string> {
  const seen = new Set<string>([startId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const link of campaign.sceneLinks) {
      const free =
        link.requiresFlags.length === 0 &&
        link.requiresAbsentFlags.length === 0 &&
        (link.requiresOpenBarriers ?? []).length === 0;
      if (free && seen.has(link.fromSceneId) && !seen.has(link.toSceneId)) {
        seen.add(link.toSceneId);
        grew = true;
      }
    }
  }
  return seen;
}

/**
 * The scenes a new way may lead into: those the player reaches without any condition or door
 * from where the game starts. A new way into any other scene could be a detour round a condition
 * or a door anywhere further back. When the start is not known, any scene could be it, so only
 * the scenes that are freely reachable from every one of them count.
 */
function reachableFreely(campaign: CampaignTemplate, startSceneId?: string): Set<string> {
  if (startSceneId && campaign.scenes.some((scene) => scene.id === startSceneId))
    return freelyFrom(campaign, startSceneId);
  const [first, ...rest] = campaign.scenes;
  if (!first) return new Set();
  let allowed = freelyFrom(campaign, first.id);
  for (const scene of rest) {
    const reach = freelyFrom(campaign, scene.id);
    allowed = new Set([...allowed].filter((id) => reach.has(id)));
  }
  return allowed;
}

/**
 * One line for the author about what "Beyond the story" does to this adventure: how many more
 * places get scenes, and how many ways and places are left out. It cannot know where a game will
 * start, so it assumes any scene could be the start and leaves out what that would make unsafe.
 */
export function describeOpenWorld(
  campaign: CampaignTemplate,
  world: RealmTemplate,
  library: ScaffoldLibrary,
): string | undefined {
  if (campaign.openWorld !== "map" || !world.worldMap) return undefined;
  let result: ReturnType<typeof scaffoldIntoAdventure>;
  try {
    result = scaffoldIntoAdventure(campaign, world, library);
  } catch (reason) {
    return reason instanceof Error ? `Beyond the story: ${reason.message}` : undefined;
  }
  const ways = result.skipped.filter((line) => /^The (locked )?way /.test(line)).length;
  const places = result.skipped.filter(
    (line) =>
      !/^The (locked )?way /.test(line) && !/already has a scene|Nothing in range/.test(line),
  ).length;
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
  const left = [ways ? count(ways, "way") : "", places ? count(places, "place") : ""].filter(
    Boolean,
  );
  return `With “Beyond the story” on, ${
    result.added === 0
      ? "no more places get scenes"
      : `${count(result.added, "more place")} get scenes`
  } when a game starts${left.length ? `; ${left.join(" and ")} left out` : ""}.`;
}
