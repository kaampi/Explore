import { describe, expect, it } from "vitest";
import { adventureSteps } from "../../src/ui/studio/adventureSteps";
import { storyboardIssues } from "../../src/ui/studio/storyboardReadiness";
import { adventureFacts, connectedAdventureExample } from "../../src/library/playableCampaign";
import { emptyCampaignScene, newCampaignTemplate } from "../../src/library/LibrarySchema";

/** The adventure form creates new adventures with an empty name. */
function unnamed(fields: { scenes: ReturnType<typeof emptyCampaignScene>[] }) {
  return { ...newCampaignTemplate({ name: "x", ...fields }), name: "" };
}

function stepsFor(campaign: ReturnType<typeof newCampaignTemplate>, places = [] as never[]) {
  const issues = storyboardIssues(
    campaign,
    places,
    new Set(adventureFacts(campaign).map((fact) => fact.id)),
  );
  return adventureSteps(campaign, issues);
}

describe("adventureSteps", () => {
  it("lists the steps in the guided order", () => {
    const campaign = unnamed({ scenes: [] });

    expect(stepsFor(campaign).map((step) => step.label)).toEqual([
      "World",
      "You",
      "Cast",
      "Scenes",
      "Connections",
      "Test",
    ]);
  });

  it("marks nothing done for a brand new adventure", () => {
    const campaign = unnamed({ scenes: [emptyCampaignScene()] });

    expect(stepsFor(campaign).every((step) => !step.done)).toBe(true);
  });

  it("marks World done once the adventure has a name and a world", () => {
    const campaign = newCampaignTemplate({ name: "Tale", realmId: "r1", scenes: [] });

    expect(stepsFor(campaign)[0]).toMatchObject({ id: "world", done: true });
  });

  it("marks World not done when there is a world but no name", () => {
    const campaign = newCampaignTemplate({ name: " ", realmId: "r1", scenes: [] });

    const world = stepsFor(campaign)[0]!;
    expect(world.done).toBe(false);
    expect(world.note).toBe("Name it");
  });

  it("marks You done once the player has a name", () => {
    const named = newCampaignTemplate({
      name: "Tale",
      scenes: [],
      player: { name: "Mira", stats: {}, personality: "", appearance: "" },
    });

    expect(stepsFor(named)[1]).toMatchObject({ id: "you", done: true, note: "Mira" });
  });

  it("counts ready scenes the same way Storyboard does", () => {
    const built = connectedAdventureExample();
    const steps = adventureSteps(
      built.campaign,
      storyboardIssues(
        built.campaign,
        built.places,
        new Set(adventureFacts(built.campaign).map((fact) => fact.id)),
      ),
    );

    const scenes = steps.find((step) => step.id === "scenes")!;
    expect(scenes.note).toBe(
      `${built.campaign.scenes.length} of ${built.campaign.scenes.length} ready`,
    );
    expect(scenes.done).toBe(true);
  });

  it("finishes Connections and Test for the finished example", () => {
    const built = connectedAdventureExample();
    const steps = adventureSteps(
      built.campaign,
      storyboardIssues(
        built.campaign,
        built.places,
        new Set(adventureFacts(built.campaign).map((fact) => fact.id)),
      ),
    );

    expect(steps.find((s) => s.id === "connections")).toMatchObject({
      done: true,
      note: "2 routes",
    });
    expect(steps.find((s) => s.id === "test")).toMatchObject({ done: true, note: "Ready to play" });
  });

  it("does not call Test ready while scenes are unfinished", () => {
    const campaign = newCampaignTemplate({ name: "Tale", scenes: [emptyCampaignScene()] });

    const test = stepsFor(campaign).find((step) => step.id === "test")!;
    expect(test.done).toBe(false);
    expect(test.note).toMatch(/to finish/);
  });

  it("counts a single built scene as connected, since it needs no route", () => {
    const built = connectedAdventureExample();
    const single = {
      ...built.campaign,
      scenes: [built.campaign.scenes[0]!],
      sceneLinks: [],
    };

    expect(
      stepsFor(single, built.places as never[]).find((s) => s.id === "connections")?.done,
    ).toBe(true);
  });

  it("needs a route between scenes once there are two", () => {
    const built = connectedAdventureExample();
    const unlinked = { ...built.campaign, sceneLinks: [] };

    expect(
      stepsFor(unlinked, built.places as never[]).find((s) => s.id === "connections")?.done,
    ).toBe(false);
  });
});
