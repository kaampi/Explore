import { describe, expect, it } from "vitest";
import { draftFromEvent, mentions, MAX_DRAFT_FACTS } from "../../src/integrations/coreEvents";
import type { CoreBibleEntity } from "../../src/integrations/coreBibleSchema";
import { sceneFormat } from "../../src/library/sceneFormat";
import {
  CampaignSceneSchema,
  newCharacterTemplate,
  newObjectTemplate,
  newPlaceTemplate,
} from "../../src/library/LibrarySchema";

const source = { workspaceId: "w1", projectId: "p1", revision: 4 };
const here = { workspaceId: "w1", projectId: "p1", entityRef: "x", revision: 1 };
const other = { workspaceId: "w2", projectId: "p9", entityRef: "x", revision: 1 };

const event = (name: string, facts: [string, string][], ref = "ev-1"): CoreBibleEntity => ({
  entity_ref: ref,
  name,
  facts: facts.map(([label, value]) => ({ predicate: label.toLowerCase(), label, value })),
  referenceImages: [],
});
const person = (name: string, origin: typeof here | null = here) =>
  newCharacterTemplate({ name, ...(origin ? { coreOrigin: origin } : {}) });
const place = (name: string, origin: typeof here | null = here) =>
  newPlaceTemplate({ name, ...(origin ? { coreOrigin: origin } : {}) });
const thing = (name: string, origin: typeof here | null = here) =>
  newObjectTemplate({
    name,
    note: "",
    tags: [],
    source: "player",
    ...(origin ? { coreOrigin: origin } : {}),
  });
const library = (extra: Partial<Parameters<typeof draftFromEvent>[2]> = {}) => ({
  characters: [],
  places: [],
  objects: [],
  ...extra,
});

describe("a scene draft from a manuscript event", () => {
  it("has the event's name, what it says and where it came from, and no game content", () => {
    const scene = draftFromEvent(
      event("The Flood", [
        ["When", "Spring, the year of the flood"],
        ["Empty", "  "],
      ]),
      source,
      library(),
    );

    expect(scene.name).toBe("The Flood");
    expect(scene.draft!.origin).toEqual({ ...source, entityRef: "ev-1" });
    expect(scene.draft!.facts).toEqual([{ label: "When", value: "Spring, the year of the flood" }]);
    expect(scene.encounter).toBeUndefined();
    expect(scene.people).toEqual([]);
    expect(scene.objectIds).toEqual([]);
    expect(scene.placeId).toBe("");
    expect(sceneFormat(scene)).toBe("blank");
  });

  it("matches cards by whole words, in any capitals, in the name or in what it says", () => {
    const edda = person("Edda");
    const square = place("The village square");
    const key = thing("Brass key");
    const scene = draftFromEvent(
      event("EDDA waits", [
        ["Where", "At the village square."],
        ["What", "She holds a brass key."],
      ]),
      source,
      library({ characters: [edda], places: [square], objects: [key] }),
    );

    expect(scene.draft!.suggestedCharacterIds).toEqual([edda.id]);
    expect(scene.draft!.suggestedPlaceId).toBe(square.id);
    expect(scene.draft!.suggestedObjectIds).toEqual([key.id]);
  });

  it("does not match part of a word", () => {
    expect(mentions("A teddy bear", "Edda")).toBe(false);
    expect(mentions("Edda's coat", "Edda")).toBe(true);
    expect(mentions("Åsa talks", "Åsa")).toBe(true);
    expect(mentions("Nothing", "")).toBe(false);
    const scene = draftFromEvent(
      event("A teddy", []),
      source,
      library({ characters: [person("Edda")] }),
    );
    expect(scene.draft!.suggestedCharacterIds).toEqual([]);
  });

  it("matches a first name alone when it is at least three letters and unique, not otherwise", () => {
    const anna = person("Anna Berg");
    const annaToo = person("Anna Lind");
    const jo = person("Jo Park");
    const sven = person("Sven Ek");

    const scene = draftFromEvent(
      event("Anna, Jo and Sven meet", []),
      source,
      library({ characters: [anna, annaToo, jo, sven] }),
    );

    expect(scene.draft!.suggestedCharacterIds).toEqual([sven.id]);
  });

  it("never suggests a card from another manuscript, or one with no origin", () => {
    const scene = draftFromEvent(
      event("Edda at the mill", []),
      source,
      library({
        characters: [person("Edda", other), person("Edda", null)],
        places: [place("mill", other)],
        objects: [thing("Edda", other)],
      }),
    );

    expect(scene.draft!.suggestedCharacterIds).toEqual([]);
    expect(scene.draft!.suggestedPlaceId).toBeUndefined();
    expect(scene.draft!.suggestedObjectIds).toEqual([]);
  });

  it("suggests no place when two match, and lists both", () => {
    const mill = place("The mill");
    const square = place("The square");

    const scene = draftFromEvent(
      event("Between the mill and the square", []),
      source,
      library({ places: [mill, square] }),
    );

    expect(scene.draft!.suggestedPlaceId).toBeUndefined();
    expect(scene.draft!.otherPlaceIds.sort()).toEqual([mill.id, square.id].sort());
  });

  it("cuts a long list of facts and long texts to the limits, and the result is a valid scene", () => {
    const facts: [string, string][] = Array.from({ length: 60 }, (_, i) => [
      `L${i}`.repeat(100),
      "v".repeat(3000),
    ]);

    const scene = draftFromEvent(event("Many", facts), source, library());

    expect(scene.draft!.facts).toHaveLength(MAX_DRAFT_FACTS);
    expect(scene.draft!.facts[0]!.label).toHaveLength(120);
    expect(scene.draft!.facts[0]!.value).toHaveLength(2000);
    expect(() => CampaignSceneSchema.parse(scene)).not.toThrow();
  });

  it("opens an older scene that has no draft as before", () => {
    const old = { id: "s1", name: "Old" };

    expect(CampaignSceneSchema.parse(old)).toMatchObject({ id: "s1", name: "Old" });
    expect((CampaignSceneSchema.parse(old) as { draft?: unknown }).draft).toBeUndefined();
  });
});
