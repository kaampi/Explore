import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { newRulesetTemplate, type CampaignTemplate } from "../../src/library/LibrarySchema";
import { syncAdventure, type SceneLibrary } from "../../src/library/sceneSync";
import { actorIdFor } from "../../src/library/sceneParts";
import { BASIC_RULESET, BASIC_START_VALUE } from "../../src/library/basicRuleset";

const strength = { id: "str", name: "Strength", kind: "number" as const, min: 1, max: 18 };
const wits = { id: "wit", name: "Wits", kind: "number" as const, min: 1, max: 18 };
const mood = { id: "mood", name: "Mood", kind: "text" as const };

function setup() {
  const built = connectedAdventureExample();
  const set = newRulesetTemplate({
    name: "Classic",
    source: "player",
    attributes: [strength, wits, mood] as never,
  });
  const library: SceneLibrary = {
    characters: built.characters,
    objects: built.objects,
    places: built.places,
    rulesets: [set],
  };
  const campaign: CampaignTemplate = {
    ...structuredClone(built.campaign),
    rulesetId: set.id,
    player: { ...built.campaign.player!, stats: { str: "14", Observation: "99" } },
  };
  return { built, set, library, campaign, eddaId: actorIdFor(built.characters[0]!.id) };
}

describe("the rule-set in the sync", () => {
  it("writes the set's number skills as the scene's scales and leaves text skills out", () => {
    const { library, campaign } = setup();

    const synced = syncAdventure(campaign, library);

    for (const scene of synced.scenes)
      expect(scene.encounter!.definition.rules.attributes).toEqual([
        { id: "str", name: "Strength", min: 1, max: 18 },
        { id: "wit", name: "Wits", min: 1, max: 18 },
      ]);
  });

  it("gives the player the sheet's number, the middle for the rest, and drops what is not in the set", () => {
    const { library, campaign } = setup();

    const player = syncAdventure(campaign, library).scenes[0]!.encounter!.state.actors.player!;

    expect(player.stats).toEqual({ str: 14, wit: 9.5 });
  });

  it("gives a person the Cast's numbers on the set's ids", () => {
    const { library, campaign, built, eddaId } = setup();
    const id = built.characters[0]!.id;
    campaign.people = campaign.people.map((p) =>
      p.characterId === id ? { ...p, stats: { wit: "16", nonsense: "3" } } : p,
    );

    const edda = syncAdventure(campaign, library).scenes[0]!.encounter!.state.actors[eddaId]!;

    expect(edda.stats).toEqual({ str: 9.5, wit: 16 });
  });

  it("ignores a text value where a number is expected", () => {
    const { library, campaign } = setup();
    campaign.player = { ...campaign.player!, stats: { str: "strong" } };

    const player = syncAdventure(campaign, library).scenes[0]!.encounter!.state.actors.player!;

    expect(player.stats.str).toBe(9.5);
  });

  it("gives the same result when run twice", () => {
    const { library, campaign } = setup();

    const once = syncAdventure(campaign, library);

    expect(syncAdventure(once, library)).toEqual(once);
  });

  it("uses the basic set, starting at 60, when the adventure has no rule-set but has values", () => {
    const { built, library } = setup();
    const campaign = structuredClone(built.campaign);
    campaign.player = { ...campaign.player!, stats: { Observation: "70" } };

    const scene = syncAdventure(campaign, library).scenes[0]!.encounter!;

    expect(scene.definition.rules.attributes.map((scale) => scale.id)).toEqual(
      BASIC_RULESET.attributes.map((attribute) => attribute.id),
    );
    expect(scene.state.actors.player!.stats).toEqual({
      Observation: 70,
      Persuasion: BASIC_START_VALUE,
    });
  });

  it("uses the basic set when the chosen set is gone, or has no number skills", () => {
    const { library, campaign } = setup();
    const textOnly = newRulesetTemplate({
      name: "Words",
      source: "player",
      attributes: [mood] as never,
    });

    for (const sets of [[], [{ ...textOnly, id: campaign.rulesetId! }]]) {
      const synced = syncAdventure(campaign, { ...library, rulesets: sets });
      expect(
        synced.scenes[0]!.encounter!.definition.rules.attributes.map((scale) => scale.id),
      ).toEqual(["Observation", "Persuasion"]);
    }
  });

  it("changes nothing for an adventure with no set, no values and no scales", () => {
    const { library, built } = setup();
    const campaign = structuredClone(built.campaign);
    campaign.player = { ...campaign.player!, stats: {} };
    for (const scene of campaign.scenes) {
      scene.encounter!.definition.rules.attributes = [];
      scene.encounter!.state.actors.player!.stats = { Observation: 33, Anything: 7 };
    }

    const synced = syncAdventure(campaign, library);

    for (const [index, scene] of synced.scenes.entries()) {
      expect(scene.encounter!.definition.rules.attributes).toEqual([]);
      expect(scene.encounter!.state.actors.player!.stats).toEqual(
        campaign.scenes[index]!.encounter!.state.actors.player!.stats,
      );
    }
  });

  it("leaves the inn adventure's doors, routes and actions as they were", () => {
    const inn = innVisitExample();
    const library: SceneLibrary = { characters: [], objects: [], places: inn.places };

    const synced = syncAdventure(inn.campaign, library);

    synced.scenes.forEach((scene, index) => {
      const before = inn.campaign.scenes[index]!.encounter!;
      expect(scene.encounter!.state.barriers).toEqual(before.state.barriers);
      expect(scene.encounter!.definition.interactions).toEqual(before.definition.interactions);
    });
  });
});
