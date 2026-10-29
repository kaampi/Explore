import { expect, it } from "vitest";
import { morphLoopStep, profileTriangles } from "../../src/ui/studio/morphRenderer";

it("holds each expression, morphs smoothly, and closes the loop without skipping the last face", () => {
  expect(morphLoopStep(1000, 3)).toEqual({ source: 0, target: 1, mix: 0 });
  expect(morphLoopStep(2900, 3).mix).toBe(0);
  expect(morphLoopStep(3500, 3).mix).toBeCloseTo(.5);
  expect(morphLoopStep(3999, 3).mix).toBeCloseTo(1);
  expect(morphLoopStep(4000, 3)).toEqual({ source: 1, target: 2, mix: 0 });
  expect(morphLoopStep(10000, 3)).toMatchObject({ source: 2, target: 0 });
  expect(morphLoopStep(12000, 3)).toEqual({ source: 0, target: 1, mix: 0 });
});

it("uses the saved custom mesh for card rendering", () => {
  const triangles = [[0, 1, 2]];
  expect(profileTriangles({ version: 1, active: true, expressions: [], triangles })).toBe(triangles);
});
