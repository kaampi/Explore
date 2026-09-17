import { describe, it, expect } from "vitest";
import { transition, canTransition, InvalidTransitionError, type SessionState, type SessionEvent } from "@session/SessionStateMachine";

const ALL_STATES: SessionState[] = [
  "idle",
  "awaiting_response",
  "streaming",
  "extracting",
  "committing",
  "error"
];
const ALL_EVENTS: SessionEvent[] = [
  "start_turn",
  "provider_responding",
  "stream_complete",
  "proposals_ready",
  "committed",
  "failure",
  "reset"
];

describe("SessionStateMachine — happy path", () => {
  it("walks the full turn lifecycle idle -> ... -> idle", () => {
    let state: SessionState = "idle";
    state = transition(state, "start_turn");
    expect(state).toBe("awaiting_response");
    state = transition(state, "provider_responding");
    expect(state).toBe("streaming");
    state = transition(state, "stream_complete");
    expect(state).toBe("extracting");
    state = transition(state, "proposals_ready");
    expect(state).toBe("committing");
    state = transition(state, "committed");
    expect(state).toBe("idle");
  });

  it("recovers from error back to idle via reset", () => {
    let state: SessionState = "streaming";
    state = transition(state, "failure");
    expect(state).toBe("error");
    state = transition(state, "reset");
    expect(state).toBe("idle");
  });
});

describe("SessionStateMachine — invalid transitions", () => {
  it("rejects skipping straight from streaming to idle", () => {
    expect(() => transition("streaming", "committed")).toThrow(InvalidTransitionError);
  });

  it("rejects starting a new turn while one is already in flight", () => {
    expect(() => transition("streaming", "start_turn")).toThrow(InvalidTransitionError);
  });

  it("rejects any event on idle except start_turn", () => {
    for (const event of ALL_EVENTS.filter((e) => e !== "start_turn")) {
      expect(canTransition("idle", event)).toBe(false);
    }
  });

  it("only allows 'reset' out of the error state", () => {
    for (const event of ALL_EVENTS.filter((e) => e !== "reset")) {
      expect(canTransition("error", event)).toBe(false);
    }
    expect(canTransition("error", "reset")).toBe(true);
  });

  it("every busy state (not idle/error) accepts 'failure'", () => {
    const busyStates: SessionState[] = ["awaiting_response", "streaming", "extracting", "committing"];
    for (const state of busyStates) {
      expect(canTransition(state, "failure")).toBe(true);
    }
  });

  it("has no dead-end states — every state has at least one valid outgoing event", () => {
    for (const state of ALL_STATES) {
      const hasAnyExit = ALL_EVENTS.some((event) => canTransition(state, event));
      expect(hasAnyExit).toBe(true);
    }
  });
});
