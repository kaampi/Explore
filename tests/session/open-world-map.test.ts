import { describe, expect, it } from "vitest";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { adventureMapPlaces } from "../../src/library/adventureMap";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { validateAdventure } from "../../src/game/AdventureEngine";
import {
  CampaignTemplateSchema,
  emptyCampaignPlayer,
  newRealmTemplate,
  type CampaignTemplate,
} from "../../src/library/LibrarySchema";
import { scaffoldFromWorld } from "../../src/library/worldScaffold";
import { settlementPiece } from "../../src/library/settlement";
import { WorldMapSchema } from "../../src/library/worldMap";

const library = { characters: [], objects: [], places: [], rulesets: [] };

/** The inn adventure with the kitchen and guest room not written, so the map has more than the story. */
function written(openWorld: "scenes" | "map") {
  const { realm, campaign } = innVisitExample();
  const gone = new Set(
    campaign.scenes.filter((s) => ["Kitchen", "Guest room"].includes(s.name)).map((s) => s.id),
  );
  const trimmed: CampaignTemplate = {
    ...campaign,
    openWorld,
    scenes: campaign.scenes.filter((s) => !gone.has(s.id)),
    sceneLinks: campaign.sceneLinks.filter(
      (l) => !gone.has(l.fromSceneId) && !gone.has(l.toSceneId),
    ),
  };
  const places = adventureMapPlaces(realm, []).map((e) => e.place);
  return { realm, campaign: trimmed, places };
}

const start = (openWorld: "scenes" | "map") => {
  const { realm, campaign, places } = written(openWorld);
  const session = startPlayableCampaign(campaign, campaign.scenes[0]!, places, "open", [realm]);
  return { session, campaign, realm, places };
};

describe("an adventure that opens onto the map", () => {
  it("is the written scenes only unless it says map, and an older adventure says so by default", () => {
    const plain = start("scenes");

    expect(plain.session.adventure!.scenes.map((s) => s.name).sort()).toEqual(
      plain.campaign.scenes.map((s) => s.name).sort(),
    );
    const old = JSON.parse(JSON.stringify(plain.campaign));
    delete old.openWorld;
    expect(CampaignTemplateSchema.parse(old).openWorld).toBe("scenes");
  });

  it("gets scenes for the rest of the map when a game starts, and still passes the adventure check", () => {
    const { session, campaign } = start("map");

    const names = session.adventure!.scenes.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(["Kitchen", "Guest room"]));
    expect(session.adventure!.scenes.length).toBeGreaterThan(campaign.scenes.length);
    expect(() => validateAdventure(session.adventure!)).not.toThrow();
  });

  it("keeps every written scene and way, and the goal, exactly as written", () => {
    const { session, campaign } = start("map");
    const run = session.adventure!;

    for (const scene of campaign.scenes) {
      const kept = run.scenes.find((s) => s.id === scene.id)!;
      expect(kept.name).toBe(scene.name);
      expect(kept.game.state.barriers).toEqual(
        expect.objectContaining(
          Object.fromEntries(
            Object.keys(scene.encounter!.state.barriers).map((id) => [id, expect.anything()]),
          ),
        ),
      );
    }
    for (const link of campaign.sceneLinks)
      expect(run.links.find((l) => l.id === link.id)).toEqual(
        expect.objectContaining({
          fromSceneId: link.fromSceneId,
          toSceneId: link.toSceneId,
          label: link.label,
        }),
      );
    expect(run.goal).toEqual(campaign.goal);
    expect(run.currentSceneId).toBe(campaign.scenes[0]!.id);
  });

  it("adds nothing to the written adventure or the library", () => {
    const { realm, campaign, places } = written("map");
    const before = JSON.stringify({ realm, campaign });

    startPlayableCampaign(campaign, campaign.scenes[0]!, places, "open", [realm]);

    expect(JSON.stringify({ realm, campaign })).toBe(before);
    expect(campaign.scenes).toHaveLength(3);
  });

  it("does not open a way round a condition the author wrote", () => {
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
    const authored = scaffoldFromWorld(before, library, {
      player: { ...emptyCampaignPlayer(), name: "Traveller" },
      startNodeId: gate.id,
    }).campaign;
    const id = (name: string) => authored.scenes.find((s) => s.name === name)!.id;
    for (const link of authored.sceneLinks)
      if (link.fromSceneId === id("Gate") && link.toSceneId === id("Square"))
        link.requiresFlags = ["admitted"];
    const world = structuredClone(before);
    world.worldMap!.nodes.push(farm);
    world.worldMap!.routes.push(
      route("to-gate", farm.id, gate.id),
      route("to-palace", farm.id, palace.id),
    );
    const places = adventureMapPlaces(world, []).map((e) => e.place);
    const campaign: CampaignTemplate = {
      ...authored,
      openWorld: "map",
      goal: { title: "Reach the palace.", requiresFlags: ["audience"] },
    };

    const session = startPlayableCampaign(campaign, campaign.scenes[0]!, places, "open", [world]);

    const run = session.adventure!;
    const free = new Set([run.currentSceneId]);
    for (let again = true; again;) {
      again = false;
      for (const l of run.links)
        if (
          !l.requiresFlags.length &&
          !l.requiresAbsentFlags.length &&
          !(l.requiresOpenBarriers ?? []).length &&
          free.has(l.fromSceneId) &&
          !free.has(l.toSceneId)
        ) {
          free.add(l.toSceneId);
          again = true;
        }
    }
    expect(run.scenes.map((s) => s.name)).toContain("Farm");
    expect(free.has(run.scenes.find((s) => s.name === "Farm")!.id)).toBe(true);
    expect(free.has(run.scenes.find((s) => s.name === "Square")!.id)).toBe(false);
    expect(free.has(run.scenes.find((s) => s.name === "Palace")!.id)).toBe(false);
    expect(run.goal).toEqual(campaign.goal);
  });

  it("does nothing for an adventure that has no map to open onto", () => {
    const { campaign, places } = written("map");
    const { mapWorldId: _map, ...bare } = campaign;

    expect(() =>
      startPlayableCampaign({ ...bare, openWorld: "map" }, campaign.scenes[0]!, places, "open", []),
    ).not.toThrow(/map/);
  });
});

describe("starting from a scene other than the first", () => {
  /** City written first, then Gate; Gate → City needs “admitted”, the way back is free; a Farm with paths to both. */
  function cityThenGate() {
    const piece = (name: string, x: number) => ({ ...settlementPiece("cottage", "", x, 50), name });
    const city = piece("City", 80),
      gate = piece("Gate", 10),
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
        nodes: [city, gate],
        routes: [route("main", gate.id, city.id)],
      }),
    });
    const authored = scaffoldFromWorld(before, library, {
      player: { ...emptyCampaignPlayer(), name: "Traveller" },
      startNodeId: city.id,
    }).campaign;
    const id = (name: string) => authored.scenes.find((s) => s.name === name)!.id;
    expect(authored.scenes[0]!.name).toBe("City");
    for (const link of authored.sceneLinks)
      if (link.fromSceneId === id("Gate") && link.toSceneId === id("City"))
        link.requiresFlags = ["admitted"];
    const world = structuredClone(before);
    world.worldMap!.nodes.push(farm);
    world.worldMap!.routes.push(
      route("to-gate", farm.id, gate.id),
      route("to-city", farm.id, city.id),
    );
    const places = adventureMapPlaces(world, []).map((e) => e.place);
    return { authored: { ...authored, openWorld: "map" as const }, world, places, id };
  }

  const freeFrom = (
    run: {
      links: {
        fromSceneId: string;
        toSceneId: string;
        requiresFlags: string[];
        requiresAbsentFlags: string[];
        requiresOpenBarriers?: string[] | undefined;
      }[];
    },
    start: string,
  ) => {
    const free = new Set([start]);
    for (let again = true; again;) {
      again = false;
      for (const l of run.links)
        if (
          !l.requiresFlags.length &&
          !l.requiresAbsentFlags.length &&
          !(l.requiresOpenBarriers ?? []).length &&
          free.has(l.fromSceneId) &&
          !free.has(l.toSceneId)
        ) {
          free.add(l.toSceneId);
          again = true;
        }
    }
    return free;
  };

  it("counts what is freely reachable from where the game really starts, so no way round the condition is added", () => {
    const { authored, world, places, id } = cityThenGate();
    const gate = authored.scenes.find((s) => s.name === "Gate")!;

    const session = startPlayableCampaign(authored, gate, places, "from-gate", [world]);

    const run = session.adventure!;
    const free = freeFrom(run, id("Gate"));
    const farm = run.scenes.find((s) => s.name === "Farm")!;
    expect(free.has(farm.id)).toBe(true);
    expect(free.has(id("City"))).toBe(false);
    expect(run.links.some((l) => l.fromSceneId === farm.id && l.toSceneId === id("City"))).toBe(
      false,
    );
  });

  it("allows the new ways when starting at the city, where they cannot get round anything", () => {
    const { authored, world, places, id } = cityThenGate();

    const session = startPlayableCampaign(authored, authored.scenes[0]!, places, "from-city", [
      world,
    ]);

    const run = session.adventure!;
    const farm = run.scenes.find((s) => s.name === "Farm")!;
    expect(run.links.some((l) => l.fromSceneId === farm.id && l.toSceneId === id("City"))).toBe(
      true,
    );
  });
});
