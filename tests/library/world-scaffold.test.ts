import { describe, expect, it } from "vitest";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { scaffoldFromWorld } from "../../src/library/worldScaffold";
import {
  emptyCampaignPlayer,
  newCharacterTemplate,
  newObjectTemplate,
} from "../../src/library/LibrarySchema";
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

describe("ways through crossings, and people and things on the map", () => {
  /** The kitchen and the guest room, joined through a crossing instead of directly. */
  function throughCrossing(access: "open" | "locked" | "hidden" = "open") {
    const { inn } = scaffold();
    const world = structuredClone(inn.realm);
    const map = world.worldMap!;
    const kitchen = named(world, "Kitchen");
    const guest = named(world, "Guest room");
    const direct = map.routes.find(
      (r) => [r.from, r.to].includes(kitchen.id) && [r.from, r.to].includes(guest.id),
    )!;
    map.nodes.push({
      ...structuredClone(guest),
      id: "crossing",
      name: "Crossing",
      isJunction: true,
      characterIds: [],
    });
    map.routes = map.routes.filter((r) => r !== direct);
    map.routes.push(
      {
        ...structuredClone(direct),
        id: "to-crossing",
        from: kitchen.id,
        to: "crossing",
        duration: "5 minutes",
      },
      {
        ...structuredClone(direct),
        id: "from-crossing",
        from: "crossing",
        to: guest.id,
        duration: "7 minutes",
        access,
      },
    );
    return { world, kitchen, guest };
  }
  const linkBetween = (built: ReturnType<typeof scaffoldFromWorld>, from: string, to: string) => {
    const scene = (id: string) => built.campaign.scenes.find((s) => s.mapNodeId === id)!;
    return built.campaign.sceneLinks.find(
      (l) => l.fromSceneId === scene(from).id && l.toSceneId === scene(to).id,
    );
  };

  it("follows a way through a crossing to the place on the other side, both ways, with the total travel time", () => {
    const { world, kitchen, guest } = throughCrossing();

    const built = scaffoldFromWorld(world, empty, { player, startNodeId: kitchen.id });

    expect(linkBetween(built, kitchen.id, guest.id)?.minutes).toBe(12);
    expect(linkBetween(built, guest.id, kitchen.id)?.minutes).toBe(12);
    expect(built.campaign.scenes.map((s) => s.name)).not.toContain("Crossing");
  });

  it("makes the whole way a locked door if any part of it is locked, and drops it if any part is hidden", () => {
    const locked = throughCrossing("locked");
    const lockedBuild = scaffoldFromWorld(locked.world, empty, {
      player,
      startNodeId: locked.kitchen.id,
    });
    const link = linkBetween(lockedBuild, locked.kitchen.id, locked.guest.id)!;
    expect(link.requiresOpenBarriers).toEqual(["from-crossing"]);

    const hidden = throughCrossing("hidden");
    const hiddenBuild = scaffoldFromWorld(hidden.world, empty, {
      player,
      startNodeId: hidden.kitchen.id,
    });
    expect(linkBetween(hiddenBuild, hidden.kitchen.id, hidden.guest.id)).toBeUndefined();
  });

  it("puts a person on the map's first place only, and says so", () => {
    const { inn } = scaffold();
    const world = structuredClone(inn.realm);
    const edda = newCharacterTemplate({ name: "Edda" });
    named(world, "Common room").characterIds = [edda.id];
    named(world, "Kitchen").characterIds = [edda.id];
    const built = scaffoldFromWorld(
      world,
      { ...empty, characters: [edda] },
      { player, startNodeId: named(world, "Common room").id },
    );

    const where = built.campaign.scenes.filter((s) =>
      Object.keys(s.encounter!.state.actors).includes(`npc:${edda.id}`),
    );

    expect(where).toHaveLength(1);
    expect(built.skipped.join(" ")).toContain("Edda is also on");
  });

  it("gives a person the things whose card says they start with them", () => {
    const { inn } = scaffold();
    const world = structuredClone(inn.realm);
    const edda = newCharacterTemplate({ name: "Edda" });
    const ring = newObjectTemplate({
      name: "Silver ring",
      note: "",
      tags: [],
      source: "player",
      startingLocation: { kind: "character", characterId: edda.id },
    });
    named(world, "Common room").characterIds = [edda.id];
    const built = scaffoldFromWorld(
      world,
      { ...empty, characters: [edda], objects: [ring] },
      { player, startNodeId: named(world, "Common room").id },
    );

    const scene = built.campaign.scenes.find((s) => s.name === "Common room")!;

    expect(scene.encounter!.state.actors[`npc:${edda.id}`]!.inventory).toContain(ring.id);
  });
});
