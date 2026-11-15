import type { Session } from "../state/StateSchema";

/** Name the gate test rule-set had before sessions carried an explicit `scenario`. */
export const LEGACY_GATE_TEST_RULESET_NAME = "Gate test · d100";

/**
 * True for the self-contained gate test scenario.
 *
 * New sessions say so with `session.scenario`. Sessions saved earlier have no such
 * field, so they are recognised by the rule-set name they were created with.
 */
export function isGateTestSession(session: Pick<Session, "scenario" | "ruleset">): boolean {
  if (session.scenario !== undefined) {
    return session.scenario === "gate-test";
  }
  return session.ruleset?.name === LEGACY_GATE_TEST_RULESET_NAME;
}
