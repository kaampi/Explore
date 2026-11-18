import { describe, expect, it } from "vitest";
import {
  MAP_POINT_GAP,
  applyCoreEntityChanges,
  copyCoreEntity,
  placeOnWorldMap,
  renameOnWorldMap,
} from "../../src/integrations/coreEntities";
import { adventureMapPlaces } from "../../src/library/adventureMap";
import { scaffoldFromWorld } from "../../src/library/worldScaffold";
import { startWorldExploration } from "../../src/session/worldStart";
import { WorldMapSchema } from "../../src/library/worldMap";
import {
  emptyCampaignPlayer,
  newPlaceTemplate,
  newRealmTemplate,
  type PlaceTemplate,
} from "../../src/library/LibrarySchema";
import { settlementPiece } from "../../src/library/settlement";
import type { CoreBibleEntity } from "../../src/integrations/coreBibleSchema";

const realm = () => newRealmTemplate({ name: "Night Keys", source: "player", note: "" });
const places = (n: number, realmId = "r"): PlaceTemplate[] =>
  Array.from({ length: n }, (_, i) => newPlaceTemplate({ name: `Place ${i + 1}`, realmId }));
const spread = (nodes: { x: number; y: number }[]) => {
  let closest = Infinity;
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++)
      closest = Math.min(closest, Math.hypot(nodes[i]!.x - nodes[j]!.x, nodes[i]!.y - nodes[j]!.y));
  return closest;
};

describe("putting imported places on the world's map", () => {
  it("gives a world with no map one, with a point for every place, and no roads", () => {
    const world = realm();
    const list = places(3);

    const result = placeOnWorldMap(world, list);

    expect(world.worldMap).toBeUndefined();
    expect(result.worldMap!.mapType).toBe("world");
    expect(result.worldMap!.routes).toEqual([]);
    expect(result.worldMap!.nodes.map((n) => n.placeId)).toEqual(list.map((p) => p.id));
    expect(result.worldMap!.nodes.map((n) => n.name)).toEqual(["Place 1", "Place 2", "Place 3"]);
    expect(result.worldMap!.nodes.every((n) => n.kind === "Point of Interest" && !n.parentId)).toBe(
      true,
    );
    expect(result.worldMap!.nodes.every((n) => n.intro === undefined)).toBe(true);
  });

  it("makes a world that can be explored from one of the points", () => {
    const list = places(2);
    const world = placeOnWorldMap(realm(), list);
    const first = world.worldMap!.nodes[0]!;

    const { session } = startWorldExploration(
      world,
      { characters: [], objects: [], places: list, rulesets: [] },
      { player: { ...emptyCampaignPlayer(), name: "Traveller" }, startNodeId: first.id },
      "explore",
    );

    expect(session.adventure!.scenes.map((s) => s.name).sort()).toEqual(["Place 1", "Place 2"]);
    expect(adventureMapPlaces(world, list).map((e) => e.place.id)).toEqual(list.map((p) => p.id));
    expect(() =>
      scaffoldFromWorld(
        world,
        { characters: [], objects: [], places: list, rulesets: [] },
        {
          player: emptyCampaignPlayer(),
          startNodeId: first.id,
        },
      ),
    ).not.toThrow();
  });

  it("adds nothing for a place that already has a point, and moves nothing that is on the map", () => {
    const list = places(2);
    const first = placeOnWorldMap(realm(), [list[0]!]);
    const before = structuredClone(first.worldMap!.nodes);

    const second = placeOnWorldMap(first, list);

    expect(second.worldMap!.nodes).toHaveLength(2);
    expect(second.worldMap!.nodes.slice(0, 1)).toEqual(before);
    expect(placeOnWorldMap(second, list)).toBe(second);
    expect(placeOnWorldMap(second, [list[1]!, list[1]!])).toBe(second);
  });

  it("keeps every point inside 5 to 95 and at least 6 apart, with 40 places, and clear of the points already there", () => {
    const village = { ...settlementPiece("settlement", "", 12, 12), name: "Old village" };
    const existing = newRealmTemplate({
      name: "W",
      source: "player",
      note: "",
      worldMap: WorldMapSchema.parse({ mapType: "world", nodes: [village], routes: [] }),
    });

    const result = placeOnWorldMap(existing, places(40));

    const nodes = result.worldMap!.nodes;
    expect(nodes).toHaveLength(41);
    expect(nodes[0]).toEqual(existing.worldMap!.nodes[0]);
    const added = nodes.slice(1);
    expect(added.every((n) => n.x >= 5 && n.x <= 95 && n.y >= 5 && n.y <= 95)).toBe(true);
    expect(spread(added)).toBeGreaterThanOrEqual(MAP_POINT_GAP);
    expect(added.every((n) => Math.hypot(n.x - village.x, n.y - village.y) >= MAP_POINT_GAP)).toBe(
      true,
    );
  });

  it("puts every place on the map even when there are too many to keep apart", () => {
    const result = placeOnWorldMap(realm(), places(400));

    expect(result.worldMap!.nodes).toHaveLength(400);
    expect(
      result.worldMap!.nodes.every((n) => n.x >= 5 && n.x <= 95 && n.y >= 5 && n.y <= 95),
    ).toBe(true);
  });
});

describe("a place renamed from the manuscript", () => {
  const entity = (name: string): CoreBibleEntity => ({
    entity_ref: "mill",
    name,
    looks: "A mill.",
    facts: [],
    referenceImages: [],
  });
  const source = { workspaceId: "w", projectId: "p", revision: 1 };

  it("renames its point on the map, unless the author renamed the point", () => {
    const place = copyCoreEntity("locations", entity("The Old Mill"), source, { realmId: "r" });
    const world = placeOnWorldMap(realm(), [place]);
    const renamed = applyCoreEntityChanges(
      place,
      "locations",
      entity("The Ruined Mill"),
      ["name"],
      {
        ...source,
        revision: 2,
        entityRef: "mill",
      },
    );

    const followed = renameOnWorldMap(world, place.id, place.name, renamed.name);
    expect(followed.worldMap!.nodes[0]!.name).toBe("The Ruined Mill");

    const authors = {
      ...world,
      worldMap: {
        ...world.worldMap!,
        nodes: [{ ...world.worldMap!.nodes[0]!, name: "Brightwater Mill" }],
      },
    };
    const kept = renameOnWorldMap(authors, place.id, place.name, renamed.name);
    expect(kept).toBe(authors);
    expect(kept.worldMap!.nodes[0]!.name).toBe("Brightwater Mill");
  });

  it("leaves a world with no map, or without that place, as it is", () => {
    const world = realm();

    expect(renameOnWorldMap(world, "p", "A", "B")).toBe(world);
    const mapped = placeOnWorldMap(world, places(1));
    expect(renameOnWorldMap(mapped, "other", "Place 1", "B")).toBe(mapped);
  });
});
