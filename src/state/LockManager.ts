import type { LockState } from "./StateSchema";
import type { AuthoritySource } from "./AuthorityResolver";

/**
 * Lock Manager — Master Spec §7 "Regler".
 *
 * This is deliberately separate from AuthorityResolver: AuthorityResolver
 * decides whether a *value* mutation may proceed given the field's current
 * lock. LockManager decides whether the *lock itself* may be changed
 * (e.g. player locking/unlocking a field). Conflating the two was a risk
 * in the original StateEngine sketch — locking is a privileged operation
 * and needed its own choke point.
 *
 * Rules (§7):
 *  - system_locked can only be changed by the system's explicit control flow.
 *  - player_locked can only be set/cleared by the player (never by AI).
 *  - unlocked is the default and freely settable by the player.
 *  - AI-sourced requests can never change a lock, regardless of current state.
 */

export type LockChangeRequestor = Extract<
  AuthoritySource,
  "player_manual_state" | "player_locked_state" | "immutable_system_constraint"
>;

export interface LockChangeRequest {
  currentLock: LockState;
  requestedLock: LockState;
  requestedBy: AuthoritySource;
}

export interface LockChangeDecision {
  allowed: boolean;
  reason: string;
}

const AI_SOURCES: ReadonlySet<AuthoritySource> = new Set([
  "ai_approved_state_mutation",
  "ai_inference"
]);

export function resolveLockChange(request: LockChangeRequest): LockChangeDecision {
  if (AI_SOURCES.has(request.requestedBy)) {
    return { allowed: false, reason: "AI-sourced requests can never change a field's lock." };
  }

  if (
    request.currentLock === "system_locked" &&
    request.requestedBy !== "immutable_system_constraint"
  ) {
    return {
      allowed: false,
      reason: "system_locked fields can only be changed by the system's explicit control flow."
    };
  }

  if (
    request.requestedLock === "system_locked" &&
    request.requestedBy !== "immutable_system_constraint"
  ) {
    return {
      allowed: false,
      reason: "Only the system's explicit control flow may set a field to system_locked."
    };
  }

  // Player may freely move between unlocked <-> player_locked.
  return { allowed: true, reason: "Player-initiated lock change on a non-system-locked field." };
}
