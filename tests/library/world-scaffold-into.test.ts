import { describe, expect, it } from "vitest";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { scaffoldIntoAdventure } from "../../src/library/worldScaffold";
import { adventureMapPlaces } from "../../src/library/adventureMap";
import { adventureFacts } from "../../src/library/playableCampaign";
import { storyboardIssues } from "../../src/ui/studio/storyboardReadiness";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { validateAdventure } from "../../src/game/AdventureEngine";

const library = { characters: [], objects: [], places: [], rulesets: [] };

function inn() {
  const built = innVisitExample();
  return { world: built.realm, campaign: built.campaign };
}
/** The inn adventure with some of its scenes taken away, as if the author had not made them yet. */
function without(names: string[]) {
  const { world, campaign } = inn();
  const gone = new Set(campaign.scenes.filter((s) => names.includes(s.name)).map((s) => s.id));
  return {
    world,
    campaign: {
      ...campaign,
      scenes: campaign.scenes.filter((s) => !gone.has(s.id)),
      sceneLinks: campaign.sceneLinks.filter(
        (l) => !gone.has(l.fromSceneId) && !gone.has(l.toSceneId),
      ),
    },
  };
}

describe("build scenes from this map, into an adventure", () => {
  it("adds nothing more when every place has a scene, and says so", () => {
    const { world, campaign } = inn();
    const first = scaffoldIntoAdventure(campaign, world, library);

    const again = scaffoldIntoAdventure(first.campaign, world, library);

    expect(again.added).toBe(0);
    expect(again.campaign).toBe(first.campaign);
    expect(again.skipped.join(" ")).toContain("already has a scene");
  });

  it("adds scenes for the places that have none, and leaves every scene and way that was there exactly as it was", () => {
    const { world, campaign } = without(["Kitchen", "Guest room"]);
    const before = structuredClone(campaign);

    const result = scaffoldIntoAdventure(campaign, world, library);

    const names = result.campaign.scenes.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(["Kitchen", "Guest room"]));
    expect(result.added).toBe(result.campaign.scenes.length - before.scenes.length);
    expect(result.campaign.scenes.slice(0, before.scenes.length)).toEqual(before.scenes);
    expect(result.campaign.sceneLinks.slice(0, before.sceneLinks.length)).toEqual(
      before.sceneLinks,
    );
    expect(campaign).toEqual(before);
  });

  it("connects the new scenes to the old ones, without a door the old scene could not be given", () => {
    const { world, campaign } = without(["Kitchen"]);

    const result = scaffoldIntoAdventure(campaign, world, library);

    const scene = (name: string) => result.campaign.scenes.find((s) => s.name === name)!;
    const links = result.campaign.sceneLinks.filter(
      (l) =>
        [l.fromSceneId, l.toSceneId].includes(scene("Kitchen").id) &&
        [l.fromSceneId, l.toSceneId].includes(scene("Common room").id),
    );
    expect(links).toHaveLength(2);
    expect(links.every((l) => !l.requiresOpenBarriers?.length)).toBe(true);
    expect(Object.keys(scene("Kitchen").encounter!.state.barriers)).not.toContain(
      "a695d97f-8dd4-4cf0-94cc-e88835921770",
    );
  });

  it("leaves out a locked way to an old scene and says which", () => {
    const { world, campaign } = without(["Store room"]);

    const result = scaffoldIntoAdventure(campaign, world, library);

    const store = result.campaign.scenes.find((s) => s.name === "Store room")!;
    expect(store).toBeDefined();
    expect(
      result.campaign.sceneLinks.some((l) => [l.fromSceneId, l.toSceneId].includes(store.id)),
    ).toBe(false);
    expect(result.skipped.join(" ")).toContain("locked way");
  });

  it("gives an adventure that still starts and has no blocking problems, and a second run adds nothing", () => {
    const { world, campaign } = without(["Kitchen", "Guest room"]);
    const places = adventureMapPlaces(world, []).map((e) => e.place);

    const result = scaffoldIntoAdventure(campaign, world, library);

    const session = startPlayableCampaign(
      result.campaign,
      result.campaign.scenes[0]!,
      places,
      "into",
      [world],
    );
    expect(() => validateAdventure(session.adventure!)).not.toThrow();
    const facts = new Set(adventureFacts(result.campaign).map((f) => f.id));
    expect(storyboardIssues(result.campaign, places, facts)).toEqual([]);
    expect(scaffoldIntoAdventure(result.campaign, world, library).added).toBe(0);
  });

  it("refuses a world with no map", () => {
    const { world, campaign } = inn();
    const bare = { ...world };
    delete bare.worldMap;

    expect(() => scaffoldIntoAdventure(campaign, bare, library)).toThrow(/no map/);
  });
});
