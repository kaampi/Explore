import { describe, it, expect } from "vitest";
import { ageFromField, ageFromText, pronounFromText } from "@library/cardHints";

describe("cardHints", () => {
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
