import { describe, expect, it } from "vitest";
import {
  importManuscriptBatch,
  importableEntries,
  type BatchLibrary,
} from "../../src/integrations/coreBatch";
import type { CoreBibleSection } from "../../src/integrations/coreBibleSchema";
import { copyCoreCharacter } from "../../src/integrations/coreBible";
import { copyCoreEntity } from "../../src/integrations/coreEntities";

const source = { workspaceId: "w1", projectId: "p1", revision: 2 };
const person = (ref: string, name: string) => ({
  entity_ref: ref,
  name,
  personality: "Curious",
  looks: "Dark coat",
  referenceImages: [],
  facts: [],
});
const thing = (ref: string, name: string) => ({
  entity_ref: ref,
  name,
  looks: "Plain.",
  referenceImages: [],
  facts: [{ predicate: "p", label: "Note", value: "Odd" }],
});
const bible: CoreBibleSection[] = [
  {
    kind: "characters",
    label: "Characters",
    entities: [person("emma", "Emma"), person("ben", "Ben")],
  },
  { kind: "locations", label: "Locations", entities: [thing("mill", "The Old Mill")] },
  { kind: "objects", label: "Objects", entities: [thing("key", "Brass key")] },
  { kind: "groups", label: "Groups", entities: [thing("guild", "Millers' Guild")] },
  { kind: "events", label: "Events", entities: [thing("flood", "The flood")] },
  { kind: "concepts", label: "Concepts", entities: [thing("fate", "Fate")] },
];
const empty: BatchLibrary = { realms: [], characters: [], places: [], objects: [], factions: [] };
const all = new Set(importableEntries(bible).map((e) => e.key));

const run = (chosen: ReadonlySet<string>, library: BatchLibrary = empty) =>
  importManuscriptBatch({ title: "Night Keys", bible, source, chosen, library });

describe("creating a world from a manuscript", () => {
  it("offers characters, places, things and factions, and not events or concepts", () => {
    expect(importableEntries(bible).map((e) => e.kind)).toEqual([
      "characters",
      "characters",
      "locations",
      "objects",
      "groups",
    ]);
  });

  it("copies everything chosen in one go, into a new world named after the manuscript", () => {
    const result = run(all);

    expect(result.realmIsNew).toBe(true);
    expect(result.realm.name).toBe("Night Keys");
    expect(result.characters.map((c) => c.name)).toEqual(["Emma", "Ben"]);
    expect(result.places.map((p) => p.name)).toEqual(["The Old Mill"]);
    expect(result.places[0]!.realmId).toBe(result.realm.id);
    expect(result.objects.map((o) => o.name)).toEqual(["Brass key"]);
    expect(result.factions.map((f) => f.name)).toEqual(["Millers' Guild"]);
    expect(result.alreadyThere).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it("copies only what is chosen, and still makes the world", () => {
    const result = run(new Set(["objects:key"]));

    expect(result.objects).toHaveLength(1);
    expect(result.characters).toEqual([]);
    expect(result.places).toEqual([]);
    expect(result.realm.name).toBe("Night Keys");
  });

  it("leaves alone what was copied before, and says so", () => {
    const emma = copyCoreCharacter(bible[0]!.entities[0]!, source);
    const mill = copyCoreEntity("locations", bible[1]!.entities[0]!, source, { realmId: "r" });

    const result = run(all, { ...empty, characters: [emma], places: [mill] });

    expect(result.characters.map((c) => c.name)).toEqual(["Ben"]);
    expect(result.places).toEqual([]);
    expect(result.alreadyThere.sort()).toEqual(["Emma", "The Old Mill"]);
  });

  it("puts a second import into the same world as the first", () => {
    const first = run(new Set(["objects:key"]));

    const second = run(new Set(["locations:mill"]), { ...empty, realms: [first.realm] });

    expect(second.realmIsNew).toBe(false);
    expect(second.realm.id).toBe(first.realm.id);
    expect(second.places[0]!.realmId).toBe(first.realm.id);
  });

  it("does not stop at an entry that cannot be copied, and names it", () => {
    const broken: CoreBibleSection[] = [
      {
        kind: "objects",
        label: "Objects",
        entities: [thing("a", "  "), thing("b", "Fine thing")],
      },
    ];

    const result = importManuscriptBatch({
      title: "T",
      bible: broken,
      source,
      chosen: new Set(["objects:a", "objects:b"]),
      library: empty,
    });

    expect(result.objects.map((o) => o.name)).toEqual(["Fine thing"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.reason).toMatch(/no usable identity/);
  });

  it("gives every copy its own id and where it came from, never the manuscript's", () => {
    const result = run(all);

    const ids = [
      ...result.characters.map((c) => c.id),
      ...result.places.map((c) => c.id),
      ...result.objects.map((c) => c.id),
      ...result.factions.map((c) => c.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("emma");
    expect(result.places[0]!.coreOrigin).toEqual({ ...source, entityRef: "mill" });
  });
});
