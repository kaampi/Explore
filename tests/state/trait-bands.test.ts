import { describe, it, expect } from "vitest";
import { applyTraitTokens, desireAttribute, desireBandFromStats, liveTraitBody, liveTraitLine, traitBand } from "@state/traitBands";

describe("traitBand", () => {
  it("uses 0–30 / 31–69 / 70–100 on a 0–100 scale", () => {
    const scale = { min: 0, max: 100 };
    expect(traitBand(0, scale)).toBe("low");
    expect(traitBand(30, scale)).toBe("low");
    expect(traitBand(31, scale)).toBe("mid");
    expect(traitBand(69, scale)).toBe("mid");
    expect(traitBand(70, scale)).toBe("high");
    expect(traitBand(100, scale)).toBe("high");
  });

  it("uses the same fractions on a 1–18 scale", () => {
    const scale = { min: 1, max: 18 };
    expect(traitBand(1, scale)).toBe("low");
    expect(traitBand(6, scale)).toBe("low");
    expect(traitBand(10, scale)).toBe("mid");
    expect(traitBand(14, scale)).toBe("high");
    expect(traitBand(18, scale)).toBe("high");
  });
});

describe("liveTraitBody / liveTraitLine", () => {
  const boldness = {
    name: "Boldness",
    kind: "number" as const,
    min: 0,
    max: 100,
    highMeaning: "She initiates, she stays in the scene.",
    lowMeaning: "She waits, she does not start it.",
    description: ""
  };

  it("renders the high band with the high meaning", () => {
    expect(liveTraitLine("Emma", boldness, 72)).toBe(
      "- Emma Boldness 72/100 (high): She initiates, she stays in the scene."
    );
  });

  it("renders the low band with the low meaning", () => {
    expect(liveTraitLine("Emma", boldness, 20)).toBe(
      "- Emma Boldness 20/100 (low): She waits, she does not start it."
    );
  });

  it("frames mid as neither extreme when midMeaning is empty", () => {
    expect(liveTraitBody(boldness, 50)).toBe(
      "high would mean She initiates, she stays in the scene. low would mean She waits, she does not start it."
    );
    expect(liveTraitLine("Emma", boldness, 50)).toContain("(neither high nor low):");
  });

  it("uses authored midMeaning in the mid band", () => {
    const withMid = { ...boldness, midMeaning: "She neither waits nor initiates." };
    expect(liveTraitLine("Emma", withMid, 50)).toBe(
      "- Emma Boldness 50/100 (mid): She neither waits nor initiates."
    );
  });

  it("falls back to a single description when high/low are empty", () => {
    const legacy = {
      name: "Boldness",
      kind: "number" as const,
      min: 0,
      max: 100,
      description: "How far she dares in an NSFW beat."
    };
    expect(liveTraitLine("Emma", legacy, 70)).toBe(
      "- Emma Boldness 70/100 (high): How far she dares in an NSFW beat."
    );
  });

  it("expands {{char}} and pronoun tokens for that NPC", () => {
    const shared = {
      name: "Boldness",
      kind: "number" as const,
      min: 0,
      max: 100,
      highMeaning: "{{char}} stays in {{their}} scene.",
      lowMeaning: "Only in {{their}} private room.",
      description: ""
    };
    expect(liveTraitLine("Emma", shared, 72, { char: "Emma", pronoun: "she" })).toBe(
      "- Emma Boldness 72/100 (high): Emma stays in her scene."
    );
    expect(liveTraitLine("Alex", shared, 72, { char: "Alex", pronoun: "he" })).toBe(
      "- Alex Boldness 72/100 (high): Alex stays in his scene."
    );
    expect(liveTraitLine("Alex", shared, 20, { char: "Alex", pronoun: "he" })).toBe(
      "- Alex Boldness 20/100 (low): Only in his private room."
    );
  });
});

describe("applyTraitTokens", () => {
  it("leaves they-forms when pronoun is unset", () => {
    expect(applyTraitTokens("{{char}} keeps {{their}} distance.", { char: "Sam" })).toBe(
      "Sam keeps their distance."
    );
  });

  it("maps themselves / them for she, he, and it", () => {
    expect(applyTraitTokens("{{they}} pull {{themselves}} in.", { pronoun: "she" })).toBe(
      "she pull herself in."
    );
    expect(applyTraitTokens("stand with {{them}}.", { pronoun: "he" })).toBe("stand with him.");
    expect(applyTraitTokens("{{their}} room.", { pronoun: "it" })).toBe("its room.");
    expect(applyTraitTokens("{{they}} keep {{their}} distance.", { pronoun: "they" })).toBe(
      "they keep their distance."
    );
  });
});

describe("desireAttribute", () => {
  const längtan = {
    id: "desire",
    name: "Längtan",
    kind: "number" as const,
    min: 0,
    max: 100,
    description: "",
    highMeaning: "",
    lowMeaning: "",
    midMeaning: "",
    options: [] as string[],
    maxShift: 15,
    role: "desire" as const
  };
  const boldness = {
    id: "boldness",
    name: "Boldness",
    kind: "number" as const,
    min: 1,
    max: 18,
    description: "",
    highMeaning: "",
    lowMeaning: "",
    midMeaning: "",
    options: [] as string[],
    maxShift: 0
  };

  it("returns the marked number field, not a high-valued neighbor", () => {
    expect(desireAttribute([boldness, längtan])?.id).toBe("desire");
  });

  it("ignores unmarked sets", () => {
    const { role: _role, ...unmarked } = längtan;
    expect(desireAttribute([boldness, unmarked])).toBeUndefined();
  });

  it("reads the live band from that field's own scale", () => {
    const d18 = { ...längtan, min: 1, max: 18 };
    expect(desireBandFromStats([d18], { desire: { value: 14 } })).toBe("high");
    expect(desireBandFromStats([d18], { desire: { value: 10 } })).toBe("mid");
    expect(desireBandFromStats([boldness], { boldness: { value: 18 } })).toBeUndefined();
  });
});
