import { describe, expect, it } from "vitest";
import { validateAnatomicalRelation } from "../../src/state/anatomy";
import type { Session } from "../../src/state/StateSchema";

const anatomy = {
  anatomyTemplates: {
    alien: { id: "alien", name: "Eight-armed alien", version: 1, parts: [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `arm_${i + 1}`, label: `Arm ${i + 1}`, capabilities: ["grasp" as const] }))
    ] }
  },
  characters: {
    alien_a: {
      anatomyTemplateId: "alien",
      anatomyOverrides: { addedParts: ["tail_1"], removedParts: ["arm_3"] }
    }
  }
} as unknown as Pick<Session, "characters" | "anatomyTemplates">;

describe("anatomical body part validation", () => {
  const relation = (part: string) => ({
    id: "grip", subject: "alien_a", subjectPart: part,
    relation: "holding" as const, target: "sword", exclusive: true
  });
  it("accepts a valid eighth arm", () => {
    expect(validateAnatomicalRelation(anatomy, relation("arm_8"))).toBeUndefined();
  });
  it("rejects an absent ninth arm", () => {
    expect(validateAnatomicalRelation(anatomy, relation("arm_9"))).toContain("arm_9");
  });
  it("honors individual removals and additions", () => {
    expect(validateAnatomicalRelation(anatomy, relation("arm_3"))).toContain("arm_3");
    expect(validateAnatomicalRelation(anatomy, relation("tail_1"))).toBeUndefined();
  });
  it("keeps older characters without a template compatible", () => {
    expect(validateAnatomicalRelation({ characters: {}, anatomyTemplates: {} }, relation("arm_99"))).toBeUndefined();
  });
});
