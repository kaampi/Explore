import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { newObjectTemplate, newRulesetTemplate } from "../../src/library/LibrarySchema";
import type { CampaignTemplate } from "../../src/library/LibrarySchema";
import { syncAdventure } from "../../src/library/sceneSync";
import { addTry, placeItem, trySkill } from "../../src/library/sceneParts";
import { validateEncounter } from "../../src/game/EncounterEngine";

const strength = { id: "str", name: "Strength", kind: "number" as const, min: 1, max: 18 };

function setup(card: Partial<Parameters<typeof newObjectTemplate>[0]> = {}) {
  const built = connectedAdventureExample();
  const set = newRulesetTemplate({
    name: "Classic",
    source: "player",
    attributes: [strength] as never,
  });
  const campaign: CampaignTemplate = { ...structuredClone(built.campaign), rulesetId: set.id };
  const synced = syncAdventure(campaign, {
    characters: built.characters,
    objects: built.objects,
    places: built.places,
    rulesets: [set],
  });
  const stone = newObjectTemplate({
    name: "Heavy stone",
    note: "",
    tags: [],
    source: "player",
    ...card,
  } as never);
  const scene = placeItem(synced.scenes[0]!, stone, { position: "here" });
  return { scene, stone };
}

describe("Try", () => {
  it("makes a valid action with a roll at the card's level, on the thing's position", () => {
    const { scene, stone } = setup({ checkAttribute: "strength", checkLevel: "hard" });

    const next = addTry(scene, stone, { verb: "Lift" });

    const action = next.encounter!.definition.interactions.find(
      (a) => a.label === "Lift Heavy stone",
    )!;
    expect(action.check).toEqual({ stat: "str", modifier: -20 });
    expect(action.position).toBe(next.encounter!.state.itemLocations[stone.id]);
    expect(action.once).toBe(false);
    expect(action.success.effects).toEqual([{ kind: "flag", flag: `done:${stone.id}` }]);
    expect(() => validateEncounter(next.encounter!)).not.toThrow();
  });

  it("matches the attribute on id and on name in any capitals", () => {
    const byId = setup({ checkAttribute: "str" });
    const byName = setup({ checkAttribute: "STRENGTH" });

    expect(trySkill(byId.scene, byId.stone)).toEqual({ id: "str", matched: true });
    expect(trySkill(byName.scene, byName.stone)).toEqual({ id: "str", matched: true });
  });

  it("offers the first skill of the scene when the card has none, and flags a miss", () => {
    const none = setup();
    const miss = setup({ checkAttribute: "Charm" });

    expect(trySkill(none.scene, none.stone)).toEqual({ id: "str", matched: true });
    expect(trySkill(miss.scene, miss.stone)).toEqual({ id: "str", matched: false });
  });

  it("uses no modifier when the card has no level", () => {
    const { scene, stone } = setup();

    const next = addTry(scene, stone, { verb: "Use" });

    expect(next.encounter!.definition.interactions.at(-1)!.check!.modifier).toBe(0);
  });

  it("refuses an unknown skill, an empty verb and a thing that is not on a position", () => {
    const { scene, stone } = setup();
    const other = newObjectTemplate({ name: "Rope", note: "", tags: [], source: "player" });

    expect(() => addTry(scene, stone, { verb: "Use", attribute: "Charm" })).toThrow(/not a skill/);
    expect(() => addTry(scene, stone, { verb: " " })).toThrow(/Say what/);
    expect(() => addTry(scene, other, { verb: "Use" })).toThrow(/Place the thing/);
  });

  it("does not change the scene it was given", () => {
    const { scene, stone } = setup();
    const before = structuredClone(scene);

    addTry(scene, stone, { verb: "Use" });

    expect(scene).toEqual(before);
  });
});
