import { describe, expect, it } from "vitest";
import { applyPhysicalChange, describePhysicalState } from "../../src/state/physicalContinuity";
import type { PhysicalState } from "../../src/state/StateSchema";

const initial: PhysicalState = { stances: { player: "standing", enemy: "standing" }, relations: [
  { id: "behind", subject: "player", relation: "behind", target: "enemy" },
  { id: "grip", subject: "player", subjectPart: "arms", relation: "restraining", target: "enemy", targetPart: "torso" },
  { id: "sword", subject: "player", subjectPart: "hand", relation: "blocking", target: "enemy_sword", targetPart: "hilt" }
] };

describe("physical continuity", () => {
  it("preserves a restraint and blocked sword across unrelated turns", () => {
    const result = applyPhysicalChange(initial, { kind: "stance", actor: "horse", stance: "moving" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.relations).toEqual(initial.relations);
    expect(describePhysicalState(result.state)).toContain("player.hand blocking enemy_sword.hilt");
  });

  it("rejects a contradictory position without explicitly removing the old fact", () => {
    const result = applyPhysicalChange(initial, { kind: "set_relation", relation: {
      id: "front", subject: "player", relation: "in_front_of", target: "enemy"
    } });
    expect(result.ok).toBe(false);
  });

  it("allows explicit transitions and independent multi-limb contacts", () => {
    const removed = applyPhysicalChange(initial, { kind: "remove_relation", id: "behind" });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    const moved = applyPhysicalChange(removed.state, { kind: "set_relation", relation: {
      id: "front", subject: "player", relation: "in_front_of", target: "enemy"
    } });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const alien = applyPhysicalChange(moved.state, { kind: "set_relation", relation: {
      id: "alien-grip", subject: "alien", subjectPart: "arm_8", relation: "holding", target: "saddle"
    } });
    expect(alien.ok).toBe(true);
  });

  it("supports mounted motion relative to a horse", () => {
    const state: PhysicalState = { stances: {}, relations: [{
      id: "mount", subject: "player", relation: "beside", target: "horse", note: "hanging from the left side"
    }] };
    const moved = applyPhysicalChange(state, { kind: "stance", actor: "horse", stance: "moving" });
    expect(moved.ok && moved.state.relations[0]?.note).toBe("hanging from the left side");
  });
});
