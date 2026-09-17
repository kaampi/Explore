/**
 * Session State Machine — Master Spec §48.
 * Models the valid lifecycle of a single turn. Every state change goes
 * through `transition()`; there is no way to jump directly from, say,
 * "streaming" to "idle" without passing through "extracting" and
 * "committing" — that ordering is exactly what makes the pipeline
 * (Pass 1 -> Pass 2 -> validation -> commit) structurally enforced
 * rather than just a convention SessionEngine happens to follow.
 */

export type SessionState =
  | "idle"
  | "awaiting_response"
  | "streaming"
  | "extracting"
  | "committing"
  | "error";

export type SessionEvent =
  | "start_turn"
  | "provider_responding"
  | "stream_complete"
  | "proposals_ready"
  | "committed"
  | "failure"
  | "reset";

const TRANSITIONS: Record<SessionState, Partial<Record<SessionEvent, SessionState>>> = {
  idle: { start_turn: "awaiting_response" },
  awaiting_response: { provider_responding: "streaming", failure: "error" },
  streaming: { stream_complete: "extracting", failure: "error" },
  extracting: { proposals_ready: "committing", failure: "error" },
  committing: { committed: "idle", failure: "error" },
  error: { reset: "idle" }
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: SessionState,
    public readonly event: SessionEvent
  ) {
    super(`Invalid session state transition: cannot apply event "${event}" from state "${from}".`);
    this.name = "InvalidTransitionError";
  }
}

export function transition(current: SessionState, event: SessionEvent): SessionState {
  const next = TRANSITIONS[current][event];
  if (!next) {
    throw new InvalidTransitionError(current, event);
  }
  return next;
}

export function canTransition(current: SessionState, event: SessionEvent): boolean {
  return TRANSITIONS[current][event] !== undefined;
}
