import { describe, expect, it } from "vitest";
import { importWorldData } from "../../src/lore/worldImports";
import { aventurasLibraryPreview } from "../../src/lore/aventurasLibrary";

const wrap = (entity: string, data: unknown) => ({ format: "aventuras-exchange", formatVersion: "1.0.0", entity, data });
function approve(book: ReturnType<typeof importWorldData>, indexes: number[]) {
  return { ...book, entries: book.entries.map((entry, i) => indexes.includes(i) ? { ...entry, approved: true } : entry) };
}
describe("Aventuras native library conversion", () => {
  it("requires review and preserves character identity, appearance and safe portrait", () => {
    const raw = wrap("character", { name: "Mira North", description: "Navigator", traits: ["curious"],
      visualDescriptors: { hairColor: "black" }, portrait: "data:image/png;base64,YWJj", tags: ["crew"] });
    const book = importWorldData(raw, "mira.json");
    expect(aventurasLibraryPreview(book).characters).toHaveLength(0);
    const converted = aventurasLibraryPreview(approve(book, [0]));
    expect(converted.characters[0]).toMatchObject({ name: "Mira", familyName: "North", appearance: "hair Color: black",
      portraitDataUrl: "data:image/png;base64,YWJj" });
    expect(converted.characters[0]?.tags).toContain("crew");
    expect(book.raw).toEqual(raw);
  });
  it("does not fetch external portraits", () => {
    const book = importWorldData(wrap("character", { name: "Mira", portrait: "https://example.org/p.png" }), "mira.json");
    const preview = aventurasLibraryPreview(approve(book, [0]));
    expect(preview.characters[0]?.portraitDataUrl).toBeUndefined();
    expect(preview.warnings.length).toBeGreaterThan(0);
  });
  it("converts only approved scenario and NPC entries", () => {
    const raw = wrap("scenario", { name: "Harbor", description: "A coastal town", firstMessage: "Do something",
      npcs: [{ name: "Captain", description: "A sailor" }] });
    const book = importWorldData(raw, "harbor.json");
    const preview = aventurasLibraryPreview(approve(book, [0]));
    expect(preview.stories).toHaveLength(1);
    expect(preview.characters).toHaveLength(0);
    expect(preview.stories[0]?.premise).toBe("A coastal town");
  });
  it("rejects malformed exchange versions", () => {
    expect(() => importWorldData({ ...wrap("character", { name: "Mira" }), formatVersion: "2.0.0" }, "bad.json")).toThrow();
  });
});
