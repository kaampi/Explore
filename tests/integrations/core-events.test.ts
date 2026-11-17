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

import { addEventDrafts, MAX_EVENTS_PER_IMPORT } from "../../src/integrations/coreEvents";
import { newCampaignTemplate, emptyCampaignScene } from "../../src/library/LibrarySchema";

describe("adding drafts to an adventure", () => {
  const events = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      event(`Event ${i + 1}`, [["What", `Thing ${i + 1}`]], `ev-${i + 1}`),
    );
  const all = (list: CoreBibleEntity[]) => new Set(list.map((e) => e.entity_ref));
  const add = (
    campaign: ReturnType<typeof newCampaignTemplate>,
    list: CoreBibleEntity[],
    chosen = all(list),
  ) =>
    addEventDrafts({
      campaign,
      title: "Night Keys",
      events: list,
      chosen,
      source,
      library: library(),
    });

  it("puts them last in manuscript order, in an act named after the manuscript, and changes nothing already there", () => {
    const first = { ...emptyCampaignScene(), name: "Opening", position: { x: 0, y: 40 } };
    const campaign = newCampaignTemplate({ name: "Mine", scenes: [first] });
    const before = structuredClone(campaign);
    const list = events(3);

    const result = add(campaign, list);

    expect(result.added).toBe(3);
    expect(result.campaign.scenes.map((s) => s.name)).toEqual([
      "Opening",
      "Event 1",
      "Event 2",
      "Event 3",
    ]);
    expect(result.campaign.scenes[0]).toEqual(before.scenes[0]);
    const act = result.campaign.storyboardSections!.find((c) => c.title === "Night Keys")!;
    expect(act.kind).toBe("act");
    expect(result.campaign.scenes.slice(1).every((s) => s.storyboardSectionId === act.id)).toBe(
      true,
    );
    expect(result.campaign.scenes[1]!.position!.y).toBeGreaterThan(40);
    expect(campaign).toEqual(before);
  });

  it("takes only the chosen events, and none when none are chosen", () => {
    const campaign = newCampaignTemplate({ name: "Mine" });
    const list = events(3);

    const some = add(campaign, list, new Set(["ev-2"]));
    const none = add(campaign, list, new Set());

    expect(some.campaign.scenes.map((s) => s.name)).toEqual(["Event 2"]);
    expect(none.added).toBe(0);
    expect(none.campaign).toBe(campaign);
  });

  it("skips an event that already has a draft here, and says so, so the same import twice gives one draft each", () => {
    const campaign = newCampaignTemplate({ name: "Mine" });
    const list = events(2);

    const once = add(campaign, list);
    const twice = add(once.campaign, list);

    expect(twice.added).toBe(0);
    expect(twice.alreadyThere).toEqual(["Event 1", "Event 2"]);
    expect(twice.campaign.scenes).toHaveLength(2);
    expect(twice.campaign.storyboardSections).toHaveLength(1);
  });

  it("adds a later event to the same act", () => {
    const campaign = newCampaignTemplate({ name: "Mine" });
    const list = events(3);
    const once = add(campaign, list, new Set(["ev-1"]));

    const more = add(once.campaign, list, new Set(["ev-1", "ev-3"]));

    expect(more.added).toBe(1);
    expect(more.alreadyThere).toEqual(["Event 1"]);
    expect(more.campaign.storyboardSections).toHaveLength(1);
    expect(more.campaign.scenes.map((s) => s.name)).toEqual(["Event 1", "Event 3"]);
  });

  it("takes at most 100 events at a time, and says how many were left out", () => {
    const campaign = newCampaignTemplate({ name: "Mine" });
    const list = events(MAX_EVENTS_PER_IMPORT + 7);

    const result = add(campaign, list);

    expect(result.added).toBe(MAX_EVENTS_PER_IMPORT);
    expect(result.clipped).toBe(7);
  });

  it("gives drafts that pass the checks of a blank scene: they are not playable and not older content", () => {
    const campaign = newCampaignTemplate({ name: "Mine" });

    const result = add(campaign, events(1));

    expect(sceneFormat(result.campaign.scenes[0]!)).toBe("blank");
  });
});
