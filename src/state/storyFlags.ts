import type { Session } from "./StateSchema";

/**
 * Story flags — freeform narrative facts set during play ("brosch_given").
 * Unlike a trigger's `dot.path==value`, a flag is not tied to a schema
 * field: it exists purely so one scene/layer can mark that something
 * happened, and another can require it present, or — the case a plain
 * `path==value` trigger cannot express — require it absent.
 */

export function normalizeStoryFlag(flag: string): string {
  return flag.trim();
}

export function hasStoryFlag(session: Pick<Session, "storyFlags">, flag: string): boolean {
  const target = normalizeStoryFlag(flag);
  if (!target) return false;
  return (session.storyFlags ?? []).includes(target);
}

/** All flags present, and none of the absent ones present. Empty lists always pass. */
export function storyFlagsSatisfied(
  session: Pick<Session, "storyFlags">,
  requires?: string[],
  requiresAbsent?: string[]
): boolean {
  if (requires?.some((flag) => !hasStoryFlag(session, flag))) return false;
  if (requiresAbsent?.some((flag) => hasStoryFlag(session, flag))) return false;
  return true;
}

/** Next `storyFlags` after setting `flag`, or undefined if it was already set (no-op). */
export function nextFlagsAfterSet(flags: string[] | undefined, flag: string): string[] | undefined {
  const target = normalizeStoryFlag(flag);
  if (!target) return undefined;
  const current = flags ?? [];
  if (current.includes(target)) return undefined;
  return [...current, target];
}

/** Next `storyFlags` after clearing `flag`, or undefined if it was already absent (no-op). */
export function nextFlagsAfterClear(flags: string[] | undefined, flag: string): string[] | undefined {
  const target = normalizeStoryFlag(flag);
  if (!target) return undefined;
  const current = flags ?? [];
  if (!current.includes(target)) return undefined;
  return current.filter((item) => item !== target);
}
