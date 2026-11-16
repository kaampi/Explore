import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { connectedAdventureExample, adventureFacts } from "../../src/library/playableCampaign";
import {
  ObjectTemplateSchema,
  newObjectTemplate,
  type ObjectTemplate,
} from "../../src/library/LibrarySchema";
import { newRulesetTemplate } from "../../src/library/LibrarySchema";
import {
  STARTING_AMMUNITION,
  actorIdFor,
  itemsHere,
  placeItem,
  removeItem,
  setAmmunition,
  setAttitude,
} from "../../src/library/sceneParts";
import { syncAdventure, syncScene } from "../../src/library/sceneSync";
import { storyboardWarnings } from "../../src/ui/studio/storyboardReadiness";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { validateEncounter } from "../../src/game/EncounterEngine";

function setup() {
  const built = connectedAdventureExample();
  const sword = newObjectTemplate({
    name: "Short sword",
    note: "",
    source: "player",
    tags: [],
    weapon: { skill: "Melee", kind: "melee", damage: 4, usesAmmunition: false },
  });
  const bow = newObjectTemplate({
    name: "Hunting bow",
    note: "",
    source: "player",
    tags: [],
    weapon: { skill: "Archery", kind: "ranged", damage: 3, range: 20, usesAmmunition: true },
  });
  const eddaId = actorIdFor(built.characters[0]!.id);
  const library = {
    characters: built.characters,
    objects: [...built.objects, sword, bow],
    places: built.places,
  };
  return { built, scene: structuredClone(built.campaign.scenes[0]!), sword, bow, eddaId, library };
}

/** The same card, no longer a weapon. */
function withoutWeapon(card: ObjectTemplate): ObjectTemplate {
  const copy = { ...card };
  delete copy.weapon;
  return copy;
}

describe("a weapon on a thing's card", () => {
  it("is optional, so older cards still load", () => {
    const { sword } = setup();
    const older = withoutWeapon(sword);

    expect(ObjectTemplateSchema.parse(older).weapon).toBeUndefined();
    expect(ObjectTemplateSchema.parse(sword).weapon).toMatchObject({ skill: "Melee", damage: 4 });
  });

  it("rejects damage that is not a whole number from 0 to 50", () => {
    const { sword } = setup();

    for (const damage of [-1, 51, 2.5])
      expect(() =>
        ObjectTemplateSchema.parse({ ...sword, weapon: { ...sword.weapon, damage } }),
      ).toThrow();
  });

  it("is kept when the card is saved and loaded", async () => {
    const { sword } = setup();
    const repo = new IndexedDBRepository(new IDBFactory(), "weapon-cards");

    await repo.saveObject(sword);

    const loaded = (await repo.listObjects()).find((object) => object.id === sword.id);
    expect(loaded?.weapon).toEqual(sword.weapon);
  });
});

describe("carrying a weapon", () => {
  it("puts it among the carrier's weapons, with the card's values, not in the pack", () => {
    const { scene, sword, eddaId } = setup();

    const next = placeItem(scene, sword, { heldBy: eddaId });

    const game = next.encounter!;
    expect(game.state.actors[eddaId]!.weapons).toContain(sword.id);
    expect(game.state.actors[eddaId]!.inventory).not.toContain(sword.id);
    expect(game.definition.weapons.find((w) => w.id === sword.id)).toMatchObject({
      name: "Short sword",
      skill: "Melee",
      kind: "melee",
      damage: 4,
    });
    expect(() => validateEncounter(game)).not.toThrow();
  });

  it("gives a weapon that uses ammunition a starting number of rounds", () => {
    const { scene, bow, eddaId } = setup();

    const next = placeItem(scene, bow, { heldBy: eddaId });

    expect(next.encounter!.state.actors[eddaId]!.ammunition[bow.id]).toBe(STARTING_AMMUNITION);
    expect(next.encounter!.definition.weapons.find((w) => w.id === bow.id)?.range).toBe(20);
  });

  it("lists a carried weapon among the things in the scene", () => {
    const { scene, sword, eddaId } = setup();

    const next = placeItem(scene, sword, { heldBy: eddaId });

    expect(itemsHere(next)).toContainEqual({ itemId: sword.id, where: { heldBy: eddaId } });
  });

  it("is an ordinary thing while it lies on the ground", () => {
    const { scene, sword } = setup();

    const next = placeItem(scene, sword, { position: "here" });

    expect(next.encounter!.state.itemLocations[sword.id]).toBe("here");
    expect(next.encounter!.definition.weapons.some((w) => w.id === sword.id)).toBe(false);
  });

  it("moves to a new carrier and leaves the old one without it", () => {
    const { scene, sword, eddaId } = setup();
    const withEdda = placeItem(scene, sword, { heldBy: eddaId });

    const next = placeItem(withEdda, sword, { heldBy: "player" });

    expect(next.encounter!.state.actors[eddaId]!.weapons).not.toContain(sword.id);
    expect(next.encounter!.state.actors.player!.weapons).toContain(sword.id);
    expect(next.encounter!.definition.weapons.filter((w) => w.id === sword.id)).toHaveLength(1);
  });

  it("is taken away completely, with its rounds and its record", () => {
    const { scene, bow, eddaId } = setup();
    const next = removeItem(placeItem(scene, bow, { heldBy: eddaId }), bow.id);

    expect(next.encounter!.state.actors[eddaId]!.weapons).not.toContain(bow.id);
    expect(next.encounter!.state.actors[eddaId]!.ammunition[bow.id]).toBeUndefined();
    expect(next.encounter!.definition.weapons.some((w) => w.id === bow.id)).toBe(false);
  });

  it("lets the number of rounds be changed, for a weapon that uses them", () => {
    const { scene, bow, sword, eddaId } = setup();
    const armed = placeItem(placeItem(scene, bow, { heldBy: eddaId }), sword, { heldBy: eddaId });

    expect(
      setAmmunition(armed, eddaId, bow.id, 12).encounter!.state.actors[eddaId]!.ammunition[bow.id],
    ).toBe(12);
    expect(() => setAmmunition(armed, eddaId, sword.id, 5)).toThrow(/does not use ammunition/);
    expect(() => setAmmunition(armed, eddaId, bow.id, -1)).toThrow(/whole number/);
    expect(() => setAmmunition(armed, "player", bow.id, 5)).toThrow(/not carrying/);
  });
});

describe("keeping a weapon in step with its card", () => {
  function armed() {
    const { built, scene, sword, eddaId, library } = setup();
    const campaign = {
      ...built.campaign,
      scenes: [placeItem(scene, sword, { heldBy: eddaId }), ...built.campaign.scenes.slice(1)],
    };
    return { campaign, sword, eddaId, library };
  }

  it("shows changed damage on the weapon record", () => {
    const { campaign, sword, eddaId, library } = armed();
    const sharper: ObjectTemplate = { ...sword, weapon: { ...sword.weapon!, damage: 9 } };

    const synced = syncAdventure(campaign, {
      ...library,
      objects: library.objects.map((o) => (o.id === sword.id ? sharper : o)),
    });

    expect(
      synced.scenes[0]!.encounter!.definition.weapons.find((w) => w.id === sword.id)?.damage,
    ).toBe(9);
    expect(synced.scenes[0]!.encounter!.state.actors[eddaId]!.weapons).toContain(sword.id);
  });

  it("puts a thing back in the pack when its card stops being a weapon", () => {
    const { campaign, sword, eddaId, library } = armed();
    const plain = withoutWeapon(sword);

    const synced = syncAdventure(campaign, {
      ...library,
      objects: library.objects.map((o) => (o.id === sword.id ? plain : o)),
    });

    const edda = synced.scenes[0]!.encounter!.state.actors[eddaId]!;
    expect(edda.weapons).not.toContain(sword.id);
    expect(edda.inventory).toContain(sword.id);
    expect(synced.scenes[0]!.encounter!.definition.weapons.some((w) => w.id === sword.id)).toBe(
      false,
    );
  });

  it("makes a carried thing a weapon when its card becomes one", () => {
    const { built, scene, sword, eddaId, library } = setup();
    const plain = withoutWeapon(sword);
    const carrying = placeItem(scene, plain, { heldBy: eddaId });
    expect(carrying.encounter!.state.actors[eddaId]!.inventory).toContain(sword.id);

    const synced = syncScene(built.campaign, carrying, library);

    expect(synced.encounter!.state.actors[eddaId]!.weapons).toContain(sword.id);
    expect(synced.encounter!.state.actors[eddaId]!.inventory).not.toContain(sword.id);
  });

  it("keeps the skill text of a weapon the rule-set does not know, and adds no value for it", () => {
    const { campaign, sword, eddaId, library } = armed();

    const synced = syncAdventure(campaign, library);

    const game = synced.scenes[0]!.encounter!;
    expect(game.definition.weapons.find((w) => w.id === sword.id)?.skill).toBe("Melee");
    expect(game.state.actors[eddaId]!.stats.Melee).toBeUndefined();
  });

  it("is stable when run twice", () => {
    const { campaign, library } = armed();

    const once = syncAdventure(campaign, library);

    expect(syncAdventure(once, library)).toEqual(once);
  });

  it("leaves a weapon that does not come from a card alone", () => {
    const { built, scene, library } = setup();
    const custom = structuredClone(scene);
    custom.encounter!.definition.weapons.push({
      id: "club",
      name: "Club",
      skill: "Brawl",
      kind: "melee",
      damage: 2,
      usesAmmunition: false,
    });
    custom.encounter!.state.actors.player!.weapons.push("club");

    const synced = syncScene(built.campaign, custom, library);

    expect(synced.encounter!.definition.weapons.find((w) => w.id === "club")).toMatchObject({
      damage: 2,
    });
    expect(synced.encounter!.state.actors.player!.stats.Brawl).toBeUndefined();
  });
});

describe("a weapon the rule-set does not cover", () => {
  function hostileHolder() {
    const { built, scene, sword, eddaId } = setup();
    const armedScene = setAttitude(
      placeItem(scene, sword, { heldBy: eddaId }),
      built.characters[0]!.id,
      "hostile",
    );
    const campaign = { ...built.campaign, scenes: [armedScene, ...built.campaign.scenes.slice(1)] };
    return { built, campaign, sword, eddaId };
  }
  const warningsFor = (campaign: ReturnType<typeof hostileHolder>["campaign"]) =>
    storyboardWarnings(campaign, new Set(adventureFacts(campaign).map((fact) => fact.id)));

  it("warns that a weapon's skill is not in the rule-set", () => {
    const { campaign } = hostileHolder();

    const found = warningsFor(campaign).find((w) => w.message.includes("Melee"));

    expect(found?.message).toContain("Short sword");
    expect(found?.message).toContain("not a skill in the rule-set");
  });

  it("warns that the middle of the scale counts when the set has the skill but the person has no value", () => {
    const { built, campaign, sword, eddaId } = hostileHolder();
    const set = newRulesetTemplate({
      name: "Fighters",
      source: "player",
      attributes: [{ id: "Melee", name: "Melee", kind: "number", min: 1, max: 18 }] as never,
    });
    const synced = syncAdventure(
      { ...campaign, rulesetId: set.id },
      {
        characters: built.characters,
        objects: [...built.objects, sword],
        places: built.places,
        rulesets: [set],
      },
    );

    const found = warningsFor(synced).find((w) => w.message.includes("middle of its scale"));

    expect(found?.message).toContain("Edda");
    expect(synced.scenes[0]!.encounter!.state.actors[eddaId]!.stats.Melee).toBe(9.5);
  });

  it("does not warn about a person who is not the player and not hostile", () => {
    const { built, scene, sword, eddaId } = setup();
    const campaign = {
      ...built.campaign,
      scenes: [placeItem(scene, sword, { heldBy: eddaId }), ...built.campaign.scenes.slice(1)],
    };

    expect(warningsFor(campaign as never).some((w) => w.message.includes("Melee"))).toBe(false);
  });
});
