import { estimateTokens } from "./tokenEstimate";
import type { ContextBlock } from "./ContextBlock";

/**
 * Context Budget Manager — Master Spec §11.
 *
 * Two limits:
 *  - targetTokens: aspirational budget (spec default ≤ 3,500). Assembly
 *    tries to stay under this.
 *  - hardCeilingTokens: absolute limit (spec default ≤ 8,000). Assembly
 *    must never exceed this, even if it means dropping content that
 *    would otherwise fit under a looser interpretation of "important".
 *
 * Required blocks (system rules, current state) are never dropped. If
 * required content alone exceeds the hard ceiling, that's a
 * configuration error surfaced as an exception — no amount of trimming
 * optional content can fix it.
 */

export interface BudgetConfig {
  targetTokens: number;
  hardCeilingTokens: number;
}

export const DEFAULT_BUDGET: BudgetConfig = {
  targetTokens: 3500,
  hardCeilingTokens: 8000
};

export class RequiredContentExceedsHardCeilingError extends Error {
  constructor(requiredTokens: number, hardCeilingTokens: number) {
    super(
      `Required context blocks alone total ${requiredTokens} tokens, which exceeds the hard ceiling of ${hardCeilingTokens}. This cannot be fixed by trimming optional content — reduce required content (system rules / state summary).`
    );
    this.name = "RequiredContentExceedsHardCeilingError";
  }
}

export interface AssembledBudget {
  includedBlocks: ContextBlock[];
  droppedBlocks: ContextBlock[];
  totalTokens: number;
  /** True if includedBlocks total exceeds targetTokens (but is still <= hardCeilingTokens). */
  overTarget: boolean;
}

/**
 * Applies the budget to a set of context blocks.
 *
 * Algorithm:
 *  1. Required blocks are always included; if their token total exceeds
 *     the hard ceiling, throw immediately.
 *  2. Optional blocks are considered in priority order (lower priority
 *     number first). Each is included only if adding it does not push
 *     the running total past the hard ceiling.
 *  3. `overTarget` reports whether the final total exceeds the softer
 *     target — informational, not an error, since staying under the
 *     hard ceiling is the actual invariant.
 */
export function applyBudget(
  blocks: ContextBlock[],
  config: BudgetConfig = DEFAULT_BUDGET
): AssembledBudget {
  const required = blocks.filter((b) => b.required);
  const optional = [...blocks.filter((b) => !b.required)].sort((a, b) => a.priority - b.priority);

  const requiredTokens = required.reduce((sum, b) => sum + estimateTokens(b.content), 0);
  if (requiredTokens > config.hardCeilingTokens) {
    throw new RequiredContentExceedsHardCeilingError(requiredTokens, config.hardCeilingTokens);
  }

  const included: ContextBlock[] = [...required];
  const dropped: ContextBlock[] = [];
  let total = requiredTokens;

  for (const block of optional) {
    const blockTokens = estimateTokens(block.content);
    if (total + blockTokens <= config.hardCeilingTokens) {
      included.push(block);
      total += blockTokens;
    } else {
      dropped.push(block);
    }
  }

  return {
    includedBlocks: included,
    droppedBlocks: dropped,
    totalTokens: total,
    overTarget: total > config.targetTokens
  };
}
