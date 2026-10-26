import { describe, expect, it } from "vitest";
import { applyPhysicalChange, describePhysicalState, type PhysicalChange } from "../../src/state/physicalContinuity";
import { validateAnatomicalRelation } from "../../src/state/anatomy";
import type { PhysicalState, Session } from "../../src/state/StateSchema";

/**
 * Deterministic 50-turn playthrough of the physical state engine.
 * This is deliberately model-free: it verifies canonical state transitions,
 * rejected impossible actions and prompt summaries, not LLM narration quality.
 */
describe("automated physical playthrough (50 turns)", () => {
  it("preserves two guards, weapon constraints, eight arms and unrelated scene state", () => {
    const alienParts = Array.from({ length: 8 }, (_, i) => ({
      id: "arm_" + (i + 1), label: "Arm " + (i + 1), capabilities: ["grasp" as const]
    }));
    const anatomy = {
      characters: { alien: { anatomyTemplateId: "eight" } },
      anatomyTemplates: { eight: { id: "eight", name: "Eight arms", version: 1, parts: alienParts } }
    } as unknown as Pick<Session, "characters" | "anatomyTemplates">;
    let state: PhysicalState | undefined;
    let accepted = 0;
    let rejected = 0;
    const step = (change: PhysicalChange, shouldSucceed = true) => {
      if (change.kind === "set_relation") {
        const problem = validateAnatomicalRelation(anatomy, change.relation);
        if (problem) {
          expect(shouldSucceed).toBe(false);
          rejected++;
          return;
        }
      }
      const before = state === undefined ? undefined : JSON.stringify(state);
      const result = applyPhysicalChange(state, change);
      expect(result.ok).toBe(shouldSucceed);
      if (result.ok) {
        state = result.state;
        accepted++;
      } else {
        rejected++;
        expect(JSON.stringify(state)).toBe(before);
      }
    };
    const grip = (id: string, subject: string, part: string, target: string): PhysicalChange => ({
      kind: "set_relation",
      relation: { id, subject, subjectPart: part, relation: "holding", target, exclusive: true }
    });
    const release = (id: string): PhysicalChange => ({ kind: "remove_relation", id });
    // Turns 1–5: two guards restrained, and an alien uses independent arms.
    step(grip("left", "player", "left_arm", "guard_a"));
    step(grip("right", "player", "right_arm", "guard_b"));
    step(grip("alien-1", "alien", "arm_1", "shield"));
    step(grip("alien-2", "alien", "arm_2", "rope"));
    step(grip("alien-8", "alien", "arm_8", "sword"));
    // Turns 6–10: conflicts do not mutate state; invalid anatomy is rejected.
    step(grip("illegal-left", "player", "left_arm", "dagger"), false);
    step(grip("illegal-right", "player", "right_arm", "bow"), false);
    step(grip("illegal-alien", "alien", "arm_8", "torch"), false);
    step(grip("absent-arm", "alien", "arm_9", "torch"), false);
    step(release("nonexistent"), false);
    // Turns 11–40: background movement never breaks persistent grips.
    for (let turn = 11; turn <= 40; turn++) {
      step({ kind: "stance", actor: "bystander_" + turn, stance: turn % 2 ? "moving" : "standing" });
      expect(state?.relations.map((r) => r.id).sort()).toEqual(
        ["alien-1", "alien-2", "alien-8", "left", "right"]
      );
      const focus = describePhysicalState(state, 3, ["player"]);
      expect(focus).toHaveLength(2);
      expect(focus.join(" ")).toContain("left_arm");
      expect(focus.join(" ")).toContain("right_arm");
      expect(focus.join(" ")).not.toContain("alien");
    }
    // Turns 41–45: explicit release, sword draw, and independent alien movement.
    step(release("left"));
    step(grip("player-sword", "player", "left_arm", "sword"));
    step({ kind: "stance", actor: "alien", stance: "crouching" });
    step(release("alien-8"));
    step(grip("alien-torch", "alien", "arm_8", "torch"));
    // Turns 46–50: the original guard remains held until explicitly released.
    step(grip("wrong-sword", "player", "left_arm", "axe"), false);
    step(release("right"));
    step(grip("player-bow", "player", "right_arm", "bow"));
    step(release("player-sword"));
    step(grip("player-axe", "player", "left_arm", "axe"));
    expect(accepted + rejected).toBe(50);
    expect(rejected).toBe(6);
    expect(state?.relations.map((r) => r.id).sort()).toEqual(
      ["alien-1", "alien-2", "alien-torch", "player-axe", "player-bow"]
    );
    expect(describePhysicalState(state, 2, ["player"]).every((line) => line.includes("occupied"))).toBe(true);
  });
});
