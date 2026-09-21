import { describe, it, expect } from "vitest";
import { attributeModifier, checkAttempt, normalizedAttributeValue, rollD20 } from "@state/checkEngine";

describe("rollD20", () => {
  it("maps 0 to 1 and just-under-1 to 20", () => {
    expect(rollD20(() => 0)).toBe(1);
    expect(rollD20(() => 0.999)).toBe(20);
  });
});

describe("normalizedAttributeValue", () => {
  it("normalizes a 1-18 fantasy stat the same way as a 0-100 meter", () => {
    expect(normalizedAttributeValue(9.5, { min: 1, max: 18 })).toBeCloseTo(50, 0);
    expect(normalizedAttributeValue(50, { min: 0, max: 100 })).toBe(50);
    expect(normalizedAttributeValue(18, { min: 1, max: 18 })).toBe(100);
    expect(normalizedAttributeValue(1, { min: 1, max: 18 })).toBe(0);
  });

  it("clamps out-of-range values instead of extrapolating", () => {
    expect(normalizedAttributeValue(200, { min: 0, max: 100 })).toBe(100);
    expect(normalizedAttributeValue(-5, { min: 0, max: 100 })).toBe(0);
  });

  it("falls back to a 0-100 range when min/max are missing", () => {
    expect(normalizedAttributeValue(50, {})).toBe(50);
  });
});

describe("attributeModifier", () => {
  it("is 0 at the midpoint", () => {
    expect(attributeModifier(50)).toBe(0);
  });

  it("is roughly +5 at the top and -5 at the bottom", () => {
    expect(attributeModifier(100)).toBe(5);
    expect(attributeModifier(0)).toBe(-5);
  });
});

describe("checkAttempt", () => {
  it("succeeds when roll + modifier meets the difficulty", () => {
    const result = checkAttempt({
      attributeValue: 18,
      attributeDef: { min: 1, max: 18 },
      difficulty: 14,
      roll: 10
    });
    // modifier at max (100 normalized) is +5, so total = 15 >= 14.
    expect(result).toEqual({ roll: 10, modifier: 5, total: 15, difficulty: 14, success: true, critical: undefined });
  });

  it("fails when roll + modifier falls short of the difficulty", () => {
    const result = checkAttempt({
      attributeValue: 1,
      attributeDef: { min: 1, max: 18 },
      difficulty: 14,
      roll: 10
    });
    // modifier at min (0 normalized) is -5, so total = 5 < 14.
    expect(result.success).toBe(false);
    expect(result.modifier).toBe(-5);
  });

  it("a natural 20 always succeeds, even against a weak attribute and high difficulty", () => {
    const result = checkAttempt({
      attributeValue: 1,
      attributeDef: { min: 1, max: 18 },
      difficulty: 30,
      roll: 20
    });
    expect(result.success).toBe(true);
    expect(result.critical).toBe("success");
  });

  it("a natural 1 always fails, even with a strong attribute and low difficulty", () => {
    const result = checkAttempt({
      attributeValue: 18,
      attributeDef: { min: 1, max: 18 },
      difficulty: 1,
      roll: 1
    });
    expect(result.success).toBe(false);
    expect(result.critical).toBe("failure");
  });

  it("rolls its own d20 when none is given", () => {
    const result = checkAttempt({
      attributeValue: 10,
      attributeDef: { min: 1, max: 18 },
      difficulty: 10,
      rng: () => 0.5
    });
    expect(result.roll).toBe(11);
  });

  it("is a pure function — same inputs, same outputs", () => {
    const input = { attributeValue: 12, attributeDef: { min: 1, max: 18 }, difficulty: 12, roll: 8 } as const;
    expect(checkAttempt(input)).toEqual(checkAttempt(input));
  });
});
