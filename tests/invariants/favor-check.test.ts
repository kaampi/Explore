import { describe, it, expect } from "vitest";
import { checkFavor, rollD100 } from "@state/favorCheck";

describe("rollD100", () => {
  it("maps 0 to 1 and just-under-1 to 100", () => {
    expect(rollD100(() => 0)).toBe(1);
    expect(rollD100(() => 0.999)).toBe(100);
  });
});

describe("checkFavor", () => {
  it("grants when the roll is lower than trust", () => {
    expect(checkFavor(20, 19)).toEqual({ roll: 19, trust: 20, granted: true });
  });

  it("refuses when the roll equals or beats trust", () => {
    expect(checkFavor(20, 20).granted).toBe(false);
    expect(checkFavor(20, 21).granted).toBe(false);
  });

  it("never grants at trust 0", () => {
    expect(checkFavor(0, 1).granted).toBe(false);
  });
});
