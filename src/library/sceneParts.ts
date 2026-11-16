import type { CampaignScene, CharacterTemplate, ObjectTemplate } from "./LibrarySchema";
import type { Actor, EncounterGame } from "../game/EncounterSchema";
import { validateEncounter } from "../game/EncounterEngine";

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
