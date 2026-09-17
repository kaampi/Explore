import type { LockState } from "./StateSchema";

/**
 * Authority hierarchy — Master Spec §6.
 * Lower index = higher authority. This ordering is the core arbitration
 * rule for every conflicting mutation the system will ever see.
 */
export const AUTHORITY_ORDER = [
  "immutable_system_constraint",
  "player_locked_state",
  "player_manual_state",
  "explicit_scenario_rule",
  "active_layer_effect",
  "ai_approved_state_mutation",
  "ai_inference",
  "historical_memory"
] as const;

export type AuthoritySource = (typeof AUTHORITY_ORDER)[number];

function rank(source: AuthoritySource): number {
  return AUTHORITY_ORDER.indexOf(source);
}

export interface MutationRequest {
  source: AuthoritySource;
  fieldLock: LockState;
}

export interface AuthorityDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Core invariant (§51): the AI can never overwrite player_locked state.
 * This function is intentionally the single choke point for that rule —
 * every mutation, from every engine, must pass through here before
 * State Version Check / Commit.
 */
export function resolveAuthority(request: MutationRequest): AuthorityDecision {
  const isAiSource =
    request.source === "ai_approved_state_mutation" || request.source === "ai_inference";

  if (isAiSource && request.fieldLock === "player_locked") {
    return {
      allowed: false,
      reason: "AI-sourced mutation rejected: target field is player_locked."
    };
  }

  if (request.fieldLock === "system_locked" && request.source !== "immutable_system_constraint") {
    return {
      allowed: false,
      reason: "Mutation rejected: target field is system_locked and can only change via explicit system control flow."
    };
  }

  return { allowed: true, reason: "No conflicting lock for this authority source." };
}

/**
 * When two proposals target the same field in the same turn, the one
 * with higher authority (lower rank index) wins.
 */
export function higherAuthority(a: AuthoritySource, b: AuthoritySource): AuthoritySource {
  return rank(a) <= rank(b) ? a : b;
}
