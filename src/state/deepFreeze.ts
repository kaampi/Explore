/**
 * Recursively freezes an object graph. Used by StateEngine to enforce
 * System Invariant #16 (§51): "UI får inte direkt mutera kanoniskt state
 * utan att gå genom State Engine" — UI may not mutate canonical state
 * without going through State Engine.
 *
 * TypeScript's `Readonly<Session>` only prevents *accidental* mutation at
 * compile time; nothing stops a `as any` cast or plain JS caller from
 * writing to the object at runtime. Freezing closes that gap: any write
 * attempt throws in strict mode (the default for ES modules), so the
 * invariant is enforced by the runtime, not just the type checker.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.keys(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}
