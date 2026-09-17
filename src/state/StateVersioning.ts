import type { Session } from "./StateSchema";

/**
 * State Versioning — Master Spec §29 (State Snapshots) and §47
 * (Concurrency & Race Condition Prevention).
 *
 * Every proposal carries the state_version it was built against. If the
 * canonical state has moved on by the time the proposal is evaluated,
 * the proposal is stale and must be rejected rather than silently
 * applied against outdated assumptions.
 */

export function isStale(expectedVersion: number, currentVersion: number): boolean {
  return expectedVersion !== currentVersion;
}

export function nextVersion(currentVersion: number): number {
  return currentVersion + 1;
}

/**
 * Deterministic, order-independent stringify so the same session state
 * always hashes the same way regardless of key insertion order.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`
  );
  return `{${entries.join(",")}}`;
}

/**
 * FNV-1a 32-bit hash. Not cryptographic — this is an integrity/diffing
 * check for snapshots (§29), not a security boundary. If tamper-evidence
 * is ever needed (e.g. for exported snapshots), swap this for
 * crypto.subtle.digest("SHA-256", ...) at the call site; the interface
 * here stays the same.
 */
export function hashState(session: Pick<Session, "characters" | "scene" | "player" | "relationships" | "layers" | "stateVersion">): string {
  const input = stableStringify(session);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface StateSnapshot {
  stateVersion: number;
  hash: string;
  takenAt: string;
}

/** Creates an immutable snapshot prior to an LLM turn (§29). */
export function createSnapshot(session: Session): StateSnapshot {
  return {
    stateVersion: session.stateVersion,
    hash: hashState(session),
    takenAt: new Date().toISOString()
  };
}
