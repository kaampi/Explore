import type {
  CampaignScene,
  CampaignTemplate,
  CharacterTemplate,
  ObjectTemplate,
  PlaceTemplate,
} from "./LibrarySchema";
import type { EncounterGame } from "../game/EncounterSchema";
import { validateEncounter } from "../game/EncounterEngine";
import { sceneFormat } from "./sceneFormat";
import { STARTING_AMMUNITION, weaponRecord } from "./sceneParts";

/** The cards a scene's details come from. */
export type SceneLibrary = {
  characters: CharacterTemplate[];
  objects: ObjectTemplate[];
  places: PlaceTemplate[];
};

const MAX_STAT = 100;

/** Numbers from a sheet of text values. Blank and non-numeric values are left out. */
function numericStats(sheet: Record<string, string | number> | undefined): Record<string, number> {
  return Object.fromEntries(
    Object.entries(sheet ?? {})
      .filter(([, value]) => String(value).trim() !== "" && Number.isFinite(Number(value)))
      .map(([name, value]) => [name, Math.max(0, Math.min(MAX_STAT, Number(value)))]),
  );
}

function syncPlayer(campaign: CampaignTemplate, game: EncounterGame) {
  const player = game.state.actors[game.definition.playerId];
  if (!player) return;
  const name = campaign.player?.name?.trim();
  if (name) player.name = name;
  Object.assign(player.stats, numericStats(campaign.player?.stats));
}

function syncPeople(campaign: CampaignTemplate, game: EncounterGame, library: SceneLibrary) {
  for (const actor of Object.values(game.state.actors)) {
    if (!actor.id.startsWith("npc:")) continue;
    const characterId = actor.id.slice(4);
    const card = library.characters.find((character) => character.id === characterId);
    if (!card) continue; // The card is gone. Keep the last known details.
    actor.name = card.name;
    if (card.anatomyTemplateId) actor.anatomyTemplateId = card.anatomyTemplateId;
    else delete actor.anatomyTemplateId;
    const member = campaign.people.find((person) => person.characterId === characterId);
    Object.assign(actor.stats, numericStats(member?.stats));
  }
}

function syncItems(game: EncounterGame, library: SceneLibrary) {
  game.definition.items = game.definition.items.map((item) => {
    const card = library.objects.find((object) => object.id === item.id);
    if (!card) return item;
    return {
      id: item.id,
      name: card.name,
      description: card.note,
      ...(card.readableContent ? { readableContent: card.readableContent } : {}),
      ...(card.imageDataUrl ? { imageDataUrl: card.imageDataUrl } : {}),
    };
  });
}

/** The value used for a weapon's skill when the person has no value of their own. */
export const DEFAULT_WEAPON_SKILL = 40;

function tacticsUse(actor: EncounterGame["state"]["actors"][string], weaponId: string) {
  return actor.tactics?.preferredWeapon === weaponId || actor.tactics?.fallbackWeapon === weaponId;
}

/**
 * A thing with a weapon on its card is carried as a weapon, not in the pack, and its record
 * follows the card. Weapons that do not come from a card are left as they are.
 */
function syncWeapons(game: EncounterGame, library: SceneLibrary) {
  const cards = new Map(library.objects.map((object) => [object.id, object]));
  const actors = Object.values(game.state.actors);
  for (const actor of actors) {
    for (const itemId of [...actor.inventory]) {
      const card = cards.get(itemId);
      if (!card?.weapon) continue;
      actor.inventory = actor.inventory.filter((held) => held !== itemId);
      actor.weapons.push(itemId);
      if (card.weapon.usesAmmunition) actor.ammunition[itemId] ??= STARTING_AMMUNITION;
    }
    for (const weaponId of [...actor.weapons]) {
      const card = cards.get(weaponId);
      if (!card || card.weapon || tacticsUse(actor, weaponId)) continue;
      // The card is no longer a weapon: it goes back in the pack.
      actor.weapons = actor.weapons.filter((held) => held !== weaponId);
      delete actor.ammunition[weaponId];
      actor.inventory.push(weaponId);
    }
  }
  const carried = new Set(actors.flatMap((actor) => actor.weapons));
  const records = new Map(game.definition.weapons.map((record) => [record.id, record]));
  for (const [id, card] of cards) {
    if (card.weapon && (carried.has(id) || records.has(id))) records.set(id, weaponRecord(card));
    else if (!card.weapon && records.has(id) && !carried.has(id)) records.delete(id);
  }
  game.definition.weapons = [...records.values()];
  for (const actor of actors)
    for (const weaponId of actor.weapons) {
      const card = cards.get(weaponId);
      if (card?.weapon && actor.stats[card.weapon.skill] === undefined)
        actor.stats[card.weapon.skill] = DEFAULT_WEAPON_SKILL;
    }
}

/** A scene kept in the library is always at its start: nothing has been played in it. */
function resetPlayState(game: EncounterGame) {
  game.history = [];
  game.state.revision = 0;
  game.state.phase = "exploration";
  game.state.round = 0;
  game.state.cursor = 0;
  game.state.attempts = [];
  delete game.state.initiative;
}

/**
 * Bring the details a scene gets from the adventure and the library up to date: the
 * player's name and values, each person's name and values, and each item's texts.
 * Anything the author set in the scene is left alone, and nothing is removed.
 * Running it twice gives the same result. A card that no longer exists keeps its last details.
 */
export function syncScene(
  campaign: CampaignTemplate,
  scene: CampaignScene,
  library: SceneLibrary,
): CampaignScene {
  if (!scene.encounter) return scene;
  const game = structuredClone(scene.encounter);
  syncPlayer(campaign, game);
  syncPeople(campaign, game, library);
  syncItems(game, library);
  syncWeapons(game, library);
  resetPlayState(game);
  validateEncounter(game);
  return { ...scene, encounter: game };
}

/** Sync every scene built in Storyboard. Scenes in the earlier format are not touched. */
export function syncAdventure(campaign: CampaignTemplate, library: SceneLibrary): CampaignTemplate {
  return {
    ...campaign,
    scenes: campaign.scenes.map((scene) =>
      sceneFormat(scene) === "playable" ? syncScene(campaign, scene, library) : scene,
    ),
  };
}
