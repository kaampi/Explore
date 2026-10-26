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


  it("allows holding two enemies with separate occupied arms", () => {
    const left = applyPhysicalChange(undefined, { kind: "set_relation", relation: {
      id: "left", subject: "player", subjectPart: "left_arm", relation: "restraining", target: "enemy_a", exclusive: true
    } });
    expect(left.ok).toBe(true);
    if (!left.ok) return;
    const right = applyPhysicalChange(left.state, { kind: "set_relation", relation: {
      id: "right", subject: "player", subjectPart: "right_arm", relation: "restraining", target: "enemy_b", exclusive: true
    } });
    expect(right.ok).toBe(true);
    if (!right.ok) return;
    expect(right.state.relations).toHaveLength(2);

    const third = applyPhysicalChange(right.state, { kind: "set_relation", relation: {
      id: "sword", subject: "player", subjectPart: "left_arm", relation: "holding", target: "sword", exclusive: true
    } });
    expect(third.ok).toBe(false);

    const freed = applyPhysicalChange(right.state, { kind: "remove_relation", id: "left" });
    expect(freed.ok).toBe(true);
    if (!freed.ok) return;
    const sword = applyPhysicalChange(freed.state, { kind: "set_relation", relation: {
      id: "sword", subject: "player", subjectPart: "left_arm", relation: "holding", target: "sword", exclusive: true
    } });
    expect(sword.ok).toBe(true);
  });

  it("does not assume human limb count or reserve ordinary contact", () => {
    const first = applyPhysicalChange(undefined, { kind: "set_relation", relation: {
      id: "arm8", subject: "alien", subjectPart: "arm_8", relation: "holding", target: "shield", exclusive: true
    } });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const contact = applyPhysicalChange(first.state, { kind: "set_relation", relation: {
      id: "contact", subject: "alien", subjectPart: "arm_8", relation: "touching", target: "wall"
    } });
    expect(contact.ok).toBe(true);
  });

  it("supports mounted motion relative to a horse", () => {
    const state: PhysicalState = { stances: {}, relations: [{
      id: "mount", subject: "player", relation: "beside", target: "horse", note: "hanging from the left side"
    }] };
    const moved = applyPhysicalChange(state, { kind: "stance", actor: "horse", stance: "moving" });
    expect(moved.ok && moved.state.relations[0]?.note).toBe("hanging from the left side");
  });
});
