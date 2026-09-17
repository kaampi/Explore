import { describe, it, expect } from "vitest";
import { formatTagList, newObjectTemplate, parseTagList } from "@library/LibrarySchema";
import { exampleLightsaberObject, exampleRingObject } from "@library/exampleTemplates";
import {
  OBJECT_FILTER_ALL,
  OBJECT_FILTER_PLACE,
  OBJECT_FILTER_STORY,
  OBJECT_FILTER_UNSORTED,
  matchesTagFilter,
  objectMatchesFilter,
  uniqueObjectTags,
  uniqueTags
} from "@library/objectFilter";

describe("object templates", () => {
  it("parses tags and optional check fields", () => {
    const template = newObjectTemplate({
      name: "Guest-house key",
      note: "Unlocks the guest room upstairs.",
      tags: parseTagList("Fantasy, key, Fantasy"),
      weight: 0,
      source: "player"
    });
    expect(template.tags).toEqual(["Fantasy", "key"]);
    expect(formatTagList(template.tags)).toBe("Fantasy, key");
  });

  it("ships a fantasy ring and a scifi blade so the shelf can be filtered", () => {
    expect(exampleRingObject().tags).toContain("Fantasy");
    expect(exampleLightsaberObject().tags).toContain("scifi");
  });
});

describe("objectMatchesFilter", () => {
  const ring = exampleRingObject();
  const saber = exampleLightsaberObject();

  it("lets All through and Fantasy hide the lightsaber", () => {
    expect(objectMatchesFilter(ring, OBJECT_FILTER_ALL)).toBe(true);
    expect(objectMatchesFilter(saber, "Fantasy")).toBe(false);
    expect(objectMatchesFilter(ring, "fantasy")).toBe(true);
  });

  it("treats unsorted as no tags", () => {
    const loose = { ...saber, tags: [] };
    expect(objectMatchesFilter(loose, OBJECT_FILTER_UNSORTED)).toBe(true);
    expect(objectMatchesFilter(ring, OBJECT_FILTER_UNSORTED)).toBe(false);
  });

  it("can filter to the selected story or place without locking the pick", () => {
    const bound = { ...ring, storyId: "st1", placeId: "p1" };
    expect(objectMatchesFilter(bound, OBJECT_FILTER_STORY, { storyId: "st1" })).toBe(true);
    expect(objectMatchesFilter(bound, OBJECT_FILTER_STORY, { storyId: "other" })).toBe(false);
    expect(objectMatchesFilter(bound, OBJECT_FILTER_PLACE, { placeId: "p1" })).toBe(true);
  });

  it("collects unique tags with first casing", () => {
    expect(uniqueObjectTags([ring, saber, { tags: ["fantasy"] }])).toEqual(["Fantasy", "relic", "scifi", "weapon"]);
  });
});

describe("matchesTagFilter", () => {
  it("filters characters and places the same way as objects", () => {
    const emma = { tags: [] as string[] };
    const pierre = { tags: ["Noir", "bar"] };
    expect(matchesTagFilter(emma, OBJECT_FILTER_UNSORTED)).toBe(true);
    expect(matchesTagFilter(pierre, "noir")).toBe(true);
    expect(matchesTagFilter(emma, "Noir")).toBe(false);
    expect(uniqueTags([emma, pierre, { tags: ["Fantasy"] }])).toEqual(["bar", "Fantasy", "Noir"]);
  });

  it("treats SillyTavern cards as Imported even if the tag field is empty", () => {
    const rachel = { tags: [] as string[], source: "sillytavern" as const };
    expect(matchesTagFilter(rachel, "Imported")).toBe(true);
    expect(matchesTagFilter(rachel, OBJECT_FILTER_UNSORTED)).toBe(false);
    expect(uniqueTags([rachel])).toEqual(["Imported"]);
  });
});
