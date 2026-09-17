import { describe, it, expect } from "vitest";
import { matchesCharacterShelf } from "@library/characterShelfFilter";

describe("matchesCharacterShelf", () => {
  const emma = { pronoun: "she", source: "example" as const, tags: [] };
  const marcus = { pronoun: "he", source: "player" as const, tags: [] };
  const importedShe = { pronoun: "she", source: "sillytavern" as const, tags: ["Imported"] };

  it("shows everyone when nothing is checked", () => {
    const off = { male: false, female: false, imported: false };
    expect(matchesCharacterShelf(emma, off)).toBe(true);
    expect(matchesCharacterShelf(marcus, off)).toBe(true);
    expect(matchesCharacterShelf(importedShe, off)).toBe(true);
  });

  it("keeps she when Female is checked", () => {
    const female = { male: false, female: true, imported: false };
    expect(matchesCharacterShelf(emma, female)).toBe(true);
    expect(matchesCharacterShelf(marcus, female)).toBe(false);
  });

  it("keeps imported she when Female and Imported are both checked", () => {
    const both = { male: false, female: true, imported: true };
    expect(matchesCharacterShelf(emma, both)).toBe(false);
    expect(matchesCharacterShelf(importedShe, both)).toBe(true);
    expect(matchesCharacterShelf({ pronoun: "he", source: "sillytavern" as const }, both)).toBe(false);
  });
});
