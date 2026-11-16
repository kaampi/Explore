import { describe, expect, it } from "vitest";
import { CHECK_LEVELS, levelModifier, suggestLevel } from "../../src/game/rules";
import { checkPreview } from "../../src/game/narration";
import { loadingBayGame } from "../../src/scenarios/loadingBay";

describe("difficulty levels", () => {
  it("map to the modifiers the storyboard and the object cards share", () => {
    expect(CHECK_LEVELS.map((l) => [l.label, l.modifier])).toEqual([
      ["Easy", 20],
      ["Standard", 0],
      ["Hard", -20],
      ["Very hard", -40],
    ]);
    expect(levelModifier("veryHard")).toBe(-40);
  });

  it.each([
    [0, "easy"],
    [8, "easy"],
    [9, "standard"],
    [13, "standard"],
    [14, "hard"],
    [17, "hard"],
    [18, "veryHard"],
    [30, "veryHard"],
  ])("suggests a level for the old number %s", (difficulty, level) => {
    expect(suggestLevel(difficulty)).toBe(level);
  });

  it("names Very hard in the chance preview", () => {
    const game = loadingBayGame();
    const text = checkPreview(game.definition, game.state.actors.courier!, "Negotiation", -40);

    expect(text).toContain("Very hard");
  });
});
