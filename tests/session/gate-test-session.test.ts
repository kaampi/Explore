import { describe, expect, it } from "vitest";
import { isGateTestSession, LEGACY_GATE_TEST_RULESET_NAME } from "../../src/session/gateTest";
import { parseSession } from "../../src/state/StateSchema";
import { gateScenario } from "../../src/ui/home/gateScenario";

describe("isGateTestSession", () => {
  it("is true for a new gate scenario because it names its scenario", () => {
    const session = gateScenario("gate-new", "mock");

    expect(session.scenario).toBe("gate-test");
    expect(isGateTestSession(session)).toBe(true);
  });

  it("does not depend on the rule-set name once the scenario is set", () => {
    const session = gateScenario("gate-renamed", "mock");
    session.ruleset = { ...session.ruleset!, name: "Something else" };

    expect(isGateTestSession(session)).toBe(true);
  });

  it("is false for an ordinary rule-set on a session with no scenario", () => {
    const ordinary = { scenario: undefined, ruleset: { name: "Other", attributes: [] } };

    expect(isGateTestSession(ordinary)).toBe(false);
  });

  it("still recognises a session saved before the scenario field existed", () => {
    const saved = JSON.parse(JSON.stringify(gateScenario("gate-old", "mock")));
    delete saved.scenario;

    const loaded = parseSession(saved);

    expect(loaded.scenario).toBeUndefined();
    expect(loaded.ruleset?.name).toBe(LEGACY_GATE_TEST_RULESET_NAME);
    expect(isGateTestSession(loaded)).toBe(true);
  });

  it("does not mark an ordinary session without a rule-set", () => {
    expect(isGateTestSession({ scenario: undefined, ruleset: undefined })).toBe(false);
  });
});
