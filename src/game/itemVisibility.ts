import type { EncounterDefinition, EncounterState } from "./EncounterSchema";

/**
 * A thing can stay hidden until the flags it requires are set, for example a coin in a drawer
 * that only shows once the drawer is open. Hidden things are not listed, not offered as
 * choices, not named to the story AI, and cannot be taken.
 */
export function itemRevealed(
  d: EncounterDefinition,
  s: Pick<EncounterState, "flags">,
  itemId: string,
): boolean {
  const item = d.items.find((entry) => entry.id === itemId);
  return !!item && (item.requiresFlags ?? []).every((flag) => s.flags.includes(flag));
}
