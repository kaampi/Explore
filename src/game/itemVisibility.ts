import type { Actor, EncounterDefinition, EncounterState } from "./EncounterSchema";

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

/**
 * A person can stay hidden until the facts they require are set. Hidden people are not listed,
 * not spoken to, not attacked, not in a fight and not named to the story AI.
 */
export function actorRevealed(s: Pick<EncounterState, "flags">, actor: Actor): boolean {
  return (actor.requiresFlags ?? []).every((flag) => s.flags.includes(flag));
}
/** The people in the scene that can be seen right now. */
export function visibleActors(s: Pick<EncounterState, "flags" | "actors">): Actor[] {
  return Object.values(s.actors).filter((actor) => actorRevealed(s, actor));
}
