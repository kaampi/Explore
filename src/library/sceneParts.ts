import type {
  CampaignScene,
  CampaignTemplate,
  CharacterTemplate,
  ObjectTemplate,
} from "./LibrarySchema";
import type { Actor, EncounterGame } from "../game/EncounterSchema";
import { validateEncounter } from "../game/EncounterEngine";
import { InteractionSchema } from "../game/EncounterSchema";
import { levelModifier } from "../game/rules";
import { itemDescription, skillIdFor } from "./sceneSync";

/**
 * Small, pure operations that change the parts of a scene: who is here, what is here.
 * Each takes a scene and returns a new one, or throws an Error with a message the author
 * can read and changes nothing. The result always passes `validateEncounter`.
 */

/** Where an item can be put: on a position in the scene, or in someone's hands. */
export type ItemPlace = { position: string } | { heldBy: string };

type SceneWithGame = CampaignScene & { encounter: EncounterGame };

function requireGame(scene: CampaignScene): SceneWithGame {
  if (!scene.encounter) throw new Error("Make the scene playable first.");
  return scene as SceneWithGame;
}

function finish(scene: SceneWithGame, game: EncounterGame): CampaignScene {
  validateEncounter(game);
  return { ...scene, encounter: game };
}

export const actorIdFor = (characterId: string) => `npc:${characterId}`;

/** Who is here: every non-player actor in the scene. */
export function peopleHere(scene: CampaignScene): Actor[] {
  const game = scene.encounter;
  if (!game) return [];
  return Object.values(game.state.actors).filter((actor) => actor.id !== game.definition.playerId);
}

/** Items that are placed in the scene, on a position or in someone's hands. */
export function itemsHere(scene: CampaignScene): { itemId: string; where: ItemPlace }[] {
  const game = scene.encounter;
  if (!game) return [];
  const placed = Object.entries(game.state.itemLocations).map(([itemId, position]) => ({
    itemId,
    where: { position } as ItemPlace,
  }));
  const known = new Set(game.definition.items.map((item) => item.id));
  const carried = Object.values(game.state.actors).flatMap((actor) =>
    [...actor.inventory, ...actor.weapons.filter((id) => known.has(id))].map((itemId) => ({
      itemId,
      where: { heldBy: actor.id } as ItemPlace,
    })),
  );
  return [...placed, ...carried];
}

function actionsMentioning(game: EncounterGame, actorId: string): string[] {
  return game.definition.interactions
    .filter((action) => {
      if (action.counterpartyId === actorId) return true;
      const effects = [...action.success.effects, ...action.failure.effects];
      return effects.some(
        (effect) =>
          (effect.kind === "transfer-item" || effect.kind === "transfer-resource") &&
          (effect.from === actorId || effect.to === actorId),
      );
    })
    .map((action) => action.label.trim() || "An untitled action");
}

function actionsUsingItem(game: EncounterGame, itemId: string): string[] {
  return game.definition.interactions
    .filter((action) =>
      [...action.success.effects, ...action.failure.effects].some(
        (effect) =>
          (effect.kind === "take-item" && effect.itemId === itemId) ||
          (effect.kind === "transfer-item" && effect.itemId === itemId),
      ),
    )
    .map((action) => action.label.trim() || "An untitled action");
}

function emptyCast(characterId: string, mood: string) {
  return {
    characterId,
    position: "",
    mood,
    clothing: "",
    holding: "",
    trust: "20",
    familiarity: "10",
    tension: "5",
  };
}

/** Put a person from the Cast in the scene, where the player starts. */
export function addPerson(scene: CampaignScene, person: CharacterTemplate): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  const id = actorIdFor(person.id);
  if (game.state.actors[id]) throw new Error(`${person.name} is already here.`);
  const player = game.state.actors[game.definition.playerId]!;
  game.state.actors[id] = {
    id,
    name: person.name,
    team: "residents",
    control: "npc",
    position: player.position,
    hp: 12,
    maxHp: 12,
    stats: {},
    weapons: [],
    inventory: [],
    ammunition: {},
    resources: {},
    disposition: "active",
    defending: false,
    actionsLeft: 1,
    movesLeft: 1,
  };
  const next = finish(current, game);
  return {
    ...next,
    people: scene.people.some((pick) => pick.characterId === person.id)
      ? scene.people
      : [...scene.people, emptyCast(person.id, person.mood)],
  };
}

/** Take a person out of the scene. Refused while an action or exchange involves them. */
export function removePerson(scene: CampaignScene, characterId: string): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  const id = actorIdFor(characterId);
  const actor = game.state.actors[id];
  if (!actor) return scene;
  const involved = actionsMentioning(game, id);
  if (involved.length > 0)
    throw new Error(
      `${actor.name} is part of “${involved[0]}”. Change or remove that action first.`,
    );
  if (actor.inventory.length > 0)
    throw new Error(`${actor.name} is carrying something. Place it somewhere else first.`);
  delete game.state.actors[id];
  const next = finish(current, game);
  return { ...next, people: scene.people.filter((pick) => pick.characterId !== characterId) };
}

/** Rounds a carrier gets with a new weapon that uses ammunition. */
export const STARTING_AMMUNITION = 6;

/** The weapon record the engine reads, made from a thing's card. */
export function weaponRecord(
  object: ObjectTemplate,
): EncounterGame["definition"]["weapons"][number] {
  const weapon = object.weapon!;
  return {
    id: object.id,
    name: object.name,
    skill: weapon.skill,
    kind: weapon.kind,
    damage: weapon.damage,
    ...(weapon.range !== undefined ? { range: weapon.range } : {}),
    usesAmmunition: weapon.usesAmmunition,
  };
}

function upsertWeapon(game: EncounterGame, object: ObjectTemplate) {
  const record = weaponRecord(object);
  const others = game.definition.weapons.filter((existing) => existing.id !== object.id);
  game.definition.weapons = [...others, record];
}

function withoutItem(game: EncounterGame, itemId: string) {
  delete game.state.itemLocations[itemId];
  for (const actor of Object.values(game.state.actors)) {
    actor.inventory = actor.inventory.filter((held) => held !== itemId);
    actor.weapons = actor.weapons.filter((held) => held !== itemId);
    delete actor.ammunition[itemId];
    if (actor.tactics) {
      const first = actor.weapons[0];
      if (!first) delete actor.tactics;
      else {
        if (actor.tactics.preferredWeapon === itemId) actor.tactics.preferredWeapon = first;
        if (actor.tactics.fallbackWeapon === itemId) delete actor.tactics.fallbackWeapon;
      }
    }
  }
  const stillCarried = Object.values(game.state.actors).some((actor) =>
    actor.weapons.includes(itemId),
  );
  const cameFromACard = game.definition.items.some((item) => item.id === itemId);
  if (!stillCarried && cameFromACard)
    game.definition.weapons = game.definition.weapons.filter((weapon) => weapon.id !== itemId);
}

/** Put an item from Things in the scene. An item is in one place at a time. */
export function placeItem(
  scene: CampaignScene,
  object: ObjectTemplate,
  where: ItemPlace,
): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  withoutItem(game, object.id);
  if (!game.definition.items.some((item) => item.id === object.id))
    game.definition.items.push({
      id: object.id,
      name: object.name,
      description: itemDescription(object),
      requiresFlags: [],
      ...(object.readableContent ? { readableContent: object.readableContent } : {}),
      ...(object.imageDataUrl ? { imageDataUrl: object.imageDataUrl } : {}),
    });
  if ("position" in where) {
    if (!game.definition.places.some((place) => place.id === where.position))
      throw new Error("That position is not in this scene.");
    game.state.itemLocations[object.id] = where.position;
  } else {
    const holder = game.state.actors[where.heldBy];
    if (!holder) throw new Error("That person is not in this scene.");
    if (object.weapon) {
      upsertWeapon(game, object);
      holder.weapons.push(object.id);
      if (object.weapon.usesAmmunition) holder.ammunition[object.id] = STARTING_AMMUNITION;
    } else holder.inventory.push(object.id);
  }
  const next = finish(current, game);
  return {
    ...next,
    objectIds: scene.objectIds.includes(object.id)
      ? scene.objectIds
      : [...scene.objectIds, object.id],
  };
}

/** Take an item out of the scene. Refused while an action or a door needs it. */
export function removeItem(scene: CampaignScene, objectId: string): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  const name = game.definition.items.find((item) => item.id === objectId)?.name ?? "That item";
  const inside = containedIn(game, objectId);
  if (inside.length > 0)
    throw new Error(`${name} still holds ${inside.join(", ")}. Take those out first.`);
  const used = actionsUsingItem(game, objectId);
  if (used.length > 0)
    throw new Error(`${name} is used by “${used[0]}”. Change or remove that action first.`);
  const door = Object.values(game.state.barriers).find((barrier) => barrier.keyId === objectId);
  if (door) throw new Error(`${name} is the key to “${door.name}”. Change that door first.`);
  withoutItem(game, objectId);
  const next = finish(current, game);
  return { ...next, objectIds: scene.objectIds.filter((id) => id !== objectId) };
}

/** The action that lets the player take an item, if the scene has one. */
export function pickUpAction(scene: CampaignScene, objectId: string) {
  return scene.encounter?.definition.interactions.find((action) =>
    action.success.effects.some(
      (effect) => effect.kind === "take-item" && effect.itemId === objectId,
    ),
  );
}

/**
 * A ready-made action: take an item that lies on a position. It is an ordinary action, so it
 * can be edited afterwards. Taking the item records a discovery that can open a way on, and
 * the action goes away once the item is taken.
 */
export function addPickUp(scene: CampaignScene, objectId: string): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  const item = game.definition.items.find((entry) => entry.id === objectId);
  const position = game.state.itemLocations[objectId];
  if (!item || !position) throw new Error("Place the thing on a position first.");
  if (pickUpAction(scene, objectId)) throw new Error(`${item.name} can already be taken.`);
  const flag = `taken:${objectId}`;
  game.definition.interactions.push(
    InteractionSchema.parse({
      id: crypto.randomUUID(),
      label: `Take ${item.name}`,
      description: "",
      position,
      once: true,
      excludesFlags: [flag],
      success: {
        text: `You take the ${item.name.toLowerCase()}.`,
        effects: [
          { kind: "take-item", itemId: objectId },
          { kind: "flag", flag },
        ],
      },
      failure: { text: "You cannot reach it.", effects: [] },
    }),
  );
  return finish(current, game);
}

export const TRY_VERBS = ["Lift", "Force", "Open", "Use", "Examine"] as const;

/**
 * The skill a "Try" on this card rolls against: the card's check attribute matched as in the
 * weapon rule (id first, then name), else the scene's first number skill. `matched` is false
 * when the card names something the scene does not have. Without scales the player's own first
 * value is used; with none at all the author has to choose.
 */
export function trySkill(
  scene: CampaignScene,
  object: ObjectTemplate,
): { id: string; matched: boolean } | undefined {
  const game = requireGame(scene).encounter;
  const scales = game.definition.rules.attributes;
  const text = object.checkAttribute?.trim();
  if (scales.length > 0) {
    if (text) {
      const id = skillIdFor(text, { scales });
      if (scales.some((scale) => scale.id === id)) return { id, matched: true };
    }
    return { id: scales[0]!.id, matched: !text };
  }
  const own = Object.keys(game.state.actors[game.definition.playerId]?.stats ?? {});
  if (text && own.includes(text)) return { id: text, matched: true };
  const first = own[0];
  return first ? { id: first, matched: !text } : undefined;
}

/**
 * A ready-made action for a thing that lies on a position: try to lift, force, open or use it,
 * with a roll. The difficulty comes from the card's level. It is an ordinary action afterwards,
 * so the author can rewrite the texts and add effects.
 */
export function addTry(
  scene: CampaignScene,
  object: ObjectTemplate,
  options: { verb: string; attribute?: string },
): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  const item = game.definition.items.find((entry) => entry.id === object.id);
  const position = game.state.itemLocations[object.id];
  if (!item || !position) throw new Error("Place the thing on a position first.");
  const verb = options.verb.trim();
  if (!verb) throw new Error("Say what the player tries to do.");
  const stat = options.attribute ?? trySkill(scene, object)?.id;
  if (!stat) throw new Error("Choose the skill the roll uses.");
  const known = [
    ...game.definition.rules.attributes.map((scale) => scale.id),
    ...Object.keys(game.state.actors[game.definition.playerId]?.stats ?? {}),
  ];
  if (!known.includes(stat)) throw new Error(`“${stat}” is not a skill in this scene.`);
  const name = item.name.toLowerCase();
  game.definition.interactions.push(
    InteractionSchema.parse({
      id: crypto.randomUUID(),
      label: `${verb} ${item.name}`,
      description: "",
      position,
      once: false,
      check: {
        stat,
        modifier: object.checkLevel ? levelModifier(object.checkLevel) : 0,
      },
      success: {
        text: `You manage it with the ${name}.`,
        effects: [{ kind: "flag", flag: `done:${object.id}` }],
      },
      failure: { text: `The ${name} does not give.`, effects: [] },
    }),
  );
  return finish(current, game);
}

/** The things a container holds: hidden until the container's `opened:` flag is set. */
function containedIn(game: EncounterGame, containerId: string): string[] {
  const flag = `opened:${containerId}`;
  return game.definition.items
    .filter((item) => item.requiresFlags.includes(flag))
    .map((item) => item.name);
}

/** The things a container holds, by name. */
export const containerContents = (scene: CampaignScene, containerId: string): string[] =>
  scene.encounter ? containedIn(scene.encounter, containerId) : [];

/** The action that opens a container, if the scene has one. */
export function openAction(scene: CampaignScene, containerId: string) {
  return scene.encounter?.definition.interactions.find((action) =>
    action.success.effects.some(
      (effect) => effect.kind === "flag" && effect.flag === `opened:${containerId}`,
    ),
  );
}

/**
 * A ready-made container: a thing that opens, with things inside that show only once it is
 * open and can then be taken. A locked one needs a key the player carries. All of it is
 * ordinary actions and hidden things, so it can be changed afterwards.
 */
export function addContainer(
  scene: CampaignScene,
  container: ObjectTemplate,
  options: { contents: ObjectTemplate[]; key?: ObjectTemplate },
): CampaignScene {
  const start = requireGame(scene);
  const position = start.encounter.state.itemLocations[container.id];
  if (!start.encounter.definition.items.some((item) => item.id === container.id) || !position)
    throw new Error("Place the thing on a position first.");
  if (!container.openable)
    throw new Error(`${container.name} is not marked as something that opens.`);
  if (openAction(scene, container.id)) throw new Error(`${container.name} can already be opened.`);
  const { key } = options;
  if (key) {
    if (!container.lockable) throw new Error(`${container.name} is not marked as lockable.`);
    if (key.weapon || start.encounter.definition.weapons.some((w) => w.id === key.id))
      throw new Error(`${key.name} is a weapon, so it cannot be a key. Use another thing.`);
    if (!start.encounter.definition.items.some((item) => item.id === key.id))
      throw new Error(`Put ${key.name} in the scene first, so the player can find it.`);
  }
  const flag = `opened:${container.id}`;
  let next: CampaignScene = scene;
  for (const content of options.contents) {
    if (content.weapon) throw new Error(`${content.name} is a weapon and cannot be put inside.`);
    if (next.encounter!.definition.items.some((item) => item.id === content.id))
      throw new Error(`${content.name} is already in the scene.`);
    next = placeItem(next, content, { position });
    const tagged = structuredClone(next.encounter!);
    tagged.definition.items.find((item) => item.id === content.id)!.requiresFlags = [flag];
    next = finish(requireGame(next), tagged);
    next = addPickUp(next, content.id);
  }
  const current = requireGame(next);
  const game = structuredClone(current.encounter);
  const name = container.name.toLowerCase();
  game.definition.interactions.push(
    InteractionSchema.parse({
      id: crypto.randomUUID(),
      label: `Open ${container.name}`,
      description: "",
      position,
      once: true,
      requiresItems: key ? [key.id] : [],
      success: { text: `You open the ${name}.`, effects: [{ kind: "flag", flag }] },
      failure: { text: `The ${name} stays shut.`, effects: [] },
    }),
  );
  return finish(current, game);
}

/** A door to add. A locked door needs the thing that opens it. */
export type NewDoor = {
  name: string;
  position: string;
  locked: boolean;
  keyId?: string | undefined;
};

/** The doors of a scene. */
export function doorsHere(scene: CampaignScene) {
  return Object.values(scene.encounter?.state.barriers ?? {});
}

/** Add a door at a position. Say where it sits afterwards, between positions or on a route. */
export function addDoor(
  scene: CampaignScene,
  door: NewDoor,
  id: string = crypto.randomUUID(),
): { scene: CampaignScene; doorId: string } {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  const name = door.name.trim();
  if (!name) throw new Error("Name the door.");
  if (!game.definition.places.some((place) => place.id === door.position))
    throw new Error("That position is not in this scene.");
  if (door.locked && !door.keyId?.trim())
    throw new Error(
      "A locked door needs a thing that opens it. Choose a key, or leave it unlocked.",
    );
  game.state.barriers[id] = {
    id,
    name,
    open: false,
    locked: door.locked,
    blocked: false,
    position: door.position,
    ...(door.locked && door.keyId ? { keyId: door.keyId.trim() } : {}),
  };
  return { scene: finish(current, game), doorId: id };
}

function connectionBetween(game: EncounterGame, from: string, to: string) {
  const same = (link: { from: string; to: string }) =>
    (link.from === from && link.to === to) || (link.from === to && link.to === from);
  return game.definition.connections.find(same);
}

/** Put a door on the way between two positions. */
export function attachDoorToConnection(
  scene: CampaignScene,
  doorId: string,
  from: string,
  to: string,
): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  if (!game.state.barriers[doorId]) throw new Error("That door is not in this scene.");
  const connection = connectionBetween(game, from, to);
  if (!connection) throw new Error("Those positions are not connected.");
  if (connection.barrierId && connection.barrierId !== doorId)
    throw new Error("There is already a door on that way.");
  connection.barrierId = doorId;
  for (const sight of game.definition.sightLines) {
    const same =
      (sight.from === from && sight.to === to) || (sight.from === to && sight.to === from);
    if (same) sight.barrierId = doorId;
  }
  return finish(current, game);
}

function sceneById(campaign: CampaignTemplate, id: string) {
  return campaign.scenes.find((scene) => scene.id === id);
}

/**
 * Put a door on a route to another scene. The door is shared, so it is the same door on both
 * sides, with the same key, and the route only opens once the door is open.
 */
export function attachDoorToRoute(
  campaign: CampaignTemplate,
  sceneId: string,
  doorId: string,
  linkId: string,
): CampaignTemplate {
  const from = sceneById(campaign, sceneId);
  const link = campaign.sceneLinks.find((item) => item.id === linkId);
  if (!from?.encounter) throw new Error("Make the scene playable first.");
  if (!link || link.fromSceneId !== sceneId) throw new Error("That route does not start here.");
  const door = from.encounter.state.barriers[doorId];
  if (!door) throw new Error("That door is not in this scene.");
  const to = sceneById(campaign, link.toSceneId);
  if (!to?.encounter) throw new Error(`Make “${to?.name || "the next scene"}” playable first.`);
  const sourceGame = structuredClone(from.encounter);
  const targetGame = structuredClone(to.encounter);
  sourceGame.state.barriers[doorId]!.shared = true;
  const existing = targetGame.state.barriers[doorId];
  if (existing && existing.keyId !== door.keyId)
    throw new Error("The other side already has a door with that name but another key.");
  const arrival = targetGame.state.actors[targetGame.definition.playerId]!.position;
  targetGame.state.barriers[doorId] = {
    ...door,
    shared: true,
    position: existing?.position ?? arrival,
  };
  validateEncounter(sourceGame);
  validateEncounter(targetGame);
  const required = new Set([...(link.requiresOpenBarriers ?? []), doorId]);
  return {
    ...campaign,
    scenes: campaign.scenes.map((scene) => {
      if (scene.id === from.id) return { ...scene, encounter: sourceGame };
      if (scene.id === to.id) return { ...scene, encounter: targetGame };
      return scene;
    }),
    sceneLinks: campaign.sceneLinks.map((item) =>
      item.id === linkId ? { ...item, requiresOpenBarriers: [...required] } : item,
    ),
  };
}

/** Remove a door, and every way it was used: connections, sight lines, routes and shared copies. */
export function removeDoor(
  campaign: CampaignTemplate,
  sceneId: string,
  doorId: string,
): CampaignTemplate {
  const scene = sceneById(campaign, sceneId);
  const door = scene?.encounter?.state.barriers[doorId];
  if (!scene?.encounter || !door) return campaign;
  const scenes = campaign.scenes.map((item) => {
    if (!item.encounter) return item;
    const everywhere = door.shared === true && item.encounter.state.barriers[doorId]?.shared;
    if (item.id !== sceneId && !everywhere) return item;
    const game = structuredClone(item.encounter);
    delete game.state.barriers[doorId];
    for (const link of [...game.definition.connections, ...game.definition.sightLines])
      if (link.barrierId === doorId) delete link.barrierId;
    validateEncounter(game);
    return { ...item, encounter: game };
  });
  return {
    ...campaign,
    scenes,
    sceneLinks: campaign.sceneLinks.map((link) =>
      link.requiresOpenBarriers?.includes(doorId)
        ? {
            ...link,
            requiresOpenBarriers: link.requiresOpenBarriers.filter((id) => id !== doorId),
          }
        : link,
    ),
  };
}

/** How far a new position is from the one it is joined to. The numbers are metres. */
export const POSITION_DISTANCES = { close: 2, away: 8, far: 20 } as const;
export type PositionDistance = keyof typeof POSITION_DISTANCES;

/** How much a position protects against being hit. */
export const COVER_LEVELS = { none: 0, some: 15, good: 30 } as const;
export type CoverLevel = keyof typeof COVER_LEVELS;

const GOLDEN_ANGLE = 137.5 * (Math.PI / 180);

function samePair(link: { from: string; to: string }, a: string, b: string) {
  return (link.from === a && link.to === b) || (link.from === b && link.to === a);
}

function requirePosition(game: EncounterGame, id: string) {
  const place = game.definition.places.find((item) => item.id === id);
  if (!place) throw new Error("That position is not in this scene.");
  return place;
}

/**
 * Add a position, a given distance from one that exists, and join the two so the player can
 * walk between them and see across. Where it lies is worked out from the distance.
 */
export function addPosition(
  scene: CampaignScene,
  position: { name: string; from: string; distance: PositionDistance },
  id: string = crypto.randomUUID(),
): { scene: CampaignScene; positionId: string } {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  const name = position.name.trim();
  if (!name) throw new Error("Name the position.");
  if (game.definition.places.some((place) => place.name.toLowerCase() === name.toLowerCase()))
    throw new Error(`There is already a position called “${name}”.`);
  const origin = requirePosition(game, position.from);
  const metres = POSITION_DISTANCES[position.distance];
  const angle = game.definition.places.length * GOLDEN_ANGLE;
  game.definition.places.push({
    id,
    name,
    x: Math.round((origin.x + metres * Math.cos(angle)) * 10) / 10,
    y: Math.round((origin.y + metres * Math.sin(angle)) * 10) / 10,
    elevation: origin.elevation,
    cover: 0,
  });
  game.definition.connections.push({ from: origin.id, to: id });
  game.definition.sightLines.push({ from: origin.id, to: id });
  return { scene: finish(current, game), positionId: id };
}

export function renamePosition(scene: CampaignScene, id: string, name: string): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  const place = requirePosition(game, id);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name the position.");
  if (
    game.definition.places.some(
      (other) => other.id !== id && other.name.toLowerCase() === trimmed.toLowerCase(),
    )
  )
    throw new Error(`There is already a position called “${trimmed}”.`);
  place.name = trimmed;
  return finish(current, game);
}

/** What stops a position from being removed: someone or something is there, or points there. */
function positionUsedBy(game: EncounterGame, id: string): string | undefined {
  const person = Object.values(game.state.actors).find((actor) => actor.position === id);
  if (person) return `${person.name} is there.`;
  const itemId = Object.entries(game.state.itemLocations).find(([, where]) => where === id)?.[0];
  if (itemId)
    return `${game.definition.items.find((item) => item.id === itemId)?.name ?? "A thing"} lies there.`;
  const door = Object.values(game.state.barriers).find((barrier) => barrier.position === id);
  if (door) return `“${door.name}” stands there.`;
  const action = game.definition.interactions.find((item) => item.position === id);
  if (action) return `“${action.label.trim() || "An untitled action"}” happens there.`;
  return undefined;
}

export function removePosition(scene: CampaignScene, id: string): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  const place = requirePosition(game, id);
  if (game.definition.places.length === 1) throw new Error("A scene needs at least one position.");
  const used = positionUsedBy(game, id);
  if (used) throw new Error(`“${place.name}” cannot be removed. ${used}`);
  game.definition.places = game.definition.places.filter((item) => item.id !== id);
  game.definition.connections = game.definition.connections.filter(
    (link) => link.from !== id && link.to !== id,
  );
  game.definition.sightLines = game.definition.sightLines.filter(
    (link) => link.from !== id && link.to !== id,
  );
  return finish(current, game);
}

/** Let the player walk between two positions, and see across. */
export function connectPositions(scene: CampaignScene, from: string, to: string): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  requirePosition(game, from);
  requirePosition(game, to);
  if (from === to) throw new Error("Choose two different positions.");
  if (game.definition.connections.some((link) => samePair(link, from, to)))
    throw new Error("Those positions are already connected.");
  game.definition.connections.push({ from, to });
  if (!game.definition.sightLines.some((link) => samePair(link, from, to)))
    game.definition.sightLines.push({ from, to });
  return finish(current, game);
}

/** Take away the way between two positions, and the view across with it. */
export function disconnectPositions(scene: CampaignScene, from: string, to: string): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  if (!game.definition.connections.some((link) => samePair(link, from, to)))
    throw new Error("Those positions are not connected.");
  game.definition.connections = game.definition.connections.filter(
    (link) => !samePair(link, from, to),
  );
  game.definition.sightLines = game.definition.sightLines.filter(
    (link) => !samePair(link, from, to),
  );
  return finish(current, game);
}

/** Let the player see between two positions without a way between them, for example up to a wall. */
export function setSight(
  scene: CampaignScene,
  from: string,
  to: string,
  visible: boolean,
): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  requirePosition(game, from);
  requirePosition(game, to);
  if (from === to) throw new Error("Choose two different positions.");
  const has = game.definition.sightLines.some((link) => samePair(link, from, to));
  if (visible && !has) game.definition.sightLines.push({ from, to });
  if (!visible) {
    if (game.definition.connections.some((link) => samePair(link, from, to)))
      throw new Error("They are connected. Take away the way between them to hide the view.");
    game.definition.sightLines = game.definition.sightLines.filter(
      (link) => !samePair(link, from, to),
    );
  }
  return finish(current, game);
}

export function setPositionDetail(
  scene: CampaignScene,
  id: string,
  detail: { cover?: CoverLevel; elevation?: number },
): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  const place = requirePosition(game, id);
  if (detail.cover !== undefined) place.cover = COVER_LEVELS[detail.cover];
  if (detail.elevation !== undefined) {
    if (!Number.isFinite(detail.elevation) || Math.abs(detail.elevation) > 1000)
      throw new Error("Give the height in metres.");
    place.elevation = detail.elevation;
  }
  return finish(current, game);
}

/** The positions the player can walk to from where they start, ignoring doors. */
export function reachablePositions(scene: CampaignScene): Set<string> {
  const game = scene.encounter;
  if (!game) return new Set();
  const start = game.state.actors[game.definition.playerId]?.position;
  const seen = new Set<string>(start ? [start] : []);
  const queue = start ? [start] : [];
  while (queue.length > 0) {
    const here = queue.shift()!;
    for (const link of game.definition.connections) {
      const next = link.from === here ? link.to : link.to === here ? link.from : undefined;
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/** Change how much ammunition a person carries for a weapon they hold. */
export function setAmmunition(
  scene: CampaignScene,
  actorId: string,
  weaponId: string,
  rounds: number,
): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  const actor = game.state.actors[actorId];
  if (!actor?.weapons.includes(weaponId)) throw new Error("They are not carrying that weapon.");
  if (!game.definition.weapons.find((weapon) => weapon.id === weaponId)?.usesAmmunition)
    throw new Error("That weapon does not use ammunition.");
  if (!Number.isInteger(rounds) || rounds < 0 || rounds > 999)
    throw new Error("Give a whole number of rounds, 0 or more.");
  actor.ammunition[weaponId] = rounds;
  return finish(current, game);
}

/** How a person stands towards the player. Hostile people fight; the rest only talk. */
export type Attitude = "neutral" | "hostile";
export const HOSTILE_TEAM = "opponents";
export const NEUTRAL_TEAM = "residents";

/** How much of the player's health each toughness is. */
export const TOUGHNESS_SHARE = { weak: 0.3, normal: 0.6, tough: 1 } as const;
export type Toughness = keyof typeof TOUGHNESS_SHARE;
/** The player's health when the rule-set names none. */
export const DEFAULT_PLAYER_HEALTH = 20;

/** Health for a toughness: its share of the player's health, at least 1. 20 gives 6, 12 and 20. */
export function healthFor(toughness: Toughness, playerHealth: number): number {
  return Math.max(1, Math.round(TOUGHNESS_SHARE[toughness] * playerHealth));
}

function requireNpc(game: EncounterGame, characterId: string) {
  const actor = game.state.actors[actorIdFor(characterId)];
  if (!actor) throw new Error("That person is not in this scene.");
  return actor;
}

/** Whether a person is an opponent of the player, by the sides the scene says are hostile. */
export function isHostile(game: EncounterGame, actor: Actor): boolean {
  const player = game.state.actors[game.definition.playerId]!;
  return game.definition.hostilities.some(
    ([a, b]) => (a === player.team && b === actor.team) || (b === player.team && a === actor.team),
  );
}

/** Make a person hostile (fights the player) or neutral again. */
export function setAttitude(
  scene: CampaignScene,
  characterId: string,
  attitude: Attitude,
): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  const actor = requireNpc(game, characterId);
  const playerTeam = game.state.actors[game.definition.playerId]!.team;
  const pair = (a: string, b: string) => (a === b ? null : ([a, b] as [string, string]));
  if (attitude === "hostile") {
    actor.team = HOSTILE_TEAM;
    if (
      !game.definition.hostilities.some(([a, b]) =>
        samePair({ from: a, to: b }, playerTeam, HOSTILE_TEAM),
      )
    )
      game.definition.hostilities.push(pair(playerTeam, HOSTILE_TEAM)!);
  } else {
    actor.team = NEUTRAL_TEAM;
    const anyLeft = Object.values(game.state.actors).some((other) => other.team === HOSTILE_TEAM);
    if (!anyLeft)
      game.definition.hostilities = game.definition.hostilities.filter(
        ([a, b]) => !samePair({ from: a, to: b }, playerTeam, HOSTILE_TEAM),
      );
    delete actor.tactics;
  }
  return finish(current, game);
}

/** How tough a person is. Their health follows, and the sync keeps it in step with the player's. */
export function setToughness(
  scene: CampaignScene,
  characterId: string,
  toughness: Toughness,
): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  const actor = requireNpc(game, characterId);
  const playerHealth = game.definition.rules.playerHealth ?? DEFAULT_PLAYER_HEALTH;
  actor.toughness = toughness;
  actor.maxHp = healthFor(toughness, playerHealth);
  actor.hp = actor.maxHp;
  return finish(current, game);
}

/**
 * The toughness a person has. A person made before toughness was kept is read from their
 * health, if it matches one of the choices at the normal player health.
 */
export function toughnessOf(actor: Actor): Toughness | undefined {
  if (actor.toughness) return actor.toughness;
  return (Object.keys(TOUGHNESS_SHARE) as Toughness[]).find(
    (key) => healthFor(key, DEFAULT_PLAYER_HEALTH) === actor.maxHp,
  );
}

/** When a hostile person gives up the fight and where they run to. */
export function setTactics(
  scene: CampaignScene,
  characterId: string,
  tactics: { retreatAt?: number; escapeTo?: string | null },
): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  const actor = requireNpc(game, characterId);
  const first = actor.weapons[0];
  if (!first) throw new Error(`Give ${actor.name} a weapon first.`);
  const existing = actor.tactics ?? { preferredWeapon: first, retreatAt: 0, repositionTo: [] };
  const next = {
    ...existing,
    preferredWeapon: actor.weapons.includes(existing.preferredWeapon)
      ? existing.preferredWeapon
      : first,
  };
  if (tactics.retreatAt !== undefined) {
    if (
      !Number.isFinite(tactics.retreatAt) ||
      tactics.retreatAt < 0 ||
      tactics.retreatAt > actor.maxHp
    )
      throw new Error(`Retreat at a health from 0 to ${actor.maxHp}.`);
    next.retreatAt = tactics.retreatAt;
  }
  if (tactics.escapeTo !== undefined) {
    if (tactics.escapeTo === null) delete (next as { escapeTo?: string }).escapeTo;
    else {
      requirePosition(game, tactics.escapeTo);
      next.escapeTo = tactics.escapeTo;
    }
  }
  actor.tactics = next;
  return finish(current, game);
}

/** Whether an outcome of an action makes a fight break out. */
export function fightBreaksOut(
  scene: CampaignScene,
  actionId: string,
  outcome: "success" | "failure",
): boolean {
  const action = scene.encounter?.definition.interactions.find((item) => item.id === actionId);
  return Boolean(action?.[outcome].effects.some((effect) => effect.kind === "start-combat"));
}

/**
 * Make a fight break out when an action ends one way or the other. It only does anything if
 * someone hostile is still fighting fit at that moment, and a scene with no hostile person is
 * refused.
 */
export function setFightBreaksOut(
  scene: CampaignScene,
  actionId: string,
  outcome: "success" | "failure",
  on: boolean,
): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  const action = game.definition.interactions.find((item) => item.id === actionId);
  if (!action) throw new Error("That action is not in this scene.");
  if (outcome === "failure" && !action.check)
    throw new Error("Only an action that rolls can fail.");
  const kept = action[outcome].effects.filter((effect) => effect.kind !== "start-combat");
  action[outcome].effects = on ? [...kept, { kind: "start-combat" }] : kept;
  return finish(current, game);
}

/** The door an outcome unlocks, and the one it opens (opening also unlocks). */
export function doorEffects(
  scene: CampaignScene,
  actionId: string,
  outcome: "success" | "failure" = "success",
): { unlocks?: string; opens?: string } {
  const action = scene.encounter?.definition.interactions.find((item) => item.id === actionId);
  const result: { unlocks?: string; opens?: string } = {};
  for (const effect of action?.[outcome].effects ?? []) {
    if (effect.kind !== "set-barrier") continue;
    if (effect.open === true) result.opens = effect.barrierId;
    else if (effect.locked === false) result.unlocks = effect.barrierId;
  }
  return result;
}

/**
 * Make an outcome unlock or open a door of the scene, or stop doing so (an empty door id).
 * Opening a door also unlocks it. Other effects are left alone.
 */
export function setDoorEffect(
  scene: CampaignScene,
  actionId: string,
  what: "unlock" | "open",
  doorId: string,
  outcome: "success" | "failure" = "success",
): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  const action = game.definition.interactions.find((item) => item.id === actionId);
  if (!action) throw new Error("That action is not in this scene.");
  if (outcome === "failure" && !action.check)
    throw new Error("Only an action that rolls can fail.");
  if (doorId && !game.state.barriers[doorId]) throw new Error("That door is not in this scene.");
  const isThis = (effect: (typeof action.success.effects)[number]) =>
    effect.kind === "set-barrier" &&
    (what === "open" ? effect.open === true : effect.open !== true && effect.locked === false);
  const kept = action[outcome].effects.filter((effect) => !isThis(effect));
  action[outcome].effects = doorId
    ? [
        ...kept,
        what === "open"
          ? { kind: "set-barrier", barrierId: doorId, locked: false, open: true }
          : { kind: "set-barrier", barrierId: doorId, locked: false },
      ]
    : kept;
  return finish(current, game);
}

/** Where a person stands when the scene starts. */
export function setPersonPosition(
  scene: CampaignScene,
  characterId: string,
  positionId: string,
): CampaignScene {
  const current = requireGame(scene);
  const game = structuredClone(current.encounter);
  const actor = requireNpc(game, characterId);
  requirePosition(game, positionId);
  actor.position = positionId;
  return finish(current, game);
}

/** A skill the scenes use, and where. */
export type SkillUse = { id: string; name: string; uses: string[] };

/** Every skill that actions roll against and weapons use, with what uses it. */
export function skillsInUse(campaign: CampaignTemplate): SkillUse[] {
  const found = new Map<string, SkillUse>();
  const note = (id: string, name: string, use: string) => {
    const entry = found.get(id) ?? { id, name, uses: [] };
    entry.uses.push(use);
    found.set(id, entry);
  };
  for (const scene of campaign.scenes) {
    const game = scene.encounter;
    if (!game) continue;
    const sceneName = scene.name.trim() || "Untitled scene";
    const nameOf = (id: string) =>
      game.definition.rules.attributes.find((scale) => scale.id === id)?.name ?? id;
    for (const action of game.definition.interactions)
      if (action.check)
        note(
          action.check.stat,
          nameOf(action.check.stat),
          `“${action.label.trim() || "An untitled action"}” in “${sceneName}”`,
        );
    const fromCards = new Set(game.definition.items.map((item) => item.id));
    for (const weapon of game.definition.weapons)
      if (fromCards.has(weapon.id))
        note(weapon.skill, nameOf(weapon.skill), `${weapon.name} (weapon) in “${sceneName}”`);
  }
  return [...found.values()];
}

const aliasKey = (text: string) => text.trim().toLowerCase();

/**
 * Change which skill actions and weapons use: everything that used `fromId` now uses `toId`.
 * The old id and name are remembered, so a weapon card that still says the old skill finds the
 * new one the next time the scenes are brought up to date.
 */
export function remapAttribute(
  campaign: CampaignTemplate,
  fromId: string,
  toId: string,
): CampaignTemplate {
  if (fromId === toId) return campaign;
  const oldName = skillsInUse(campaign).find((skill) => skill.id === fromId)?.name;
  const scenes = campaign.scenes.map((scene) => {
    if (!scene.encounter) return scene;
    const game = structuredClone(scene.encounter);
    for (const action of game.definition.interactions)
      if (action.check?.stat === fromId) action.check.stat = toId;
    for (const weapon of game.definition.weapons) if (weapon.skill === fromId) weapon.skill = toId;
    validateEncounter(game);
    return { ...scene, encounter: game };
  });
  const aliases = Object.fromEntries(
    Object.entries(campaign.skillAliases ?? {}).map(([key, value]) => [
      key,
      value === fromId ? toId : value,
    ]),
  );
  aliases[aliasKey(fromId)] = toId;
  if (oldName) aliases[aliasKey(oldName)] = toId;
  return { ...campaign, scenes, skillAliases: aliases };
}
