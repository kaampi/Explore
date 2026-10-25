import { describe, it, expect } from "vitest";
import { ageFromField, ageFromText, pronounFromText, wPlusPlusFields } from "@library/cardHints";

describe("cardHints", () => {
  it("reads parenthesized fields with nesting and multiple lines without absorbing neighbours", () => {
    const fields = wPlusPlusFields(`[Character(Alice)
{
Sex(Female)
Age(18)
Appearance(Black hair + red eyes)
Dislikes(bullying (but does it anyway) + bugs)
Personality(Quiet on her own.
She is kind (when she feels safe).
Age(99) is a line in a book she reads.)
Scenario(A school hallway.)
}]`);
    expect(fields.character).toBe("Alice");
    expect(fields.age).toBe("18");
    expect(fields.sex).toBe("Female");
    expect(fields.appearance).toBe("Black hair + red eyes");
    expect(fields.dislikes).toBe("bullying (but does it anyway) + bugs");
    expect(fields.personality).toContain("Age(99)");
    expect(fields.personality).not.toContain("Scenario");
    expect(fields.scenario).toBe("A school hallway.");
    expect(wPlusPlusFields('Personality("Says ) without ending the field")\nAge(18)')).toMatchObject({ personality: "Says ) without ending the field", age: "18" });
  });

  it("accepts quoted and mixed equals/parenthesized fields and leaves malformed values unmapped", () => {
    expect(wPlusPlusFields('[Character("Alice")\nAge("18")\nGender=Female\nAppearance(Black hair)\nPersonality=Quiet\n}]')).toMatchObject({ character: "Alice", age: "18", gender: "Female", appearance: "Black hair", personality: "Quiet" });
    expect(wPlusPlusFields("Appearance(Unclosed\nAge(18)\nPersonality(Kind)")).toMatchObject({ age: "18", personality: "Kind" });
    expect(wPlusPlusFields("Appearance(Unclosed\nAge(18)\nPersonality(Kind)")).not.toHaveProperty("appearance");
  });

  it("reads Age: labels and year-old phrases", () => {
    expect(ageFromText("Age: 30\nTall, dark hair.")).toBe(30);
    expect(ageFromText("Age=22")).toBe(22);
    expect(ageFromText("she is a 20-year-old student")).toBe(20);
    expect(ageFromText("Hon är 28 år gammal.")).toBe(28);
    expect(ageFromField("25")).toBe(25);
    expect(ageFromField(19)).toBe(19);
    expect(ageFromText("Age: 30. She is a 20 year old.")).toBe(30);
  });

  it("does not treat height or conflicting ages as years", () => {
    expect(ageFromText("She is 180 cm tall.")).toBeUndefined();
    expect(ageFromText("20 year old, 40 years old")).toBeUndefined();
    expect(ageFromField("unknown")).toBeUndefined();
  });

  it("reads she/he from an opening line or a Pronouns label", () => {
    expect(pronounFromText("She is a bartender.")).toBe("she");
    expect(pronounFromText("He is reserved.")).toBe("he");
    expect(pronounFromText("Pronouns: they/them\nQuiet.")).toBe("they");
    expect(pronounFromText("Hon är torr i munnen.")).toBe("she");
    expect(pronounFromText("Gender=Female, Woman")).toBe("she");
  });

  it("needs a clear majority when there is no opening line", () => {
    expect(pronounFromText("She keeps the ledger. She rarely smiles. She locks the door.")).toBe("she");
    expect(pronounFromText("She met him at the bar.")).toBeUndefined();
  });
});

