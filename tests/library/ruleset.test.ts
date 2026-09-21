import { describe, it, expect } from "vitest";
import { newRulesetTemplate, parseChoiceOptions, parseRulesetTemplate } from "@library/LibrarySchema";
import { exampleClosenessRuleset, exampleFantasyRuleset } from "@library/exampleTemplates";

describe("ruleset templates", () => {
  it("parses a named attribute bundle", () => {
    const template = newRulesetTemplate({
      name: "Närhet",
      attributes: [
        { id: "safety", name: "Trygghet", kind: "number", min: 0, max: 100, highMeaning: "{{char}} can stay open.", lowMeaning: "{{char}} keeps distance." }
      ],
      source: "player"
    });
    expect(template.id).toBeTruthy();
    expect(parseRulesetTemplate(template).attributes[0]?.name).toBe("Trygghet");
    expect(parseRulesetTemplate(template).attributes[0]?.highMeaning).toBe("{{char}} can stay open.");
  });

  it("stores choice lists on a text field", () => {
    const template = newRulesetTemplate({
      name: "Närhet",
      attributes: [
        {
          id: "orientation",
          name: "Orientation",
          kind: "text",
          description: "Honor the live value only.",
          options: ["Hetero", "Homo", "Bi"]
        }
      ],
      source: "player"
    });
    expect(parseRulesetTemplate(template).attributes[0]?.options).toEqual(["Hetero", "Homo", "Bi"]);
  });

  it("parses choice labels from lines and commas", () => {
    expect(parseChoiceOptions("Hetero, Homo, Bi")).toEqual(["Hetero", "Homo", "Bi"]);
    expect(parseChoiceOptions("Hetero\nHomo\nBi\nHomo")).toEqual(["Hetero", "Homo", "Bi"]);
  });

  it("ships a fantasy example without locking it to a character", () => {
    const set = exampleFantasyRuleset();
    expect(set.name).toBe("Klassisk fantasy");
    expect(set.attributes.map((a) => a.id)).toContain("wisdom");
    expect(set.attributes.some((a) => a.role === "desire")).toBe(false);
  });

  it("marks Värme as the closeness signal on the Förtroende example", () => {
    const set = exampleClosenessRuleset();
    expect(set.attributes.find((a) => a.id === "warmth")?.role).toBe("desire");
    expect(set.attributes.filter((a) => a.role === "desire")).toHaveLength(1);
  });

  it("stores a desire role on a number field", () => {
    const template = newRulesetTemplate({
      name: "Custom",
      attributes: [
        { id: "passion", name: "Passion", kind: "number", min: 1, max: 18, role: "desire" }
      ],
      source: "player"
    });
    expect(parseRulesetTemplate(template).attributes[0]?.role).toBe("desire");
  });

  it("drops empty choice labels instead of skipping the whole set", () => {
    const template = parseRulesetTemplate({
      id: "r1",
      name: "Närhet",
      attributes: [
        {
          id: "orientation",
          name: "Orientation",
          kind: "text",
          options: ["Hetero", "", "Bi", "  "]
        }
      ],
      source: "player",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    expect(template.attributes[0]?.options).toEqual(["Hetero", "Bi"]);
  });
});
