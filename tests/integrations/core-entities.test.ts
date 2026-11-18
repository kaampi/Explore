import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  applyCoreEntityChanges,
  copyCoreEntity,
  reviewCoreEntity,
  sameCoreEntity,
  snapshotCoreEntity,
  type CoreEntityKind,
} from "../../src/integrations/coreEntities";
import type { CoreBibleEntity } from "../../src/integrations/coreBibleSchema";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";

const source = { workspaceId: "w1", projectId: "p1", revision: 3 };
const entity = (extra: Partial<CoreBibleEntity> = {}): CoreBibleEntity => ({
  entity_ref: "ref-1",
  name: "The Old Mill",
  looks: "A leaning mill by a slow river.",
  facts: [
    { predicate: "built", label: "Built", value: "In the year of the flood" },
    { predicate: "empty", label: "Blank", value: "  " },
  ],
  referenceImages: [],
  ...extra,
});
const kinds: CoreEntityKind[] = ["locations", "objects", "groups"];
const textOf = (card: object, kind: CoreEntityKind) =>
  (card as Record<string, string>)[kind === "groups" ? "description" : "note"];

describe("copying a place, a thing or a faction from a manuscript", () => {
  it.each(kinds)("makes a new card of its own with where it came from (%s)", (kind) => {
    const card = copyCoreEntity(kind, entity(), source, { realmId: "realm-1" });

    expect(card.id).not.toBe("ref-1");
    expect(card.name).toBe("The Old Mill");
    expect(textOf(card, kind)).toBe(
      "A leaning mill by a slow river.\nBuilt: In the year of the flood",
    );
    expect(card.coreOrigin).toEqual({ ...source, entityRef: "ref-1" });
    expect(card.coreSnapshot).toEqual({
      name: "The Old Mill",
      text: "A leaning mill by a slow river.\nBuilt: In the year of the flood",
    });
  });

  it("puts a place in the world it is given", () => {
    const place = copyCoreEntity("locations", entity(), source, { realmId: "realm-1" });

    expect(place.realmId).toBe("realm-1");
  });

  it.each(kinds)("refuses one with no name or no identity (%s)", (kind) => {
    expect(() => copyCoreEntity(kind, entity({ name: "  " }), source)).toThrow(
      /no usable identity/,
    );
    expect(() => copyCoreEntity(kind, entity({ entity_ref: " " }), source)).toThrow(
      /no usable identity/,
    );
  });

  it("leaves a thing with no look or facts with an empty text", () => {
    expect(snapshotCoreEntity(entity({ looks: undefined, facts: [] }))).toEqual({
      name: "The Old Mill",
      text: "",
    });
  });
});

describe("reviewing an update", () => {
  const copied = (kind: CoreEntityKind) => copyCoreEntity(kind, entity(), source, { realmId: "r" });

  it.each(kinds)("finds nothing when nothing changed (%s)", (kind) => {
    const card = copied(kind);

    expect(reviewCoreEntity(card, kind, card.coreSnapshot!, entity())).toEqual([]);
  });

  it.each(kinds)("shows what changed, and flags a card edited here (%s)", (kind) => {
    const card = copied(kind);
    const edited = { ...card, name: "Brightwater Mill" };
    const incoming = entity({ name: "The Ruined Mill", looks: "A burnt-out mill." });

    const changes = reviewCoreEntity(edited, kind, card.coreSnapshot!, incoming);

    const name = changes.find((c) => c.key === "name")!;
    expect(name).toMatchObject({
      previous: "The Old Mill",
      incoming: "The Ruined Mill",
      local: "Brightwater Mill",
      conflict: true,
    });
    const text = changes.find((c) => c.key === "text")!;
    expect(text.conflict).toBe(false);
    expect(text.incoming).toContain("A burnt-out mill.");
  });

  it("does not call it a conflict when the local card already says the new thing", () => {
    const card = copied("objects");
    const incoming = entity({ name: "The Ruined Mill" });
    const edited = { ...card, name: "The Ruined Mill" };

    const change = reviewCoreEntity(edited, "objects", card.coreSnapshot!, incoming).find(
      (c) => c.key === "name",
    )!;

    expect(change.conflict).toBe(false);
  });
});

describe("applying an update", () => {
  it.each(kinds)("changes only the approved parts and keeps what the author did (%s)", (kind) => {
    const card = copyCoreEntity(kind, entity(), source, { realmId: "r" });
    const mine = { ...card, ...(kind === "groups" ? { history: "My notes" } : { tags: ["mine"] }) };
    const incoming = entity({ name: "The Ruined Mill", looks: "A burnt-out mill." });
    const newer = { ...source, revision: 4, entityRef: "ref-1" };

    const updated = applyCoreEntityChanges(mine, kind, incoming, ["name"], newer);

    expect(updated.name).toBe("The Ruined Mill");
    expect(textOf(updated, kind)).toBe(textOf(card, kind));
    expect(updated.id).toBe(card.id);
    expect(updated.coreOrigin!.revision).toBe(4);
    expect(updated.coreSnapshot!.name).toBe("The Ruined Mill");
    expect(updated.coreSnapshot!.text).toBe(card.coreSnapshot!.text);
    expect((updated as Record<string, unknown>)[kind === "groups" ? "history" : "tags"]).toEqual(
      kind === "groups" ? "My notes" : ["mine"],
    );
  });

  it("keeps a declined change reviewable, and refuses an older version or another identity", () => {
    const card = copyCoreEntity("objects", entity(), source);
    const incoming = entity({ looks: "Burnt." });

    const updated = applyCoreEntityChanges(card, "objects", incoming, [], {
      ...source,
      revision: 4,
      entityRef: "ref-1",
    });
    expect(
      reviewCoreEntity(updated, "objects", updated.coreSnapshot!, incoming).some(
        (c) => c.key === "text",
      ),
    ).toBe(true);

    expect(() =>
      applyCoreEntityChanges(card, "objects", incoming, ["text"], {
        ...source,
        revision: 2,
        entityRef: "ref-1",
      }),
    ).toThrow(/older/);
    expect(() =>
      applyCoreEntityChanges(card, "objects", entity({ entity_ref: "other" }), ["text"], {
        ...source,
        entityRef: "other",
      }),
    ).toThrow(/identity mismatch/);
    expect(sameCoreEntity(card, { ...source, entityRef: "ref-1" })).toBe(true);
    expect(sameCoreEntity(card, { ...source, entityRef: "ref-2" })).toBe(false);
  });
});

describe("saved cards keep where they came from", () => {
  it("through the library", async () => {
    const repo = new IndexedDBRepository(new IDBFactory(), "core-entities");
    const place = copyCoreEntity("locations", entity(), source, { realmId: "r" });
    const thing = copyCoreEntity("objects", entity(), source);
    const faction = copyCoreEntity("groups", entity(), source);

    await repo.savePlace(place);
    await repo.saveObject(thing);
    await repo.saveFaction(faction);

    expect((await repo.listPlaces()).find((p) => p.id === place.id)!.coreOrigin?.entityRef).toBe(
      "ref-1",
    );
    expect((await repo.listObjects()).find((p) => p.id === thing.id)!.coreSnapshot?.name).toBe(
      "The Old Mill",
    );
    expect(
      (await repo.listFactions()).find((p) => p.id === faction.id)!.coreOrigin?.workspaceId,
    ).toBe("w1");
  });
});
