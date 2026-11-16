import type {
  CampaignScene,
  CampaignTemplate,
  CharacterTemplate,
  ObjectTemplate,
} from "./LibrarySchema";
import type { Actor, EncounterGame } from "../game/EncounterSchema";
import { validateEncounter } from "../game/EncounterEngine";
import { InteractionSchema } from "../game/EncounterSchema";

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
  const carried = Object.values(game.state.actors).flatMap((actor) =>
    actor.inventory.map((itemId) => ({ itemId, where: { heldBy: actor.id } as ItemPlace })),
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

function withoutItem(game: EncounterGame, itemId: string) {
  delete game.state.itemLocations[itemId];
  for (const actor of Object.values(game.state.actors))
    actor.inventory = actor.inventory.filter((held) => held !== itemId);
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
      description: object.note,
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
    holder.inventory.push(object.id);
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
