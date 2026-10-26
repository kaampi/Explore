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

describe("multi-turn occupied-limb continuity", () => {
  it("keeps two restraints over unrelated turns and requires release before a sword grip", () => {
    const left = applyPhysicalChange(undefined, { kind: "set_relation", relation: {
      id: "left-grip", subject: "player", subjectPart: "left_arm", relation: "restraining",
      target: "guard_a", exclusive: true
    } });
    expect(left.ok).toBe(true);
    if (!left.ok) return;
    const right = applyPhysicalChange(left.state, { kind: "set_relation", relation: {
      id: "right-grip", subject: "player", subjectPart: "right_arm", relation: "restraining",
      target: "guard_b", exclusive: true
    } });
    expect(right.ok).toBe(true);
    if (!right.ok) return;
    const nextTurn = applyPhysicalChange(right.state, { kind: "stance", actor: "guard_c", stance: "moving" });
    expect(nextTurn.ok).toBe(true);
    if (!nextTurn.ok) return;
    expect(nextTurn.state.relations).toHaveLength(2);
    expect(describePhysicalState(nextTurn.state).filter((line) => line.includes("[exclusive: part occupied until release]"))).toHaveLength(2);
    const sword = { id: "sword-grip", subject: "player", subjectPart: "left_arm",
      relation: "holding" as const, target: "sword", exclusive: true };
    const denied = applyPhysicalChange(nextTurn.state, { kind: "set_relation", relation: sword });
    expect(denied.ok).toBe(false);
    const duplicate = applyPhysicalChange(nextTurn.state, { kind: "set_relation", relation: {
      id: "duplicate", subject: "player", subjectPart: "left_arm", relation: "restraining",
      target: "guard_a", exclusive: true
    } });
    expect(duplicate.ok).toBe(false);
    const released = applyPhysicalChange(nextTurn.state, { kind: "remove_relation", id: "left-grip" });
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    const drawn = applyPhysicalChange(released.state, { kind: "set_relation", relation: sword });
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    expect(drawn.state.relations.map((relation) => relation.id).sort()).toEqual(["right-grip", "sword-grip"]);
  });

  it("lets an eight-armed creature use an independent arm while two are occupied", () => {
    let state: PhysicalState | undefined;
    for (const [id, arm] of [["grip-a", "arm_1"], ["grip-b", "arm_2"], ["grip-c", "arm_8"]]) {
      const result = applyPhysicalChange(state, { kind: "set_relation", relation: {
        id, subject: "alien", subjectPart: arm, relation: "holding",
        target: id, exclusive: true
      } });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      state = result.state;
    }
    expect(state?.relations).toHaveLength(3);
  });
});
