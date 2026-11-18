import { describe, expect, it } from "vitest";
import { exampleRulesetTemplates } from "../../src/library/exampleTemplates";
import { EXAMPLE_RULESET_TEXTS } from "../../src/library/exampleRulesetTexts";
import { skillIdFor } from "../../src/library/sceneSync";
import { RulesetTemplateSchema } from "../../src/library/LibrarySchema";

const english = exampleRulesetTemplates();

describe("the rule-sets that come with the app", () => {
  it("has fantasy, trust, sci-fi, noir, horror, cozy, romance and reality", () => {
    expect(english.map((set) => set.name)).toEqual([
      "Classic fantasy",
      "Trust",
      "Sci-fi",
      "Noir",
      "Horror",
      "Cozy",
      "Romance",
      "Reality",
    ]);
    for (const set of english) expect(RulesetTemplateSchema.safeParse(set).success).toBe(true);
  });

  it("gives the genre sets values from 0 to 100, so a value is the chance of success", () => {
    for (const set of english.filter((item) => !["Classic fantasy", "Trust"].includes(item.name))) {
      for (const value of set.attributes) {
        expect([value.min, value.max], `${set.name} ${value.id}`).toEqual([0, 100]);
        expect(value.highMeaning.length, `${set.name} ${value.id}`).toBeGreaterThan(10);
        expect(value.lowMeaning.length, `${set.name} ${value.id}`).toBeGreaterThan(10);
      }
    }
  });

  it("gives every set with fights a Melee skill, so a weapon card finds it", () => {
    for (const name of ["Classic fantasy", "Sci-fi", "Noir", "Horror", "Reality"]) {
      const set = english.find((item) => item.name === name)!;
      expect(
        set.attributes.some((a) => a.id === "melee"),
        name,
      ).toBe(true);
    }
    for (const name of ["Cozy", "Romance"]) {
      const set = english.find((item) => item.name === name)!;
      expect(
        set.attributes.some((a) => a.id === "melee"),
        name,
      ).toBe(false);
    }
  });

  it("lets one value of Horror, Sanity, move with events, and no other", () => {
    const horror = english.find((set) => set.name === "Horror")!;
    expect(horror.attributes.filter((a) => a.maxShift > 0).map((a) => a.id)).toEqual(["sanity"]);
  });

  it("ships a picture where one was made", () => {
    expect(english.filter((set) => set.image).map((set) => set.name)).toEqual([
      "Classic fantasy",
      "Sci-fi",
      "Noir",
      "Horror",
      "Reality",
    ]);
  });

  for (const language of ["sv", "nb"] as const) {
    it(`is translated into ${language}: every set and every value, in the same order`, () => {
      const translated = exampleRulesetTemplates(language);
      expect(translated.map((set) => set.id)).toEqual(english.map((set) => set.id));
      for (const [index, set] of translated.entries()) {
        const base = english[index]!;
        const text = EXAMPLE_RULESET_TEXTS[language][set.id]!;
        expect(text, set.id).toBeDefined();
        expect(text.values, set.id).toHaveLength(base.attributes.length);
        expect(set.attributes.map((a) => a.id)).toEqual(base.attributes.map((a) => a.id));
        for (const value of set.attributes) {
          expect(value.name.trim(), `${set.id} ${value.id}`).not.toBe("");
          expect(value.highMeaning.trim(), `${set.id} ${value.id}`).not.toBe("");
          expect(value.lowMeaning.trim(), `${set.id} ${value.id}`).not.toBe("");
        }
        // Scales, ids and the rest are the same whatever the language.
        expect(set.attributes.map((a) => [a.min, a.max, a.maxShift, a.role])).toEqual(
          base.attributes.map((a) => [a.min, a.max, a.maxShift, a.role]),
        );
        expect(set.playerHealth).toBe(base.playerHealth);
        expect(set.image).toBe(base.image);
      }
    });

    it(`does not leave the ${language} meanings in English`, () => {
      const translated = exampleRulesetTemplates(language);
      const same: string[] = [];
      for (const [index, set] of translated.entries())
        for (const [i, value] of set.attributes.entries()) {
          const base = english[index]!.attributes[i]!;
          if (value.highMeaning === base.highMeaning || value.lowMeaning === base.lowMeaning)
            same.push(`${set.id} ${value.id}`);
        }
      expect(same).toEqual([]);
    });
  }

  it("lets a weapon card that says Melee find the skill whatever it is called", () => {
    for (const language of ["en", "sv", "nb"] as const) {
      const sets = exampleRulesetTemplates(language);
      for (const set of sets.filter((item) => item.attributes.some((a) => a.id === "melee"))) {
        const scales = set.attributes.map((a) => ({ id: a.id, name: a.name }));
        expect(skillIdFor("Melee", { scales }), `${language} ${set.id}`).toBe("melee");
      }
    }
  });
});
