import { describe, expect, it } from "vitest";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { scaffoldIntoAdventure } from "../../src/library/worldScaffold";
import { adventureMapPlaces } from "../../src/library/adventureMap";
import { adventureFacts } from "../../src/library/playableCampaign";
import { storyboardIssues } from "../../src/ui/studio/storyboardReadiness";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { validateAdventure } from "../../src/game/AdventureEngine";
import { scaffoldFromWorld } from "../../src/library/worldScaffold";
import { emptyCampaignPlayer, newRealmTemplate } from "../../src/library/LibrarySchema";
import { settlementPiece } from "../../src/library/settlement";
import { WorldMapSchema } from "../../src/library/worldMap";
import type { CampaignTemplate } from "../../src/library/LibrarySchema";

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

  it("adds a way from an old scene out to a new one, and says which old scene got it", () => {
    const { world, campaign } = without(["Kitchen"]);

    const result = scaffoldIntoAdventure(campaign, world, library);

    const scene = (name: string) => result.campaign.scenes.find((s) => s.name === name)!;
    const out = result.campaign.sceneLinks.filter(
      (l) => l.fromSceneId === scene("Common room").id && l.toSceneId === scene("Kitchen").id,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.requiresOpenBarriers ?? []).toEqual([]);
    expect(result.reconnected).toContain("Common room");
  });

  it("leaves out a way into an old scene whose ways in have a door or a condition, and says so", () => {
    const { world, campaign } = without(["Kitchen"]);

    const result = scaffoldIntoAdventure(campaign, world, library);

    const scene = (name: string) => result.campaign.scenes.find((s) => s.name === name)!;
    expect(
      result.campaign.sceneLinks.some(
        (l) => l.fromSceneId === scene("Kitchen").id && l.toSceneId === scene("Common room").id,
      ),
    ).toBe(false);
    expect(result.skipped.join(" ")).toContain(
      "The way from “Kitchen” to “Common room” was left out, because “Common room” can only be reached through conditions or doors",
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

/** The scenes the player can reach from the first one over ways with no condition and no door. */
function freeReach(campaign: CampaignTemplate): Set<string> {
  const seen = new Set([campaign.scenes[0]!.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const link of campaign.sceneLinks) {
      const free =
        link.requiresFlags.length === 0 &&
        link.requiresAbsentFlags.length === 0 &&
        (link.requiresOpenBarriers ?? []).length === 0;
      if (free && seen.has(link.fromSceneId) && !seen.has(link.toSceneId)) {
        seen.add(link.toSceneId);
        grew = true;
      }
    }
  }
  return seen;
}

describe("a way round the author's conditions", () => {
  /** Gate and City, the way in needing the discovery “admitted”; then a Farm with paths to both. */
  function gateAndCity(guard: "flag" | "none") {
    const piece = (name: string, x: number) => ({ ...settlementPiece("cottage", "", x, 50), name });
    const gate = piece("Gate", 20),
      city = piece("City", 80),
      farm = piece("Farm", 50);
    const route = (id: string, from: string, to: string) => ({
      id,
      from,
      to,
      type: "path" as const,
      mode: "Walk",
      duration: "10 minutes",
      bothWays: true,
      access: "open" as const,
      description: "",
    });
    const before = newRealmTemplate({
      name: "Highmark",
      source: "player",
      note: "",
      worldMap: WorldMapSchema.parse({
        background: "#d8e3ba",
        mapType: "world",
        nodes: [gate, city],
        routes: [route("main", gate.id, city.id)],
      }),
    });
    const built = scaffoldFromWorld(
      before,
      { characters: [], objects: [], places: [], rulesets: [] },
      { player: { ...emptyCampaignPlayer(), name: "Traveller" }, startNodeId: gate.id },
    );
    const campaign = built.campaign;
    const inLink = campaign.sceneLinks.find(
      (l) =>
        l.fromSceneId === campaign.scenes.find((s) => s.name === "Gate")!.id &&
        l.toSceneId === campaign.scenes.find((s) => s.name === "City")!.id,
    )!;
    if (guard === "flag") inLink.requiresFlags = ["admitted"];
    const after = structuredClone(before);
    after.worldMap!.nodes.push(farm);
    after.worldMap!.routes.push(
      route("to-gate", farm.id, gate.id),
      route("to-city", farm.id, city.id),
    );
    return { campaign, world: after };
  }

  it("is not opened by a new place with paths to both: the way into the city keeps its condition", () => {
    const { campaign, world } = gateAndCity("flag");
    const free = freeReach(campaign);

    const result = scaffoldIntoAdventure(campaign, world, library);

    const city = result.campaign.scenes.find((s) => s.name === "City")!;
    expect(result.campaign.scenes.map((s) => s.name)).toContain("Farm");
    expect(freeReach(result.campaign).has(city.id)).toBe(false);
    expect(free.has(city.id)).toBe(false);
    expect(result.skipped.join(" ")).toContain(
      "The way from “Farm” to “City” was left out, because “City” can only be reached through conditions or doors; add it yourself if you want it",
    );
    expect(result.reconnected).toContain("Gate");
  });

  it("changes what is reachable without conditions for no old scene, only adds the new ones", () => {
    for (const guard of ["flag", "none"] as const) {
      const { campaign, world } = gateAndCity(guard);
      const before = freeReach(campaign);

      const result = scaffoldIntoAdventure(campaign, world, library);
      const after = freeReach(result.campaign);

      for (const scene of campaign.scenes) expect(after.has(scene.id)).toBe(before.has(scene.id));
    }
  });

  it("adds the way into the city when nothing guards the ways into it", () => {
    const { campaign, world } = gateAndCity("none");

    const result = scaffoldIntoAdventure(campaign, world, library);

    const scene = (name: string) => result.campaign.scenes.find((s) => s.name === name)!;
    expect(
      result.campaign.sceneLinks.some(
        (l) => l.fromSceneId === scene("Farm").id && l.toSceneId === scene("City").id,
      ),
    ).toBe(true);
  });

  /** Gate → Square → Palace, only the first step needing “admitted”; then a Farm with paths to Gate and Palace. */
  function chain() {
    const piece = (name: string, x: number) => ({ ...settlementPiece("cottage", "", x, 50), name });
    const gate = piece("Gate", 10),
      square = piece("Square", 40),
      palace = piece("Palace", 80),
      farm = piece("Farm", 50);
    const route = (id: string, from: string, to: string) => ({
      id,
      from,
      to,
      type: "path" as const,
      mode: "Walk",
      duration: "10 minutes",
      bothWays: true,
      access: "open" as const,
      description: "",
    });
    const before = newRealmTemplate({
      name: "Highmark",
      source: "player",
      note: "",
      worldMap: WorldMapSchema.parse({
        background: "#d8e3ba",
        mapType: "world",
        nodes: [gate, square, palace],
        routes: [route("a", gate.id, square.id), route("b", square.id, palace.id)],
      }),
    });
    const campaign = scaffoldFromWorld(
      before,
      { characters: [], objects: [], places: [], rulesets: [] },
      { player: { ...emptyCampaignPlayer(), name: "Traveller" }, startNodeId: gate.id },
    ).campaign;
    const id = (name: string) => campaign.scenes.find((s) => s.name === name)!.id;
    for (const link of campaign.sceneLinks)
      if (link.fromSceneId === id("Gate") && link.toSceneId === id("Square"))
        link.requiresFlags = ["admitted"];
    const world = structuredClone(before);
    world.worldMap!.nodes.push(farm);
    world.worldMap!.routes.push(
      route("to-gate", farm.id, gate.id),
      route("to-palace", farm.id, palace.id),
    );
    return { campaign, world };
  }

  it("is not opened when the condition sits a step further back: the palace is still only reached through the square", () => {
    const { campaign, world } = chain();
    const before = freeReach(campaign);

    const result = scaffoldIntoAdventure(campaign, world, library);

    const scene = (name: string) => result.campaign.scenes.find((s) => s.name === name)!;
    expect(result.campaign.scenes.map((s) => s.name)).toContain("Farm");
    expect(
      result.campaign.sceneLinks.some(
        (l) => l.fromSceneId === scene("Farm").id && l.toSceneId === scene("Palace").id,
      ),
    ).toBe(false);
    const after = freeReach(result.campaign);
    expect(before.has(scene("Palace").id)).toBe(false);
    expect(after.has(scene("Palace").id)).toBe(false);
    expect(after.has(scene("Square").id)).toBe(false);
    for (const old of campaign.scenes) expect(after.has(old.id)).toBe(before.has(old.id));
    expect(result.skipped.join(" ")).toContain(
      "The way from “Farm” to “Palace” was left out, because “Palace” can only be reached through conditions or doors",
    );
  });

  it("still lets the new place be reached freely from the gate, and leads on to nothing it should not", () => {
    const { campaign, world } = chain();

    const result = scaffoldIntoAdventure(campaign, world, library);

    const farm = result.campaign.scenes.find((s) => s.name === "Farm")!;
    expect(freeReach(result.campaign).has(farm.id)).toBe(true);
  });
});
