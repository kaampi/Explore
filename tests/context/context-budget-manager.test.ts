import { describe, it, expect } from "vitest";
import {
  applyBudget,
  RequiredContentExceedsHardCeilingError,
  type BudgetConfig
} from "@context/ContextBudgetManager";
import type { ContextBlock } from "@context/ContextBlock";

function block(overrides: Partial<ContextBlock> & Pick<ContextBlock, "id" | "content">): ContextBlock {
  return {
    source: "conversation",
    priority: 100,
    required: false,
    ...overrides
  };
}

const tinyBudget: BudgetConfig = { targetTokens: 20, hardCeilingTokens: 40 };

describe("ContextBudgetManager.applyBudget", () => {
  it("always includes required blocks", () => {
    const required = block({ id: "sys", content: "system rule", required: true, priority: 0 });
    const result = applyBudget([required], tinyBudget);
    expect(result.includedBlocks).toContainEqual(required);
  });

  it("throws when required content alone exceeds the hard ceiling", () => {
    const huge = block({
      id: "sys",
      content: "x".repeat(1000), // ~250 tokens, way over hardCeilingTokens: 40
      required: true,
      priority: 0
    });
    expect(() => applyBudget([huge], tinyBudget)).toThrow(RequiredContentExceedsHardCeilingError);
  });

  it("drops lower-priority optional blocks first when budget is tight", () => {
    // ~20 chars each => ~5 tokens each
    const high = block({ id: "high", content: "aaaaaaaaaaaaaaaaaaaa", priority: 1 });
    const low = block({ id: "low", content: "bbbbbbbbbbbbbbbbbbbb", priority: 2 });

    // Hard ceiling only fits one of the two optional blocks.
    const tight: BudgetConfig = { targetTokens: 3, hardCeilingTokens: 6 };
    const result = applyBudget([high, low], tight);

    expect(result.includedBlocks.map((b) => b.id)).toContain("high");
    expect(result.droppedBlocks.map((b) => b.id)).toContain("low");
  });

  it("never exceeds the hard ceiling even with many optional blocks", () => {
    const blocks = Array.from({ length: 20 }, (_, i) =>
      block({ id: `b${i}`, content: "x".repeat(40), priority: i })
    );
    const result = applyBudget(blocks, tinyBudget);
    expect(result.totalTokens).toBeLessThanOrEqual(tinyBudget.hardCeilingTokens);
  });

  it("reports overTarget when total exceeds target but stays under hard ceiling", () => {
    const blocks = [
      block({ id: "a", content: "x".repeat(60), priority: 1 }), // ~15 tokens
      block({ id: "b", content: "x".repeat(60), priority: 2 }) // ~15 tokens
    ];
    // target 20, ceiling 40: two blocks (~30 total) exceed target but fit under ceiling
    const result = applyBudget(blocks, tinyBudget);
    expect(result.overTarget).toBe(true);
    expect(result.totalTokens).toBeLessThanOrEqual(tinyBudget.hardCeilingTokens);
  });

  it("does not report overTarget when everything comfortably fits", () => {
    const small = block({ id: "a", content: "hi", priority: 1 });
    const result = applyBudget([small], tinyBudget);
    expect(result.overTarget).toBe(false);
  });
});
