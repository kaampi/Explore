import { InteractionSchema, type Interaction } from "../game/EncounterSchema";
import {
  newCampaignTemplate,
  newCharacterTemplate,
  newObjectTemplate,
  newPlaceTemplate,
  newRealmTemplate,
  newRulesetTemplate,
  emptyCampaignScene,
  emptyCampaignPlayer,
  type CampaignScene,
} from "../library/LibrarySchema";
import { makePlayableScene } from "../library/playableCampaign";
import { syncAdventure } from "../library/sceneSync";
import {
  actorIdFor,
  addDoor,
  addPosition,
  attachDoorToRoute,
  connectPositions,
  disconnectPositions,
  placeItem,
  renamePosition,
  setAttitude,
  setPersonPosition,
  setPositionDetail,
  setSight,
  setToughness,
} from "../library/sceneParts";
import { startPlayableCampaign } from "../session/adventureStart";
import type { IndexedDBRepository } from "../persistence/IndexedDBRepository";

const INSIDE = "gatehouse:inside";
const SIDE_GATE = "gatehouse:side-gate-found";

function action(
  id: string,
  label: string,
  position: string,
  text: string,
  extra: Partial<Interaction> = {},
) {
  return InteractionSchema.parse({
    id,
    label,
    description: "",
    position,
    once: true,
    success: { text, effects: [] },
    failure: { text: "Nothing changes.", effects: [] },
    ...extra,
  });
}

/**
 * The city gate at dusk, built as an ordinary adventure from the scene parts: a locked gate
 * whose key Mona carries, an archer on the wall, and four ways in — talk, pick the lock, break
 * the gate, or find the side gate behind the ivy.
 */
export function gatehouseExample() {
  const realm = newRealmTemplate({
    name: "Highmark",
    note: "A walled city and the road to it.",
    source: "player",
  });
  const outside = newPlaceTemplate({
    name: "Outside the city gate",
    realmId: realm.id,
    note: "A guarded city entrance after dusk. A cart stands by the road.",
  });
  const inside = newPlaceTemplate({
    name: "Inside the city",
    realmId: realm.id,
    note: "A quiet courtyard behind the gate.",
  });
  const skill = (name: string) => ({ id: name, name, kind: "number" as const, min: 1, max: 18 });
  const rules = newRulesetTemplate({
    name: "Gate skills",
    source: "player",
    attributes: ["Observation", "Persuasion", "Dexterity", "Strength", "Melee", "Archery"].map(
      skill,
    ) as never,
  });
  const mona = newCharacterTemplate({
    name: "Mona",
    personality: "A gate guard who is tired and strict about the rules.",
  });
  const archer = newCharacterTemplate({
    name: "The archer",
    personality: "A bowman on the wall who watches the road.",
  });
  const card = (name: string, extra: Record<string, unknown> = {}) =>
    newObjectTemplate({ name, note: "", tags: [], source: "player", ...extra } as never);
  const key = card("Iron key", { note: "It fits the city gate." });
  const lockpick = card("Lockpick", { note: "A set of thin picks." });
  const sword = card("Sword", {
    weapon: { skill: "Melee", kind: "melee", damage: 6, usesAmmunition: false },
  });
  const guardSword = card("Guard's sword", {
    weapon: { skill: "Melee", kind: "melee", damage: 4, usesAmmunition: false },
  });
  const bow = card("Bow", {
    weapon: { skill: "Archery", kind: "ranged", damage: 3, range: 100, usesAmmunition: true },
  });
  const objects = [key, lockpick, sword, guardSword, bow];
  const monaId = actorIdFor(mona.id);
  const archerId = actorIdFor(archer.id);

  const person = (characterId: string, position: string) => ({
    characterId,
    position,
    mood: "wary",
    clothing: "",
    holding: "",
    trust: "0",
    familiarity: "0",
    tension: "20",
  });
  const first: CampaignScene = {
    ...emptyCampaignScene(),
    name: "Outside the city gate",
    placeId: outside.id,
    position: { x: 35, y: 65 },
    people: [person(mona.id, "At the gate"), person(archer.id, "On the battlements")],
  };
  const second: CampaignScene = {
    ...emptyCampaignScene(),
    name: "Inside the city",
    placeId: inside.id,
    position: { x: 340, y: 65 },
  };
  const campaign = newCampaignTemplate({
    name: "The city gate · common engine",
    realmId: realm.id,
    rulesetId: rules.id,
    placeIds: [outside.id, inside.id],
    player: {
      ...emptyCampaignPlayer(),
      name: "Traveller",
      stats: {
        Observation: "12",
        Persuasion: "11",
        Dexterity: "11",
        Strength: "10",
        Melee: "12",
        Archery: "10",
      },
    },
    people: [
      { characterId: mona.id, stats: { Melee: "10" } },
      { characterId: archer.id, stats: { Archery: "11" } },
    ],
    objectIds: objects.map((o) => o.id),
    scenes: [first, second],
  });
  campaign.scenes = campaign.scenes.map((scene) =>
    makePlayableScene(campaign, scene, [outside, inside], [mona, archer], objects, [rules]),
  );

  // Scene 1: seven places in all, five out here and two inside the gate.
  let one = campaign.scenes[0]!;
  one = renamePosition(one, "here", "At the gate");
  const add = (name: string, id: string, from: string, distance: "close" | "away" | "far") => {
    const made = addPosition(one, { name, from, distance }, id);
    one = made.scene;
  };
  add("Below the west wall", "wall-foot", "here", "close");
  add("Behind the wagon", "cover", "here", "close");
  add("On the road", "road", "here", "away");
  add("On the battlements", "wall", "here", "away");
  one = connectPositions(one, "wall-foot", "cover");
  one = connectPositions(one, "wall-foot", "road");
  one = connectPositions(one, "cover", "road");
  one = disconnectPositions(one, "here", "wall");
  one = setSight(one, "here", "wall", true);
  one = setPositionDetail(one, "cover", { cover: "good" });
  one = setPositionDetail(one, "wall", { cover: "some", elevation: 6 });
  for (const [from, to] of [
    ["wall-foot", "cover"],
    ["wall-foot", "road"],
    ["cover", "road"],
    ["wall-foot", "wall"],
    ["cover", "wall"],
    ["road", "wall"],
  ] as const)
    one = setSight(one, from, to, true);
  one = setPersonPosition(one, archer.id, "wall");
  one = setAttitude(one, mona.id, "hostile");
  one = setAttitude(one, archer.id, "hostile");
  one = setToughness(one, mona.id, "normal");
  one = setToughness(one, archer.id, "weak");
  one = placeItem(one, guardSword, { heldBy: monaId });
  one = placeItem(one, key, { heldBy: monaId });
  one = placeItem(one, bow, { heldBy: archerId });
  one = placeItem(one, sword, { heldBy: "player" });
  one = placeItem(one, lockpick, { heldBy: "player" });
  const door = addDoor(one, {
    name: "The city gate",
    position: "here",
    locked: true,
    keyId: key.id,
  });
  one = door.scene;

  const gateLink = {
    id: crypto.randomUUID(),
    fromSceneId: one.id,
    toSceneId: second.id,
    label: "Go through the gate",
    requiresFlags: [] as string[],
    requiresAbsentFlags: [] as string[],
    setsFlags: [INSIDE],
  };
  const sideLink = {
    id: crypto.randomUUID(),
    fromSceneId: one.id,
    toSceneId: second.id,
    label: "Slip in by the side gate",
    requiresFlags: [SIDE_GATE],
    requiresAbsentFlags: [] as string[],
    setsFlags: [INSIDE],
  };

  const unlock = (open: boolean) => ({
    kind: "set-barrier" as const,
    barrierId: door.doorId,
    locked: false,
    ...(open ? { open: true } : {}),
  });
  one.encounter!.definition.interactions.push(
    action(
      "persuade-mona",
      "Persuade Mona to let you in",
      "here",
      "Mona sighs, turns the key and lets you pass.",
      {
        counterpartyId: monaId,
        check: { stat: "Persuasion", modifier: 0 },
        success: {
          text: "Mona sighs, turns the key and lets you pass.",
          effects: [unlock(false), { kind: "flag", flag: "admitted" }],
        },
        failure: {
          text: "Mona shakes her head. “Not tonight.”",
          effects: [{ kind: "flag", flag: "refused" }],
        },
      },
    ),
    action("pick-lock", "Pick the lock", "here", "The lock clicks.", {
      once: false,
      requiresItems: [lockpick.id],
      check: { stat: "Dexterity", modifier: 0 },
      success: { text: "The lock clicks open.", effects: [unlock(false)] },
      failure: { text: "The pick slips. The lock holds.", effects: [] },
    }),
    action("break-gate", "Break the gate open", "here", "The gate gives.", {
      check: { stat: "Strength", modifier: -20 },
      success: { text: "The gate splinters open.", effects: [unlock(true)] },
      failure: {
        text: "The noise brings the guards.",
        effects: [{ kind: "start-combat" }],
      },
    }),
    action(
      "inspect-ivy",
      "Inspect the ivy",
      "wall-foot",
      "Behind the ivy a narrow side gate stands ajar.",
      {
        success: {
          text: "Behind the ivy a narrow side gate stands ajar.",
          effects: [{ kind: "flag", flag: SIDE_GATE }],
        },
      },
    ),
  );

  // Scene 2: the courtyard.
  let two = campaign.scenes[1]!;
  two = renamePosition(two, "here", "In the courtyard");
  two = addPosition(
    two,
    { name: "On the stairs", from: "here", distance: "close" },
    "stairs",
  ).scene;

  campaign.scenes = [one, two];
  campaign.sceneLinks = [gateLink, sideLink];
  campaign.goal = { title: "Get into the city.", requiresFlags: [INSIDE] };
  const attached = attachDoorToRoute(campaign, one.id, door.doorId, gateLink.id);
  const library = {
    characters: [mona, archer],
    objects,
    places: [outside, inside],
    rulesets: [rules],
  };
  return {
    campaign: syncAdventure(attached, library),
    places: [outside, inside],
    characters: [mona, archer],
    objects,
    realm,
    rules,
  };
}

/** Explicit example creation never replaces an existing authored adventure or saved playthrough. */
export async function installGatehouseExample(repo: IndexedDBRepository) {
  const built = gatehouseExample();
  await repo.saveRealm(built.realm);
  await repo.saveRuleset(built.rules);
  for (const place of built.places) await repo.savePlace(place);
  for (const person of built.characters) await repo.saveCharacter(person);
  for (const thing of built.objects) await repo.saveObject(thing);
  await repo.saveCampaign(built.campaign);
  return built;
}

export async function startGatehouseExample(repo: IndexedDBRepository, id: string, model?: string) {
  const built = await installGatehouseExample(repo);
  if (model) built.campaign.model = model;
  return startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    id,
    [built.realm],
    { characters: built.characters },
  );
}
