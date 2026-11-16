import type {
  CampaignScene,
  CampaignTemplate,
  CharacterTemplate,
  ObjectTemplate,
  PlaceTemplate,
  RulesetTemplate,
} from "./LibrarySchema";
import type { EncounterGame } from "../game/EncounterSchema";
import { validateEncounter } from "../game/EncounterEngine";
import { sceneFormat } from "./sceneFormat";
import { attributeRange } from "../state/traitBands";
import { BASIC_RULESET, BASIC_START_VALUE } from "./basicRuleset";
import {
  DEFAULT_PLAYER_HEALTH,
  STARTING_AMMUNITION,
  healthFor,
  isHostile,
  weaponRecord,
} from "./sceneParts";

/** The cards a scene's details come from. */
export type SceneLibrary = {
  characters: CharacterTemplate[];
  objects: ObjectTemplate[];
  places: PlaceTemplate[];
  /** The saved rule-sets. Missing is the same as none. */
  rulesets?: RulesetTemplate[];
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

type Scale = { id: string; name: string; min: number; max: number };
/** The scales a scene is played with, and the value a person gets for a skill they have none for. */
type ActiveRules = {
  scales: Scale[];
  startValue: (scale: Scale) => number;
  /** Health the set gives the player. Missing: 20. */
  playerHealth: number | undefined;
};

const hasNumbers = (sheet: Record<string, string | number> | undefined) =>
  Object.keys(numericStats(sheet)).length > 0;

/**
 * Which values the scene is played with. The adventure's rule-set if it has one, otherwise the
 * basic set. An adventure with no rule-set and no values on the player's sheet, in a scene that
 * has no scales, is left exactly as it was.
 */
function activeRules(
  campaign: CampaignTemplate,
  game: EncounterGame,
  library: SceneLibrary,
): ActiveRules | undefined {
  const chosen = campaign.rulesetId
    ? library.rulesets?.find((set) => set.id === campaign.rulesetId)
    : undefined;
  const untouched =
    !campaign.rulesetId &&
    !hasNumbers(campaign.player?.stats) &&
    game.definition.rules.attributes.length === 0;
  if (untouched) return undefined;
  const numeric = (chosen?.attributes ?? []).filter((attribute) => attribute.kind === "number");
  const usable = numeric.length > 0;
  const attributes = usable ? numeric : BASIC_RULESET.attributes;
  const scales = attributes.map((attribute) => ({
    id: attribute.id,
    name: attribute.name,
    ...attributeRange(attribute),
  }));
  return {
    scales,
    startValue: usable ? (scale) => (scale.min + scale.max) / 2 : () => BASIC_START_VALUE,
    playerHealth: usable ? chosen?.playerHealth : undefined,
  };
}

/** Exactly the set's values: the sheet's number, else the start value. Anything else is dropped. */
function statsFor(
  rules: ActiveRules,
  sheet: Record<string, string | number> | undefined,
): Record<string, number> {
  const given = Object.fromEntries(
    Object.entries(sheet ?? {})
      .filter(([, value]) => String(value).trim() !== "" && Number.isFinite(Number(value)))
      .map(([id, value]) => [id, Number(value)]),
  );
  return Object.fromEntries(
    rules.scales.map((scale) => [scale.id, given[scale.id] ?? rules.startValue(scale)]),
  );
}

/** Write the scales, and every person's values on them. */
function syncRules(campaign: CampaignTemplate, game: EncounterGame, rules: ActiveRules) {
  game.definition.rules.attributes = rules.scales;
  if (rules.playerHealth === undefined) delete game.definition.rules.playerHealth;
  else game.definition.rules.playerHealth = rules.playerHealth;
  const health = rules.playerHealth ?? DEFAULT_PLAYER_HEALTH;
  const player = game.state.actors[game.definition.playerId];
  if (player) {
    player.stats = statsFor(rules, campaign.player?.stats);
    player.maxHp = health;
    player.hp = health;
  }
  for (const actor of Object.values(game.state.actors)) {
    if (!actor.id.startsWith("npc:")) continue;
    const member = campaign.people.find((person) => person.characterId === actor.id.slice(4));
    actor.stats = statsFor(rules, member?.stats);
    // Someone with a toughness has that share of the player's health. Anyone else keeps theirs.
    if (actor.toughness) {
      actor.maxHp = healthFor(actor.toughness, health);
      actor.hp = actor.maxHp;
    }
  }
}

function syncPlayer(campaign: CampaignTemplate, game: EncounterGame, rules?: ActiveRules) {
  const player = game.state.actors[game.definition.playerId];
  if (!player) return;
  const name = campaign.player?.name?.trim();
  if (name) player.name = name;
  if (!rules) Object.assign(player.stats, numericStats(campaign.player?.stats));
}

function syncPeople(
  campaign: CampaignTemplate,
  game: EncounterGame,
  library: SceneLibrary,
  rules?: ActiveRules,
) {
  for (const actor of Object.values(game.state.actors)) {
    if (!actor.id.startsWith("npc:")) continue;
    const characterId = actor.id.slice(4);
    const card = library.characters.find((character) => character.id === characterId);
    if (!card) continue; // The card is gone. Keep the last known details.
    actor.name = card.name;
    if (card.anatomyTemplateId) actor.anatomyTemplateId = card.anatomyTemplateId;
    else delete actor.anatomyTemplateId;
    const member = campaign.people.find((person) => person.characterId === characterId);
    if (!rules) Object.assign(actor.stats, numericStats(member?.stats));
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

function tacticsUse(actor: EncounterGame["state"]["actors"][string], weaponId: string) {
  return actor.tactics?.preferredWeapon === weaponId || actor.tactics?.fallbackWeapon === weaponId;
}

/**
 * A weapon card names its skill as free text. In a scene with scales it means the skill with
 * that id, or else the skill with that name in any capitals. With no match the text stays,
 * and the editor warns.
 */
export function skillIdFor(
  text: string,
  rules?: { scales: { id: string; name: string }[] },
  aliases: Record<string, string> = {},
) {
  const scales = rules?.scales ?? [];
  const byId = scales.find((scale) => scale.id === text);
  if (byId) return byId.id;
  const lower = text.trim().toLowerCase();
  const byName = scales.find((scale) => scale.name.trim().toLowerCase() === lower);
  if (byName) return byName.id;
  // The adventure changed rule-set and the author said what the old skill is now.
  const renamed = aliases[lower];
  return renamed && scales.some((scale) => scale.id === renamed) ? renamed : text;
}

/**
 * Things the adventure says the player starts with go in the pack of every scene, unless the
 * thing is placed somewhere in the adventure, and never twice.
 */
function syncStartItems(
  campaign: CampaignTemplate,
  sceneId: string,
  game: EncounterGame,
  library: SceneLibrary,
) {
  const player = game.state.actors[game.definition.playerId];
  if (!player) return;
  const placedIn = (other: EncounterGame, id: string) =>
    id in other.state.itemLocations ||
    Object.values(other.state.actors).some(
      (actor) =>
        actor.id !== other.definition.playerId &&
        (actor.inventory.includes(id) || actor.weapons.includes(id)),
    );
  const placedElsewhere = (id: string) =>
    placedIn(game, id) ||
    campaign.scenes.some(
      (scene) => scene.id !== sceneId && scene.encounter && placedIn(scene.encounter, id),
    );
  for (const card of library.objects) {
    if (!campaign.objectIds.includes(card.id) || card.startingLocation?.kind !== "player") continue;
    if (placedElsewhere(card.id)) continue;
    if (player.inventory.includes(card.id) || player.weapons.includes(card.id)) continue;
    if (!game.definition.items.some((item) => item.id === card.id))
      game.definition.items.push({
        id: card.id,
        name: card.name,
        description: card.note,
        ...(card.readableContent ? { readableContent: card.readableContent } : {}),
        ...(card.imageDataUrl ? { imageDataUrl: card.imageDataUrl } : {}),
      });
    player.inventory.push(card.id);
  }
}

/**
 * A thing with a weapon on its card is carried as a weapon, not in the pack, and its record
 * follows the card. Weapons that do not come from a card are left as they are.
 */
function syncWeapons(
  game: EncounterGame,
  library: SceneLibrary,
  rules?: ActiveRules,
  aliases: Record<string, string> = {},
) {
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
    if (card.weapon && (carried.has(id) || records.has(id)))
      records.set(id, {
        ...weaponRecord(card),
        skill: skillIdFor(card.weapon.skill, rules, aliases),
      });
    else if (!card.weapon && records.has(id) && !carried.has(id)) records.delete(id);
  }
  game.definition.weapons = [...records.values()];
  for (const actor of actors) {
    const first = actor.weapons[0];
    if (!first || actor.id === game.definition.playerId || !isHostile(game, actor)) continue;
    // A hostile person fights with what they carry. Without tactics they would only defend.
    actor.tactics ??= { preferredWeapon: first, retreatAt: 0, repositionTo: [] };
    if (!actor.weapons.includes(actor.tactics.preferredWeapon))
      actor.tactics.preferredWeapon = first;
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
  const rules = activeRules(campaign, game, library);
  if (rules) syncRules(campaign, game, rules);
  syncPlayer(campaign, game, rules);
  syncPeople(campaign, game, library, rules);
  syncItems(game, library);
  syncStartItems(campaign, scene.id, game, library);
  syncWeapons(game, library, rules, campaign.skillAliases);
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
