import { describe, it, expect } from "vitest";
import { displayLayerType, readsAsCharacterTrait, coerceProposedLayerType } from "@layers/layerPlacement";

const EMMA = ["emma"];

describe("readsAsCharacterTrait", () => {
  it("treats demeanor-about-the-character as a character trait", () => {
    expect(
      readsAsCharacterTrait(
        "Emma maintains a neutral, reserved demeanor in public settings, preferring solitude even when interacting briefly with others.",
        EMMA
      )
    ).toBe(true);
  });

  it("treats professional manner as a character trait", () => {
    expect(
      readsAsCharacterTrait(
        "Emma maintains a professional demeanor and avoids small talk while working at the bar.",
        EMMA
      )
    ).toBe(true);
  });

  it("does not treat a workplace/setting note as a character trait", () => {
    expect(
      readsAsCharacterTrait(
        "Emma's workplace is an upscale, low-key cocktail lounge with subdued evening ambiance.",
        EMMA
      )
    ).toBe(false);
  });

  it("does not treat storing bottles as a character trait", () => {
    expect(
      readsAsCharacterTrait(
        "A locked cellar door sits behind the bar. Emma keeps the better bottles down there and does not mention it unless asked.",
        EMMA
      )
    ).toBe(false);
  });

  it("does not treat a pure atmosphere note as a character trait", () => {
    expect(
      readsAsCharacterTrait("Dimly lit, intimate setting with soft jazz in an almost-empty bar", EMMA)
    ).toBe(false);
  });
});

describe("displayLayerType", () => {
  it("moves a mis-tagged environment personality note onto core", () => {
    expect(
      displayLayerType(
        {
          type: "environment",
          content: "Emma maintains a professional demeanor and avoids small talk while working at the bar."
        },
        EMMA
      )
    ).toBe("core");
  });

  it("leaves a place note that happens to mention the character storing something", () => {
    expect(
      displayLayerType(
        {
          type: "environment",
          content:
            "A locked cellar door sits behind the bar. Emma keeps the better bottles down there and does not mention it unless asked."
        },
        EMMA
      )
    ).toBe("environment");
  });

  it("leaves a real place note as environment", () => {
    expect(
      displayLayerType(
        { type: "environment", content: "The dimly lit bar has an intimate atmosphere with soft jazz music." },
        EMMA
      )
    ).toBe("environment");
  });

  it("does not override an explicit relationship type", () => {
    expect(
      displayLayerType({ type: "relationship", content: "Emma has started to trust the player." }, EMMA)
    ).toBe("relationship");
  });
});

describe("coerceProposedLayerType", () => {
  it("rewrites an environment proposal about demeanor to core", () => {
    expect(
      coerceProposedLayerType(
        { type: "environment", content: "Emma maintains a reserved demeanor in public." },
        "emma"
      )
    ).toEqual({ type: "core", content: "Emma maintains a reserved demeanor in public." });
  });

  it("leaves a genuine place proposal alone", () => {
    const proposal = { type: "environment" as const, content: "It always rains here." };
    expect(coerceProposedLayerType(proposal, "emma")).toEqual(proposal);
  });
});
