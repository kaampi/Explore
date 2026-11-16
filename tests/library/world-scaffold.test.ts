import { describe, expect, it } from "vitest";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { scaffoldFromWorld } from "../../src/library/worldScaffold";
import { emptyCampaignPlayer } from "../../src/library/LibrarySchema";
import { adventureMapPlaces } from "../../src/library/adventureMap";
import { adventureFacts } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { validateAdventure } from "../../src/game/AdventureEngine";
import { storyboardIssues } from "../../src/ui/studio/storyboardReadiness";
import { MAX_WORLD_SCENES } from "../../src/library/worldScaffold";

function scaffold() {
  const inn = innVisitExample();
  const library = { characters: [], objects: [], places: [], rulesets: [] };
  const start = inn.campaign.scenes[0]!.mapNodeId!;
  const built = scaffoldFromWorld(inn.realm, library, {
    player: { ...emptyCampaignPlayer(), name: "Traveller" },
    startNodeId: start,
  });
  return { inn, built, library };
}

const edges = (c: ReturnType<typeof innVisitExample>["campaign"]) => {
  const node = new Map(c.scenes.map((s) => [s.id, s.mapNodeId!]));
  return c.sceneLinks.map((l) => `${node.get(l.fromSceneId)}>${node.get(l.toSceneId)}`).sort();
};
const doors = (c: ReturnType<typeof innVisitExample>["campaign"]) =>
  c.scenes
    .flatMap((s) =>
      Object.values(s.encounter!.state.barriers).map(
        (b) => `${s.mapNodeId}:${b.id}:${b.locked ? "locked" : "unlocked"}`,
      ),
    )
    .sort();

describe("free play built from a map", () => {
  it("gives the same places, ways and doors as the inn built by hand, and the village around it", () => {
    const { inn, built } = scaffold();
    const world = inn.realm.worldMap!;
    const townId = world.nodes.find((n) => n.name === "Brookmere")!.id;
    const withoutTown = (list: string[]) => list.filter((entry) => !entry.includes(townId));

    expect(built.campaign.scenes.map((s) => s.mapNodeId)).toContain(townId);
    expect(withoutTown(built.campaign.scenes.map((s) => s.mapNodeId!)).sort()).toEqual(
      inn.campaign.scenes.map((s) => s.mapNodeId).sort(),
    );
    const handMade = [...new Set(edges(inn.campaign))];
    expect(withoutTown(edges(built.campaign)).sort()).toEqual(handMade.sort());
    expect(doors(built.campaign)).toEqual(doors(inn.campaign));
  });

  it("links the village and the inn both ways with no door, since the village has no walls", () => {
    const { inn, built } = scaffold();
    const world = inn.realm.worldMap!;
    const town = world.nodes.find((n) => n.name === "Brookmere")!;
    const lodge = world.nodes.find((n) => n.name === "The Copper Lantern")!;
    const scene = (id: string) => built.campaign.scenes.find((s) => s.mapNodeId === id)!;

    const links = built.campaign.sceneLinks.filter(
      (l) =>
        [scene(town.id).id, scene(lodge.id).id].includes(l.fromSceneId) &&
        [scene(town.id).id, scene(lodge.id).id].includes(l.toSceneId),
    );

    expect(links.map((l) => l.label).sort()).toEqual([
      "Enter The Copper Lantern",
      "Leave Brookmere",
    ]);
    expect(links.every((l) => !l.requiresOpenBarriers?.length)).toBe(true);
  });
});

const player = { ...emptyCampaignPlayer(), name: "Traveller" };
const empty = { characters: [], objects: [], places: [], rulesets: [] };
const named = (world: ReturnType<typeof innVisitExample>["realm"], name: string) =>
  world.worldMap!.nodes.find((n) => n.name === name)!;

describe("what the build leaves out and what it checks", () => {
  it("builds nothing from crossings, areas, furniture or hidden places, and nothing from a hidden way", () => {
    const { inn } = scaffold();
    const world = structuredClone(inn.realm);
    const map = world.worldMap!;
    named(world, "Kitchen").isArea = true;
    named(world, "Guest room").visibility = "hidden";
    map.nodes.push({
      ...structuredClone(named(world, "Store room")),
      id: "crossing",
      name: "Crossing",
      isJunction: true,
    });
    const commonId = named(world, "Common room").id;
    const hidden = map.routes.find(
      (r) => r.access === "open" && (r.from === commonId || r.to === commonId),
    )!;
    hidden.access = "hidden";

    const built = scaffoldFromWorld(world, empty, {
      player,
      startNodeId: named(world, "Common room").id,
    });

    const names = built.campaign.scenes.map((s) => s.name);
    expect(names).not.toContain("Kitchen");
    expect(names).not.toContain("Guest room");
    expect(names).not.toContain("Crossing");
    expect(names).not.toContain("Table");
    expect(built.skipped.join(" ")).toContain("Kitchen");
    expect(built.skipped.join(" ")).toContain("Guest room");
    const touching = built.campaign.sceneLinks.filter((l) => {
      const to = built.campaign.scenes.find((s) => s.id === l.toSceneId)!.mapNodeId;
      const from = built.campaign.scenes.find((s) => s.id === l.fromSceneId)!.mapNodeId;
      return [to, from].includes(hidden.from) && [to, from].includes(hidden.to);
    });
    expect(touching).toEqual([]);
  });

  it("starts in the chosen place and plays as any adventure, with a locked door that stays shut", () => {
    const { inn } = scaffold();
    const common = named(inn.realm, "Common room");
    const built = scaffoldFromWorld(inn.realm, empty, { player, startNodeId: common.id });
    const places = adventureMapPlaces(inn.realm, []).map((e) => e.place);

    expect(built.campaign.scenes[0]!.mapNodeId).toBe(common.id);
    const session = startPlayableCampaign(
      built.campaign,
      built.campaign.scenes[0]!,
      places,
      "free",
      [inn.realm],
    );
    expect(() => validateAdventure(session.adventure!)).not.toThrow();
    const facts = new Set(adventureFacts(built.campaign).map((f) => f.id));
    expect(storyboardIssues(built.campaign, places, facts)).toEqual([]);
    const store = built.campaign.scenes.find((s) => s.name === "Store room")!;
    const door = Object.values(store.encounter!.state.barriers)[0]!;
    expect(door).toMatchObject({ locked: true, shared: true });
    expect(door.keyId).toBeUndefined();
  });

  it("changes nothing in the world or the library", () => {
    const { inn } = scaffold();
    const before = JSON.stringify(inn.realm);

    scaffoldFromWorld(inn.realm, empty, {
      player,
      startNodeId: named(inn.realm, "Common room").id,
    });

    expect(JSON.stringify(inn.realm)).toBe(before);
    expect(empty).toEqual({ characters: [], objects: [], places: [], rulesets: [] });
  });

  it("refuses a world that is too big, and builds a part of it from a town", () => {
    const { inn } = scaffold();
    const world = structuredClone(inn.realm);
    const lodge = named(world, "The Copper Lantern");
    const room = named(world, "Guest room");
    for (let i = 0; i < MAX_WORLD_SCENES + 5; i++)
      world.worldMap!.nodes.push({
        ...structuredClone(room),
        id: `extra-${i}`,
        name: `Extra ${i}`,
        parentId: lodge.id,
      });
    const other = {
      ...structuredClone(named(world, "Brookmere")),
      id: "second-town",
      name: "Second town",
    };
    const cottage = {
      ...structuredClone(room),
      id: "cottage",
      name: "Cottage",
      parentId: other.id,
    };
    world.worldMap!.nodes.push(other, cottage);

    expect(() => scaffoldFromWorld(world, empty, { player, startNodeId: lodge.id })).toThrow(
      /Choose a town or a building/,
    );
    const part = scaffoldFromWorld(world, empty, { player, startNodeId: other.id });

    expect(part.campaign.scenes.map((s) => s.name).sort()).toEqual(["Cottage", "Second town"]);
    expect(part.skipped.length).toBeGreaterThan(MAX_WORLD_SCENES);
  });

  it("asks for a start place that is on the map", () => {
    const { inn } = scaffold();

    expect(() => scaffoldFromWorld(inn.realm, empty, { player, startNodeId: "nowhere" })).toThrow(
      /Choose a place/,
    );
  });
});
