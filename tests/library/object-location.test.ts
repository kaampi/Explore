import { describe, expect, it } from "vitest";
import { effectiveObjectLocation, objectContents, validateObjectNesting, type ObjectLocation } from "@library/objectLocation";
import { newObjectTemplate, parseObjectTemplate } from "@library/LibrarySchema";

const item = (id: string, startingLocation?: ObjectLocation) => ({ id, ...(startingLocation ? { startingLocation } : {}) });

describe("nested objects", () => {
  it("inherits the outer container location through any number of levels", () => {
    const chest = item("chest", {kind: "place", placeId: "kitchen"});
    const bag = item("bag", {kind: "object", objectId: "chest"});
    const box = item("box", {kind: "object", objectId: "bag"});
    const gem = item("gem", {kind: "object", objectId: "box"});
    const objects = [chest, bag, box, gem];
    expect(effectiveObjectLocation(gem, objects)).toEqual({kind: "place", placeId: "kitchen"});
    bag.startingLocation = {kind: "player"};
    expect(effectiveObjectLocation(gem, objects)).toEqual({kind: "player"});
    expect(objectContents(objects, "chest")).toEqual([]);
    expect(objectContents(objects, "box")).toEqual([gem]);
  });
  it("rejects self containment, indirect cycles and missing parents", () => {
    const chest = item("chest");
    const box = item("box", {kind: "object", objectId: "chest"});
    const gem = item("gem", {kind: "object", objectId: "box"});
    expect(validateObjectNesting(item("chest", {kind: "object", objectId: "chest"}), [chest])).toBeTruthy();
    expect(validateObjectNesting(item("chest", {kind: "object", objectId: "gem"}), [chest, box, gem])).toBeTruthy();
    expect(validateObjectNesting(item("gem", {kind: "object", objectId: "missing"}), [])).toBeTruthy();
  });
  it("stores readable information separately from physical contents", () => {
    const book = newObjectTemplate({name: "Recipe book", note: "Leather bound", tags: [], source: "player",
      openable: true, readableContent: "A recipe for tea.", startingLocation: {kind: "object", objectId: "chest"}});
    expect(parseObjectTemplate(JSON.parse(JSON.stringify(book)))).toEqual(book);
    expect(objectContents([book], book.id)).toEqual([]);
  });
});
