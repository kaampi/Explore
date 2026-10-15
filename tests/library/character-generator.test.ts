import { describe, expect, it } from "vitest";
import { CharacterTemplateSchema } from "@library/LibrarySchema";
import { characterTemplateFromGenerated, generateCharacter } from "@library/characterGenerator";

describe("generateCharacter", () => {
  it("fills a saveable archive card when the brief is empty", () => {
    const card = generateCharacter({ brief: "", seed: 7 });
    const saved = characterTemplateFromGenerated(card, "gen-empty");
    expect(CharacterTemplateSchema.parse(saved).id).toBe("gen-empty");
    expect(card.name.length).toBeGreaterThan(1);
    expect(card.familyName.length).toBeGreaterThan(1);
    expect(card.approximateAge).toBeGreaterThanOrEqual(22);
    expect(card.approximateAge).toBeLessThanOrEqual(58);
    expect(["she", "he"]).toContain(card.pronoun);
    expect(card.mood.split(/\s+/).length).toBeLessThanOrEqual(2);
    expect(card.personality.split(/(?<=[.!?])\s+/).length).toBe(3);
    expect(card.appearance).not.toMatch(/jacket|apron|dress|kink|sister|brother/i);
  });

  it("repeats the same card for the same seed and brief", () => {
    const first = generateCharacter({ brief: "a wary bartender", seed: 3 });
    const second = generateCharacter({ brief: "a wary bartender", seed: 3 });
    expect(second).toEqual(first);
  });

  it("rolls a different person when the seed changes", () => {
    const first = generateCharacter({ brief: "", seed: 1 });
    const second = generateCharacter({ brief: "", seed: 2 });
    expect(`${first.name} ${first.familyName} ${first.appearance}`).not.toBe(
      `${second.name} ${second.familyName} ${second.appearance}`
    );
  });

  it("keeps an explicit pronoun and age, and files the job as a tag", () => {
    const card = generateCharacter({
      brief: "A wary night bartender who notices everything",
      pronoun: "she",
      approximateAge: 41,
      seed: 11
    });
    expect(card.pronoun).toBe("she");
    expect(card.approximateAge).toBe(41);
    expect(card.mood).toBe("wary");
    expect(card.tags).toContain("bartender");
    expect(card.personality).toMatch(/Notices what changed/);
    expect(card.personality).not.toMatch(/bartender|night/i);
    expect(card.appearance).not.toMatch(/apron|jacket|night/i);
  });

  it("reads Swedish cues without copying clothes or a kink into the card", () => {
    const card = generateCharacter({
      brief: "hon, 34, vaksam bartender med rött hår, wears a leather jacket, kink",
      seed: 4
    });
    expect(card.pronoun).toBe("she");
    expect(card.approximateAge).toBe(34);
    expect(card.mood).toBe("wary");
    expect(card.tags).toContain("bartender");
    expect(card.appearance).toMatch(/auburn hair/i);
    expect(`${card.appearance} ${card.personality} ${card.mood}`).not.toMatch(/jacket|kink/i);
  });

  it("lets the sheet's pronoun win over the brief", () => {
    const card = generateCharacter({ brief: "he is a stern soldier", pronoun: "they", seed: 9 });
    expect(card.pronoun).toBe("they");
    expect(card.mood).toBe("stern");
    expect(card.tags).toContain("soldier");
    expect(card.personality).toMatch(/^(\S+) is /);
    expect(card.personality).toMatch(/Words are few/);
  });
});
