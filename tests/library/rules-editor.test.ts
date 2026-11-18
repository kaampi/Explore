import { describe, expect, it } from "vitest";
import { adventureFacts, connectedAdventureExample } from "../../src/library/playableCampaign";
import { newRulesetTemplate, type CampaignTemplate } from "../../src/library/LibrarySchema";
import { syncAdventure } from "../../src/library/sceneSync";
import { checkPreview } from "../../src/game/narration";
import { storyboardIssues, storyboardWarnings } from "../../src/ui/studio/storyboardReadiness";
import { loadingBayGame } from "../../src/scenarios/loadingBay";

const strength = { id: "str", name: "Strength", kind: "number" as const, min: 1, max: 18 };

function setup(options: { sheet?: Record<string, string>; stat?: string } = {}) {
  const built = connectedAdventureExample();
  const set = newRulesetTemplate({
    name: "Classic",
    source: "player",
    attributes: [strength] as never,
  });
  const campaign: CampaignTemplate = {
    ...structuredClone(built.campaign),
    rulesetId: set.id,
    player: { ...built.campaign.player!, stats: options.sheet ?? { str: "14" } },
  };
  campaign.scenes[0]!.encounter!.definition.interactions[0]!.check = {
    stat: options.stat ?? "str",
    modifier: 0,
  };
  const synced = syncAdventure(campaign, {
    characters: built.characters,
    objects: built.objects,
    places: built.places,
    rulesets: [set],
  });
  return { built, set, synced };
}

const factsOf = (campaign: CampaignTemplate) =>
  new Set(adventureFacts(campaign).map((fact) => fact.id));

describe("the chance shown before a roll", () => {
  it("names the skill, shows the value on its scale, the difficulty and the chance", () => {
    const { synced } = setup();
    const game = synced.scenes[0]!.encounter!;
    const player = game.state.actors.player!;

    expect(checkPreview(game.definition, player, "str", 0)).toBe("Strength 14 · Standard · 76 %");
    expect(checkPreview(game.definition, player, "str", 20)).toBe("Strength 14 · Easy · 96 %");
    expect(checkPreview(game.definition, player, "str", -20)).toBe("Strength 14 · Hard · 56 %");
  });

  it("shows a skill with no scale by its own name and value out of 100", () => {
    const game = loadingBayGame();

    expect(checkPreview(game.definition, game.state.actors.courier!, "Negotiation", 0)).toBe(
      "Negotiation 60 · Standard · 60 %",
    );
  });
});

describe("a roll against a skill the rule-set does not have", () => {
  it("blocks testing and names the action and the skill", () => {
    const { built, synced } = setup({ stat: "Observation" });

    const issue = storyboardIssues(synced, built.places, factsOf(synced)).find((i) =>
      i.message.includes("not a skill in the rule-set"),
    );

    expect(issue).toMatchObject({ kind: "scene", field: "action" });
    expect(issue!.message).toContain("Ask Edda about the messenger");
    expect(issue!.message).toContain("“Observation”");
  });

  it("does not block a skill the rule-set has", () => {
    const { built, synced } = setup();

    const found = storyboardIssues(synced, built.places, factsOf(synced)).filter((i) =>
      i.message.includes("not a skill in the rule-set"),
    );

    expect(found).toEqual([]);
  });

  it("does not judge a scene that has no scales", () => {
    const { built } = setup({ stat: "Anything" });
    const plain = structuredClone(built.campaign);
    plain.scenes[0]!.encounter!.definition.interactions[0]!.check = {
      stat: "Anything",
      modifier: 0,
    };
    for (const scene of plain.scenes) scene.encounter!.definition.rules.attributes = [];

    const found = storyboardIssues(plain, built.places, factsOf(plain)).filter((i) =>
      i.message.includes("not a skill in the rule-set"),
    );

    expect(found).toEqual([]);
  });
});

describe("a rule-set that is gone", () => {
  it("blocks testing, but only when the list of rule-sets is known", () => {
    const { built, synced } = setup();
    const places = built.places;

    const known = storyboardIssues(synced, places, factsOf(synced), undefined, {
      objects: built.objects,
      rulesets: [],
    });
    const unknown = storyboardIssues(synced, places, factsOf(synced));

    expect(known.some((i) => i.kind === "rules")).toBe(true);
    expect(unknown.some((i) => i.kind === "rules")).toBe(false);
  });

  it("does not block when the set is there", () => {
    const { built, set, synced } = setup();

    const issues = storyboardIssues(synced, built.places, factsOf(synced), undefined, {
      objects: built.objects,
      rulesets: [set],
    });

    expect(issues.some((i) => i.kind === "rules")).toBe(false);
  });
});

describe("a player with no value of their own", () => {
  it("warns that the middle of the scale counts for an action that rolls", () => {
    const { synced } = setup({ sheet: {} });

    const found = storyboardWarnings(synced, factsOf(synced)).find((w) =>
      w.message.includes("middle of its scale"),
    );

    expect(found?.message).toContain("Strength");
    expect(found?.message).toContain("Ask Edda about the messenger");
  });

  it("does not warn once the sheet has a value", () => {
    const { synced } = setup();

    const warnings = storyboardWarnings(synced, factsOf(synced));

    expect(warnings.some((w) => w.message.includes("middle of its scale"))).toBe(false);
  });
});
