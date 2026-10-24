import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import onlyFixture from "../fixtures/onlyworlds-world-export.json";
import { importWorldData, importAIDungeon, importOnlyWorlds, importAzgaar } from "../../src/lore/worldImports";
import { materializeWorld } from "../../src/lore/materializeWorld";
import { attachLorebooks } from "../../src/lore/attachLorebooks";
import { quickCharacterSession } from "../../src/ui/home/quickStart";
import { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { collectLibraryBackup, parseLibraryBackup, restoreLibraryBackup } from "@library/libraryBackup";
import { buildLayerBlocks } from "../../src/layers/LayerEngine";
import { canonSettingText } from "../../src/state/WorldCanon";
import { newCharacterTemplate, newPlaceTemplate, newRealmTemplate } from "@library/LibrarySchema";

export const cards = [
  { keys: "Ari, the navigator", value: "Ari reads the stars.", type: "character", title: "Ari", description: "PRIVATE EDITOR NOTE", useForCharacterCreation: true },
  { keys: "Starport", value: "Starport is a quiet harbour.", type: "location", title: "Starport" },
];
export const map = {
  info: { description: "Azgaar's Fantasy Map Generator output: azgaar.github.io/Fantasy-map-generator", version: "1.155.0", mapId: 123, mapName: "North Reach", width: 1000, height: 800 },
  pack: {
    states: [{ i: 0, name: "Neutral" }, { i: 1, name: "North", fullName: "Kingdom of North", capital: 1, culture: 1, form: "Monarchy" }],
    burgs: [0, { i: 1, name: "Port Dawn", state: 1, culture: 1, population: 2.5, x: 30, y: 40, capital: 1 }, { i: 2, name: "Lost", removed: true }],
    cultures: [{ i: 0, name: "Wildlands" }, { i: 1, name: "Northerners", type: "Naval" }],
    religions: [], routes: [{ i: 1, name: "Coast Road", points: [[1, 2], [3, 4]] }],
  },
  settings: { populationRate: 1000, urbanization: 1 }, grid: { cells: [0] },
};
function approve<T extends { entries: { approved: boolean; mode: string }[] }>(book: T): T { book.entries.forEach(e => { e.approved = e.mode !== "dormant"; }); return book; }

describe("external world adapters", () => {
  it("detects each source, preserves its original, and leaves everything unapproved/unlinked", () => {
    for (const [raw, format] of [[cards, "ai-dungeon"], [onlyFixture, "onlyworlds"], [map, "azgaar"]] as const) {
      const before = structuredClone(raw);
      const book = importWorldData(raw, "source.json");
      expect(book.origin?.format).toBe(format);
      expect(book.raw).toEqual(before);
      expect(raw).toEqual(before);
      expect(book.entries.every(e => !e.approved)).toBe(true);
      expect(book.binding.kind).toBe("none");
      expect(book.importNotes?.length).toBeGreaterThan(0);
    }
    expect(importWorldData({ entries: [{ keys: ["gate"], content: "Dawn", enabled: true }] }, "old.json").origin).toBeUndefined();
  });
  it("imports AI Dungeon triggers/content while keeping notes and creation flags out of prompts", () => {
    const book = importAIDungeon(cards, "Story Cards.json");
    expect(book.entries[0]?.keywords).toEqual(["Ari", "the navigator"]);
    expect(book.entries[0]?.content).toBe(cards[0]!.value);
    expect(JSON.stringify(book.entries.map(e => e.content))).not.toContain("PRIVATE");
    expect(book.entries[0]?.entity?.kind).toBe("character");
    expect(book.entries[1]?.entity?.kind).toBe("location");
    expect(book.entries[0]?.raw).toEqual(cards[0]);
  });
  it.each([
    { keys: "", value: "Empty key must not become always-on" },
    { keys: ["Ari"], value: "Wrong key type" },
    { keys: "Ari", value: 1 },
    { keys: "Ari", value: "{{char}}" },
    { keys: "/Ari/i", value: "Regex" },
    { keys: "Ari", value: "Something", customRule: true },
    null,
  ])("retains unsupported cards as dormant: %j", raw => {
    const book = importAIDungeon([raw], "cards.json");
    expect(book.entries[0]?.mode).toBe("dormant");
    expect(book.entries[0]?.raw).toEqual(raw);
  });
  it("imports the upstream OnlyWorlds fixture with stable IDs and named references, without expanding linked text", () => {
    const book = importOnlyWorlds(onlyFixture, "world.json");
    expect(book.origin?.worldId).toBe(onlyFixture.world.id);
    const pip = book.entries.find(e => e.entity?.name === "Pip")!;
    expect(pip.content).toContain("The Mill [01999999-0000-7000-8000-000000000002]");
    expect(pip.content).not.toContain("A stone keep on the hill.");
    expect(pip.entity?.links?.find(link => link.field === "location")?.id).toBe(onlyFixture.elements.location[1]!.id);
    expect(book.entries.find(e => e.entity?.name === "Mara")?.raw).toEqual(onlyFixture.elements.character[1]);
    expect(book.entries.every(e => e.mode === "keywords")).toBe(true);
    expect(book.entries[0]?.content).not.toContain("created_by");
  });
  it("keeps unknown/mismatched OnlyWorlds categories and duplicate identities dormant; labels unresolved links", () => {
    const raw = structuredClone(onlyFixture);
    raw.elements.character[0]!.location = "missing";
    raw.elements.character[1]!.id = raw.elements.character[0]!.id;
    const book = importOnlyWorlds(raw, "world.json");
    expect(book.entries.filter(e => e.entity?.kind === "character").every(e => e.mode === "dormant")).toBe(true);
    expect(book.entries[0]?.content).toContain("[unresolved: missing]");
    const unknown = importOnlyWorlds({ format: "onlyworlds-world-export", world: { id: "world", name: "Future" }, elements: { future: [{ id: "x", type: "future", name: "Thing" }], character: [{ id: "y", type: "location", name: "Wrong" }] } }, "world.json");
    expect(unknown.entries.every(e => e.mode === "dormant")).toBe(true);
    expect(() => importOnlyWorlds({ elements: {} }, "x")).toThrow(/Export world/);
  });
  it("imports named Azgaar data, handles sentinels and removed rows, and never invents a population count", () => {
    const book = importAzgaar(map, "Minimal.json");
    expect(book.name).toBe("North Reach");
    expect(book.entries).toHaveLength(5);
    const port = book.entries.find(e => e.title === "Port Dawn")!;
    expect(port.content).toContain("Kingdom of North [states:1]");
    expect(port.content).toContain("Source population value (unconverted): 2.5");
    expect(port.content).not.toContain("2500");
    expect(port.content).toContain("Map coordinates: 30, 40");
    expect(book.entries.find(e => e.title === "Lost")?.mode).toBe("dormant");
    expect(book.raw).toEqual(map);
    expect(() => importAzgaar({ info: map.info, cells: [] }, "cells.json")).toThrow(/Full or Minimal/);
    expect(() => importAzgaar({ type: "FeatureCollection", features: [] }, "geo.json")).toThrow(/Full or Minimal/);
  });
  it("limits inputs and offers explicit selection for an empty AI Dungeon export", () => {
    expect(importWorldData([], "empty.json", "ai-dungeon").entries).toEqual([]);
    expect(() => importWorldData([], "empty.json")).toThrow();
    expect(() => importAIDungeon(Array.from({ length: 5001 }, () => cards[0]), "large.json")).toThrow(/5,000/);
  });
});

describe("reviewed world materialization", () => {
  it("creates only approved, typed characters/places; preserves source IDs and lore-only topics", () => {
    const book = approve(importOnlyWorlds(onlyFixture, "world.json"));
    book.entries.find(e => e.entity?.name === "Mara")!.approved = false;
    const before = structuredClone(book);
    const result = materializeWorld(book);
    expect(book).toEqual(before);
    expect(result.characters.map(c => c.name)).toEqual(["Pip"]);
    expect(result.places.map(p => p.name)).toEqual(["The Keep", "The Mill"]);
    expect(result.places.every(p => p.realmId === result.realm.id)).toBe(true);
    expect(result.book.origin?.worldId).toBe(onlyFixture.world.id);
    expect(result.book.materializedCharacterIds).toEqual([result.characters[0]!.id]);
    expect(result.book.binding).toEqual({ kind: "realm", targetId: result.realm.id });
    expect(() => materializeWorld(result.book)).toThrow(/already/);
    expect(() => materializeWorld(importAIDungeon(cards, "x"))).toThrow(/Select at least/);
  });
  it("binds world lore by realm identity, isolates old snapshots, and does not establish a map through lore-only activation", () => {
    const result = materializeWorld(approve(importAIDungeon(cards, "x")));
    const session = quickCharacterSession(result.characters[0]!, "new", { place: result.places[0]!, realm: result.realm });
    const before = structuredClone(session);
    expect(attachLorebooks(session, [result.book], { realmId: "other" })).toEqual(session);
    const fresh = attachLorebooks(session, [result.book], { realmId: result.realm.id });
    expect(session).toEqual(before);
    expect(fresh.layers.filter(l => l.loreSource)).toHaveLength(2);
    fresh.conversation = [{ turn: 0, role: "player", content: "Ari at Starport" }];
    expect(buildLayerBlocks(fresh).filter(b => b.id.includes("imported-lore"))).toHaveLength(1); // The matching place brief is already present as native scene context.
    const generic = quickCharacterSession(newCharacterTemplate({ name: "Bea" }), "generic");
    const loreOnly = attachLorebooks(generic, [result.book], { realmId: result.realm.id });
    loreOnly.conversation = [{ turn: 0, role: "player", content: "Starport" }];
    expect(canonSettingText(loreOnly)).not.toContain("Starport");
    result.book.entries[0]!.content = "Changed later";
    expect(fresh.layers.some(l => l.content === "Changed later")).toBe(false);
  });
  it("saves a world atomically, refuses collisions, and round-trips its binding and source in library backups", async () => {
    const factory = new IDBFactory(), repo = new IndexedDBRepository(factory, "world-save");
    const result = materializeWorld(approve(importAIDungeon(cards, "cards.json")));
    await repo.savePlace(newPlaceTemplate({ ...result.places[0]!, name: "Existing place" }));
    await expect(repo.saveWorldImport(result)).rejects.toThrow();
    expect(await repo.listCharacters()).toHaveLength(0);
    expect((await repo.listLorebooks()).entries).toHaveLength(0);
    expect((await repo.listPlaces())[0]?.name).toBe("Existing place");
    const target = new IndexedDBRepository(factory, "world-target");
    await target.saveWorldImport(result);
    expect((await target.listCharacters())[0]?.name).toBe("Ari");
    expect((await target.listPlaces())[0]?.name).toBe("Starport");
    const backup = parseLibraryBackup(JSON.parse(JSON.stringify(await collectLibraryBackup(target))));
    const restored = new IndexedDBRepository(factory, "world-restored");
    expect((await restoreLibraryBackup(restored, backup.backup)).skipped).toBe(0);
    expect((await restored.listLorebooks()).entries[0]).toEqual(result.book);
    expect((await restored.listRealms()).some(r => r.id === result.realm.id)).toBe(true);
    await repo.close(); await target.close(); await restored.close();
  });
  it("refuses oversized native starting cards while still allowing optional lore storage", async () => {
    const book = approve(importAIDungeon([{ ...cards[0], value: "x".repeat(4001) }], "large.json"));
    expect(() => materializeWorld(book)).toThrow(/too long/);
    const repo = new IndexedDBRepository(new IDBFactory(), "large-world");
    await repo.saveLorebook(book);
    expect((await repo.listLorebooks()).entries[0]?.entries[0]?.content).toHaveLength(4001);
    await repo.close();
  });
});
