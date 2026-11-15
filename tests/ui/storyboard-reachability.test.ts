import { describe, expect, it } from "vitest";
import { storyboardIssues, reachableFromStart } from "../../src/ui/studio/storyboardReadiness";
import {
  adventureFacts,
  connectedAdventureExample,
  newOpportunity,
} from "../../src/library/playableCampaign";
import { emmaInnExample } from "../../src/scenarios/emmaInn";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { adventureMapPlaces } from "../../src/library/adventureMap";
import {
  newCharacterTemplate,
  type CampaignTemplate,
  type PlaceTemplate,
} from "../../src/library/LibrarySchema";

function issuesFor(campaign: CampaignTemplate, places: PlaceTemplate[], mapPlaces?: never) {
  return storyboardIssues(
    campaign,
    places,
    new Set(adventureFacts(campaign).map((fact) => fact.id)),
    mapPlaces,
  );
}

/** Only the new checks. */
const reachIssues = (issues: ReturnType<typeof issuesFor>) =>
  issues.filter((issue) =>
    /cannot reach|never appears|nothing the player can reach/.test(issue.message),
  );

function twoScenes() {
  const built = connectedAdventureExample();
  const campaign = structuredClone(built.campaign);
  return { built, campaign, first: campaign.scenes[0]!, second: campaign.scenes[1]! };
}

describe("what can be reached from the first scene", () => {
  it("finds every scene of the finished example", () => {
    const { campaign } = twoScenes();

    const reach = reachableFromStart(campaign);

    expect([...reach.scenes].sort()).toEqual(campaign.scenes.map((s) => s.id).sort());
  });

  it("finds no problems in the finished example", () => {
    const { built, campaign } = twoScenes();

    expect(reachIssues(issuesFor(campaign, built.places))).toEqual([]);
  });

  it("finds no problems in the inn adventure or the Emma adventure", () => {
    const inn = innVisitExample();
    const world = inn.realm;
    const innIssues = storyboardIssues(
      inn.campaign,
      inn.places,
      new Set(adventureFacts(inn.campaign).map((f) => f.id)),
      adventureMapPlaces(world, inn.places),
    );
    const emma = newCharacterTemplate({ name: "Emma", familyName: "Blossom" });
    const common = world.worldMap!.nodes.find((node) => node.name === "Common room")!;
    const bedroom = world.worldMap!.nodes.find((node) => node.name === "Guest room")!;
    const emmaCampaign = emmaInnExample(world, inn.places, emma, common.id, bedroom.id);
    const emmaIssues = storyboardIssues(
      emmaCampaign,
      inn.places,
      new Set(adventureFacts(emmaCampaign).map((f) => f.id)),
      adventureMapPlaces(world, inn.places),
    );

    expect(reachIssues(innIssues)).toEqual([]);
    expect(reachIssues(emmaIssues)).toEqual([]);
  });
});

describe("scenes that cannot be reached", () => {
  it("flags a scene with no route to it", () => {
    const { built, campaign } = twoScenes();
    campaign.sceneLinks = campaign.sceneLinks.filter(
      (link) => link.toSceneId !== campaign.scenes[1]!.id,
    );

    const found = reachIssues(issuesFor(campaign, built.places));

    const scene = found.find((issue) => issue.kind === "scene" && issue.field === "reach");
    expect(scene).toMatchObject({ kind: "scene", id: campaign.scenes[1]!.id, field: "reach" });
    expect(scene!.message).toContain("cannot reach");
    // Everything that depended on that scene is reported too.
    expect(found.some((issue) => issue.kind === "objective")).toBe(true);
  });

  it("flags a scene whose only route needs something nothing creates", () => {
    const { built, campaign, second } = twoScenes();
    campaign.sceneLinks[0]!.requiresFlags = ["never-made"];

    const found = reachIssues(issuesFor(campaign, built.places));

    expect(found.some((i) => i.kind === "scene" && i.id === second.id)).toBe(true);
    expect(found.some((i) => i.kind === "link" && i.id === campaign.sceneLinks[0]!.id)).toBe(true);
  });

  it("flags a route that can only be unlocked from the scene it leads to", () => {
    const { built, campaign, first, second } = twoScenes();
    const key = second.encounter!.definition.interactions[0]!;
    const madeThere = key.success.effects.find((e) => e.kind === "flag")!;
    campaign.sceneLinks[0]!.requiresFlags = [(madeThere as { flag: string }).flag];
    first.encounter!.definition.interactions[0]!.success.effects = [];

    const found = reachIssues(issuesFor(campaign, built.places));

    expect(found.some((i) => i.kind === "scene" && i.id === second.id)).toBe(true);
  });

  it("does not count a failure outcome when the action never rolls", () => {
    const { built, campaign, first } = twoScenes();
    const ask = first.encounter!.definition.interactions[0]!;
    const failedFlag = `failed:${ask.id}`;
    campaign.sceneLinks[0]!.requiresFlags = [failedFlag];
    ask.success.effects = [];

    const found = reachIssues(issuesFor(campaign, built.places));

    expect(found.length).toBeGreaterThan(0);
  });

  it("does count a failure outcome when the action rolls", () => {
    const { built, campaign, first } = twoScenes();
    const ask = first.encounter!.definition.interactions[0]!;
    ask.check = { stat: "Persuasion", modifier: 0 };
    const failedFlag = `failed:${ask.id}`;
    campaign.sceneLinks[0]!.requiresFlags = [failedFlag];
    ask.success.effects = [];

    expect(reachIssues(issuesFor(campaign, built.places))).toEqual([]);
  });

  it("follows a chain: a route can set what the next route needs", () => {
    const { built, campaign, first, second } = twoScenes();
    const third = structuredClone(second);
    third.id = crypto.randomUUID();
    third.name = "A third scene";
    campaign.scenes.push(third);
    campaign.sceneLinks = [
      { ...campaign.sceneLinks[0]!, requiresFlags: [], setsFlags: ["opened-gate"] },
      {
        id: crypto.randomUUID(),
        fromSceneId: second.id,
        toSceneId: third.id,
        label: "Onwards",
        requiresFlags: ["opened-gate"],
        requiresAbsentFlags: [],
        setsFlags: [],
      },
    ];
    expect(first.id).not.toBe(third.id);

    expect(reachIssues(issuesFor(campaign, built.places))).toEqual([]);
  });
});

describe("conditions nothing can meet", () => {
  it("flags an action that needs something nothing creates", () => {
    const { built, campaign, first } = twoScenes();
    const extra = newOpportunity("Whisper the password", "The door opens.");
    extra.requiresFlags = ["password-known"];
    first.encounter!.definition.interactions.push(extra);

    const found = reachIssues(issuesFor(campaign, built.places));

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: "scene",
      id: first.id,
      action: { id: extra.id, field: "label" },
    });
    expect(found[0]!.message).toContain("never appears");
  });

  it("accepts an action that needs something another action creates", () => {
    const { built, campaign, first } = twoScenes();
    const ask = first.encounter!.definition.interactions[0]!;
    const madeFlag = (ask.success.effects.find((e) => e.kind === "flag") as { flag: string }).flag;
    const extra = newOpportunity("Follow up", "More.");
    extra.requiresFlags = [madeFlag];
    first.encounter!.definition.interactions.push(extra);

    expect(reachIssues(issuesFor(campaign, built.places))).toEqual([]);
  });
});

describe("objectives that cannot be reached", () => {
  it("flags an objective that needs a discovery from a scene the player cannot reach", () => {
    const { built, campaign, second } = twoScenes();
    const flag = (
      second.encounter!.definition.interactions[0]!.success.effects.find(
        (e) => e.kind === "flag",
      ) as { flag: string }
    ).flag;
    campaign.goal = { title: "Finish", requiresFlags: [flag] };
    campaign.sceneLinks = [];

    const found = reachIssues(issuesFor(campaign, built.places));

    expect(found.some((i) => i.kind === "objective")).toBe(true);
  });

  it("accepts an objective the player can reach", () => {
    const { built, campaign, second } = twoScenes();
    const flag = (
      second.encounter!.definition.interactions[0]!.success.effects.find(
        (e) => e.kind === "flag",
      ) as { flag: string }
    ).flag;
    campaign.goal = { title: "Finish", requiresFlags: [flag] };

    expect(reachIssues(issuesFor(campaign, built.places)).some((i) => i.kind === "objective")).toBe(
      false,
    );
  });
});
