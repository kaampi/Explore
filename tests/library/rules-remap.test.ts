import { describe, expect, it } from "vitest";
import { adventureFacts, connectedAdventureExample } from "../../src/library/playableCampaign";
import {
  parseCampaignTemplate,
  newObjectTemplate,
  newRulesetTemplate,
  type CampaignTemplate,
} from "../../src/library/LibrarySchema";
import { syncAdventure, type SceneLibrary } from "../../src/library/sceneSync";
import { actorIdFor, placeItem, remapAttribute, skillsInUse } from "../../src/library/sceneParts";
import { storyboardIssues, storyboardWarnings } from "../../src/ui/studio/storyboardReadiness";

const num = (id: string, name: string) => ({ id, name, kind: "number" as const, min: 1, max: 18 });

function setup() {
  const built = connectedAdventureExample();
  const old = newRulesetTemplate({
    name: "Old",
    source: "player",
    attributes: [num("str", "Strength"), num("wit", "Wits")] as never,
  });
  const next = newRulesetTemplate({
    name: "New",
    source: "player",
    attributes: [num("might", "Might"), num("cunning", "Cunning")] as never,
  });
  const spear = newObjectTemplate({
    name: "Spear",
    note: "",
    source: "player",
    tags: [],
    weapon: { skill: "Strength", kind: "melee", damage: 3, usesAmmunition: false },
  });
  const library: SceneLibrary = {
    characters: built.characters,
    objects: [...built.objects, spear],
    places: built.places,
    rulesets: [old, next],
  };
  const eddaId = actorIdFor(built.characters[0]!.id);
  const start: CampaignTemplate = { ...structuredClone(built.campaign), rulesetId: old.id };
  start.scenes[0] = placeItem(start.scenes[0]!, spear, { heldBy: eddaId });
  start.scenes[0]!.encounter!.definition.interactions[0]!.check = { stat: "str", modifier: 0 };
  const onOld = syncAdventure(start, library);
  const onNew = syncAdventure({ ...onOld, rulesetId: next.id }, library);
  return { built, old, next, spear, library, onOld, onNew, eddaId };
}

const issuesOf = (campaign: CampaignTemplate, places: never[], library: SceneLibrary) =>
  storyboardIssues(
    campaign,
    places,
    new Set(adventureFacts(campaign).map((f) => f.id)),
    undefined,
    { objects: library.objects, rulesets: library.rulesets },
  );

describe("changing the rule-set of an adventure", () => {
  it("lists the skills that actions and weapons use", () => {
    const { onOld } = setup();

    const uses = skillsInUse(onOld);

    expect(uses.map((skill) => skill.id)).toEqual(expect.arrayContaining(["str"]));
    const strength = uses.find((skill) => skill.id === "str")!;
    expect(strength.name).toBe("Strength");
    expect(strength.uses.some((use) => use.includes("Ask Edda about the messenger"))).toBe(true);
    expect(strength.uses.some((use) => use.includes("Spear (weapon)"))).toBe(true);
  });

  it("blocks testing the action that rolls against a skill the new set lacks", () => {
    const { built, onNew, library } = setup();

    const found = issuesOf(onNew, built.places as never[], library).filter((i) =>
      i.message.includes("not a skill in the rule-set"),
    );

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("Ask Edda about the messenger");
  });

  it("is put right by choosing a new skill, and the errors go", () => {
    const { built, onNew, library } = setup();

    const fixed = syncAdventure(remapAttribute(onNew, "str", "might"), library);

    expect(
      issuesOf(fixed, built.places as never[], library).filter((i) =>
        i.message.includes("not a skill in the rule-set"),
      ),
    ).toEqual([]);
    expect(fixed.scenes[0]!.encounter!.definition.interactions[0]!.check?.stat).toBe("might");
  });

  it("moves the weapon too, even though its card still says the old skill, and keeps doing so", () => {
    const { onNew, library, spear, eddaId } = setup();

    // The weapon's card says "Strength" in words, so it is listed as its own skill to replace.
    expect(skillsInUse(onNew).map((skill) => skill.id)).toEqual(
      expect.arrayContaining(["str", "Strength"]),
    );
    const once = syncAdventure(remapAttribute(onNew, "Strength", "might"), library);
    const again = syncAdventure(once, library);

    for (const result of [once, again]) {
      const game = result.scenes[0]!.encounter!;
      expect(game.definition.weapons.find((w) => w.id === spear.id)?.skill).toBe("might");
      expect(game.state.actors[eddaId]!.stats.might).toBe(9.5);
    }
    expect(again).toEqual(once);
  });

  it("clears the weapon warning once its skill is mapped", () => {
    const { onNew, library, built, eddaId } = setup();
    const hostile = structuredClone(onNew);
    hostile.scenes[0]!.encounter!.state.actors[eddaId]!.team = "opponents";
    hostile.scenes[0]!.encounter!.definition.hostilities.push(["player", "opponents"]);
    const facts = new Set(adventureFacts(hostile).map((f) => f.id));

    const before = storyboardWarnings(hostile, facts, library);
    const fixed = syncAdventure(remapAttribute(hostile, "Strength", "might"), library);
    const after = storyboardWarnings(
      fixed,
      new Set(adventureFacts(fixed).map((f) => f.id)),
      library,
    );

    expect(before.some((w) => w.message.includes("not a skill in the rule-set"))).toBe(true);
    expect(after.some((w) => w.message.includes("not a skill in the rule-set"))).toBe(false);
    expect(built.characters.length).toBeGreaterThan(0);
  });

  it("does not change the adventure it was given, and does nothing for the same skill", () => {
    const { onNew } = setup();
    const before = structuredClone(onNew);

    remapAttribute(onNew, "str", "might");

    expect(onNew).toEqual(before);
    expect(remapAttribute(onNew, "str", "str")).toBe(onNew);
  });

  it("follows a skill that was mapped once and is mapped again", () => {
    const { onNew } = setup();

    const twice = remapAttribute(remapAttribute(onNew, "str", "might"), "might", "cunning");

    expect(twice.skillAliases["str"]).toBe("cunning");
    expect(twice.skillAliases["might"]).toBe("cunning");
    expect(twice.scenes[0]!.encounter!.definition.interactions[0]!.check?.stat).toBe("cunning");
  });

  it("opens an adventure saved before skill aliases existed", () => {
    const { built } = setup();
    const older = JSON.parse(JSON.stringify(built.campaign));
    delete older.skillAliases;

    expect(parseCampaignTemplate(older).skillAliases).toEqual({});
  });
});
