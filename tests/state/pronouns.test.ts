import { describe, it, expect } from "vitest";
import { CharacterPronounSchema } from "@state/StateSchema";
import { normalizePronoun, pronounForms, pronounLabel } from "@state/pronouns";

describe("pronouns", () => {
  it("keeps she / he / it and accepts they or a custom word", () => {
    expect(CharacterPronounSchema.parse("she")).toBe("she");
    expect(CharacterPronounSchema.parse("they")).toBe("they");
    expect(CharacterPronounSchema.parse("xe")).toBe("xe");
  });

  it("normalizes the built-in words", () => {
    expect(normalizePronoun("She")).toBe("she");
    expect(normalizePronoun("THEY")).toBe("they");
    expect(normalizePronoun("xe")).toBe("xe");
  });

  it("maps they to them / their", () => {
    expect(pronounForms("they")).toMatchObject({
      subject: "they",
      object: "them",
      possessive: "their"
    });
    expect(pronounLabel("they")).toBe("They");
  });
});
