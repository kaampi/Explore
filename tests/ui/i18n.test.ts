import { describe, expect, it } from "vitest";
import { allLabels, translate } from "../../src/ui/i18n/LanguageProvider";

const languages = Object.keys(allLabels) as (keyof typeof allLabels)[];
const keys = Object.keys(allLabels.en);
const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("the interface languages", () => {
  it("have the same texts in every language", () => {
    for (const language of languages)
      expect(Object.keys(allLabels[language]).sort(), language).toEqual([...keys].sort());
  });

  it("have no empty text", () => {
    for (const language of languages)
      for (const key of keys)
        expect(
          (allLabels[language] as Record<string, string>)[key]!.trim(),
          `${language}.${key}`,
        ).not.toBe("");
  });

  it("use the same placeholders in every language", () => {
    for (const key of keys) {
      const wanted = placeholders((allLabels.en as Record<string, string>)[key]!);
      for (const language of languages)
        expect(
          placeholders((allLabels[language] as Record<string, string>)[key]!),
          `${language}.${key}`,
        ).toEqual(wanted);
    }
  });

  it("do not leave English text in the Swedish or Norwegian lists for the start page, the world dialog and the play panel", () => {
    // Words that really are the same in Swedish or Norwegian as in English.
    const sameWord = new Set([
      "scene",
      "{count} scene",
      "test",
      "normal",
      "neutral",
      "intro",
      "min",
      "max",
      "text",
      "illustration",
      "fantasy",
      "sci-fi",
      "data",
      "ammunition",
    ]);
    const added = keys.slice(keys.indexOf("voiceInstructionPlaceholder") + 1);

    expect(added.length).toBeGreaterThan(40);
    for (const key of added)
      for (const language of ["sv", "nb"] as const) {
        if (sameWord.has(((allLabels.en as Record<string, string>)[key] ?? "").toLowerCase()))
          continue;
        expect((allLabels[language] as Record<string, string>)[key], `${language}.${key}`).not.toBe(
          (allLabels.en as Record<string, string>)[key],
        );
      }
  });

  it("do not leave English text in the Swedish or Norwegian lists for the new picture texts", () => {
    for (const key of ["showPictureArchive", "pictureArchive", "noPicturesYet"] as const) {
      expect(allLabels.sv[key]).not.toBe(allLabels.en[key]);
      expect(allLabels.nb[key]).not.toBe(allLabels.en[key]);
    }
  });
});

describe("translate", () => {
  it("fills in placeholders", () => {
    expect(translate("en", "showingPictures", { count: 12 })).toBe("Showing 3 of 12 pictures");
    expect(translate("sv", "showingPictures", { count: 12 })).toBe("Visar 3 av 12 bilder");
    expect(translate("nb", "showingPictures", { count: 12 })).toBe("Viser 3 av 12 bilder");
  });

  it("leaves a placeholder alone when no value is given", () => {
    expect(translate("en", "showingPictures")).toBe("Showing 3 of {count} pictures");
  });

  it("does not treat dollar signs or braces in a value as special", () => {
    expect(translate("en", "showingPictures", { count: "$& {count}" })).toBe(
      "Showing 3 of $& {count} pictures",
    );
  });
});
