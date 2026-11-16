import { describe, expect, it } from "vitest";
import {
  storyboardIssues,
  storyboardWarnings,
  reachableFromStart,
} from "../../src/ui/studio/storyboardReadiness";
import {
  adventureFacts,
  connectedAdventureExample,
  newOpportunity,
} from "../../src/library/playableCampaign";
import { emmaInnExample } from "../../src/scenarios/emmaInn";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { adventureMapPlaces } from "../../src/library/adventureMap";
import { newCharacterTemplate, type CampaignTemplate } from "../../src/library/LibrarySchema";

/** The reachability findings. They are warnings, not blocking issues. */
function issuesFor(campaign: CampaignTemplate) {
  return storyboardWarnings(campaign, new Set(adventureFacts(campaign).map((fact) => fact.id)));
}

const reachIssues = (issues: ReturnType<typeof issuesFor>) => issues;

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
    const { campaign } = twoScenes();

    expect(reachIssues(issuesFor(campaign))).toEqual([]);
  });

  it("finds no problems in the inn adventure or the Emma adventure", () => {
    const inn = innVisitExample();
    const world = inn.realm;
    const emma = newCharacterTemplate({ name: "Emma", familyName: "Blossom" });
    const common = world.worldMap!.nodes.find((node) => node.name === "Common room")!;
    const bedroom = world.worldMap!.nodes.find((node) => node.name === "Guest room")!;
    const emmaCampaign = emmaInnExample(world, inn.places, emma, common.id, bedroom.id);

    for (const campaign of [inn.campaign, emmaCampaign]) {
      const facts = new Set(adventureFacts(campaign).map((f) => f.id));
      expect(storyboardWarnings(campaign, facts)).toEqual([]);
      expect(
        storyboardIssues(campaign, inn.places, facts, adventureMapPlaces(world, inn.places)),
      ).toEqual([]);
    }
  });
});

describe("scenes that cannot be reached", () => {
  it("flags a scene with no route to it", () => {
    const { campaign } = twoScenes();
    campaign.sceneLinks = campaign.sceneLinks.filter(
      (link) => link.toSceneId !== campaign.scenes[1]!.id,
    );

    const found = reachIssues(issuesFor(campaign));

    const scene = found.find((issue) => issue.kind === "scene" && issue.field === "reach");
    expect(scene).toMatchObject({ kind: "scene", id: campaign.scenes[1]!.id, field: "reach" });
    expect(scene!.message).toContain("cannot reach");
    // Everything that depended on that scene is reported too.
    expect(found.some((issue) => issue.kind === "objective")).toBe(true);
  });

  it("flags a scene whose only route needs something nothing creates", () => {
    const { campaign, second } = twoScenes();
    campaign.sceneLinks[0]!.requiresFlags = ["never-made"];

    const found = reachIssues(issuesFor(campaign));

    expect(found.some((i) => i.kind === "scene" && i.id === second.id)).toBe(true);
    expect(found.some((i) => i.kind === "link" && i.id === campaign.sceneLinks[0]!.id)).toBe(true);
  });

  it("flags a route that can only be unlocked from the scene it leads to", () => {
    const { campaign, first, second } = twoScenes();
    const key = second.encounter!.definition.interactions[0]!;
    const madeThere = key.success.effects.find((e) => e.kind === "flag")!;
    campaign.sceneLinks[0]!.requiresFlags = [(madeThere as { flag: string }).flag];
    first.encounter!.definition.interactions[0]!.success.effects = [];

    const found = reachIssues(issuesFor(campaign));

    expect(found.some((i) => i.kind === "scene" && i.id === second.id)).toBe(true);
  });

  it("does not count a failure outcome when the action never rolls", () => {
    const { campaign, first } = twoScenes();
    const ask = first.encounter!.definition.interactions[0]!;
    const failedFlag = `failed:${ask.id}`;
    campaign.sceneLinks[0]!.requiresFlags = [failedFlag];
    ask.success.effects = [];

    const found = reachIssues(issuesFor(campaign));

    expect(found.length).toBeGreaterThan(0);
  });

  it("does count a failure outcome when the action rolls", () => {
    const { campaign, first } = twoScenes();
    const ask = first.encounter!.definition.interactions[0]!;
    ask.check = { stat: "Persuasion", modifier: 0 };
    const failedFlag = `failed:${ask.id}`;
    campaign.sceneLinks[0]!.requiresFlags = [failedFlag];
    ask.success.effects = [];

    expect(reachIssues(issuesFor(campaign))).toEqual([]);
  });

  it("follows a chain: a route can set what the next route needs", () => {
    const { campaign, first, second } = twoScenes();
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

    expect(reachIssues(issuesFor(campaign))).toEqual([]);
  });
});

describe("conditions nothing can meet", () => {
  it("flags an action that needs something nothing creates", () => {
    const { campaign, first } = twoScenes();
    const extra = newOpportunity("Whisper the password", "The door opens.");
    extra.requiresFlags = ["password-known"];
    first.encounter!.definition.interactions.push(extra);

    const found = reachIssues(issuesFor(campaign));

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: "scene",
      id: first.id,
      action: { id: extra.id, field: "label" },
    });
    expect(found[0]!.message).toContain("never appears");
  });

  it("accepts an action that needs something another action creates", () => {
    const { campaign, first } = twoScenes();
    const ask = first.encounter!.definition.interactions[0]!;
    const madeFlag = (ask.success.effects.find((e) => e.kind === "flag") as { flag: string }).flag;
    const extra = newOpportunity("Follow up", "More.");
    extra.requiresFlags = [madeFlag];
    first.encounter!.definition.interactions.push(extra);

    expect(reachIssues(issuesFor(campaign))).toEqual([]);
  });
});

describe("objectives that cannot be reached", () => {
  it("flags an objective that needs a discovery from a scene the player cannot reach", () => {
    const { campaign, second } = twoScenes();
    const flag = (
      second.encounter!.definition.interactions[0]!.success.effects.find(
        (e) => e.kind === "flag",
      ) as { flag: string }
    ).flag;
    campaign.goal = { title: "Finish", requiresFlags: [flag] };
    campaign.sceneLinks = [];

    const found = reachIssues(issuesFor(campaign));

    expect(found.some((i) => i.kind === "objective")).toBe(true);
  });

  it("accepts an objective the player can reach", () => {
    const { campaign, second } = twoScenes();
    const flag = (
      second.encounter!.definition.interactions[0]!.success.effects.find(
        (e) => e.kind === "flag",
      ) as { flag: string }
    ).flag;
    campaign.goal = { title: "Finish", requiresFlags: [flag] };

    expect(reachIssues(issuesFor(campaign)).some((i) => i.kind === "objective")).toBe(false);
  });
});

describe("an item that starts in two scenes", () => {
  it("is a blocking issue naming both scenes", () => {
    const built = connectedAdventureExample();
    const campaign = structuredClone(built.campaign);
    const key = built.objects[0]!;
    for (const scene of campaign.scenes) {
      const game = scene.encounter!;
      game.definition.items.push({ id: key.id, name: key.name, requiresFlags: [] });
      game.state.itemLocations[key.id] = game.definition.places[0]!.id;
    }

    const issues = storyboardIssues(
      campaign,
      built.places,
      new Set(adventureFacts(campaign).map((fact) => fact.id)),
    );

    const duplicate = issues.find((issue) => issue.message.includes("only one place"));
    expect(duplicate).toMatchObject({ kind: "scene", field: "parts", id: campaign.scenes[1]!.id });
    expect(duplicate!.message).toContain(key.name);
  });

  it("does not count the same thing carried by the player in every scene", () => {
    const built = connectedAdventureExample();
    const campaign = structuredClone(built.campaign);
    for (const scene of campaign.scenes) {
      const game = scene.encounter!;
      game.definition.items.push({ id: "lamp", name: "Lamp", requiresFlags: [] });
      game.state.actors.player!.inventory.push("lamp");
    }

    const issues = storyboardIssues(
      campaign,
      built.places,
      new Set(adventureFacts(campaign).map((fact) => fact.id)),
    );

    expect(issues.some((issue) => issue.message.includes("only one place"))).toBe(false);
  });
});
