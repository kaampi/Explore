/**
 * A ContextBlock is one addressable piece of prompt content: a system
 * rule, the current state summary, an active layer's instructions, a
 * retrieved memory, or one conversation turn. ContextEngine assembles
 * these from various sources; ContextBudgetManager decides which ones
 * survive the token budget.
 */

export type ContextBlockSource =
  | "system_rule"
  | "voice"
  | "story"
  | "state_summary"
  | "active_layer"
  | "memory"
  | "conversation";

export interface ContextBlock {
  id: string;
  source: ContextBlockSource;
  content: string;
  /**
   * Lower number = higher priority = kept longer when trimming.
   * Required blocks ignore this for inclusion, but it still determines
   * the order they're rendered in.
   */
  priority: number;
  /**
   * Required blocks are never dropped by budget trimming. If required
   * blocks alone exceed the hard ceiling, ContextBudgetManager throws —
   * that's a configuration problem (e.g. system rules too verbose),
   * not something trimming can fix.
   */
  required: boolean;
}

export const PRIORITY = {
  SYSTEM_RULE: 0,
  /** Live closeness from meters — after engine writing rules, before narrator/card. */
  CLOSENESS_BEAT: 1,
  VOICE: 2,
  STORY: 5,
  STATE_SUMMARY: 10,
  CORE_LAYER: 20,
  OTHER_LAYER: 30,
  /** Pinned recap of beats the 8,000 ceiling already dropped. */
  CONDENSED_HISTORY: 35,
  MEMORY: 40,
  CONVERSATION_RECENT: 50
} as const;
