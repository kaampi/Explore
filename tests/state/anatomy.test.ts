import { describe, expect, it } from "vitest";
import { pinSessionAnatomy, validateAnatomicalRelation } from "../../src/state/anatomy";
import type { Session } from "../../src/state/StateSchema";
import { AnatomyTemplateSchema } from "../../src/state/StateSchema";
import { BUILTIN_ANATOMY_TEMPLATES } from "../../src/state/builtinAnatomy";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";

it("offers built-in anatomy on a fresh installation alongside saved custom plans", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "anatomy-options");
  const initial = await repo.listAnatomyTemplates();
  expect(initial).toHaveLength(11);
  expect(initial.some(template => template.id === "builtin-humanoid")).toBe(true);
  const custom = { ...initial[0]!, id: "custom-body", name: "My body plan" };
  await repo.saveAnatomyTemplate(custom);
  const options = await repo.listAnatomyTemplates();
  expect(options).toHaveLength(12);
  const pinned = pinSessionAnatomy({ characters: { hero: { anatomyTemplateId: "builtin-humanoid" } } } as unknown as Session, options);
  expect(pinned.anatomyTemplates?.["builtin-humanoid"]?.parts.length).toBeGreaterThan(0);
});

describe("built-in body plan functions", () => {
  it.each(BUILTIN_ANATOMY_TEMPLATES)("provides valid movement and sensory functions for $name", template => {
    expect(AnatomyTemplateSchema.safeParse(template).success).toBe(true);
    expect(template.version).toBe(2);
    expect(template.parts.some(part => part.capabilities.includes("locomote"))).toBe(true);
    expect(template.parts.some(part => part.capabilities.includes("sense"))).toBe(true);
    expect(new Set(template.parts.map(part => part.id)).size).toBe(template.parts.length);
  });

  it("distinguishes grasping limbs from walking limbs and ordinary tails", () => {
    const functionsFor = (plan: string, part: string) => BUILTIN_ANATOMY_TEMPLATES.find(template => template.id === `builtin-${plan}`)?.parts.find(item => item.id === part)?.capabilities;
    expect(functionsFor("humanoid", "left_eye")).toEqual(["sense"]);
    expect(functionsFor("equine", "front_left_hoof")).toEqual(["support", "locomote"]);
    expect(functionsFor("quadruped", "tail")).not.toContain("grasp");
    expect(functionsFor("cephalopod", "arm_8")).toEqual(expect.arrayContaining(["grasp", "manipulate", "locomote"]));
    expect(functionsFor("serpentine", "belly")).toContain("locomote");
    expect(functionsFor("avian", "left_wing")).toEqual(["locomote"]);
    expect(functionsFor("dragon", "horns")).toEqual([]);
  });
});

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

describe("session anatomy pinning", () => {
  it("copies the selected body plan without sharing mutable library objects", () => {
    const template = anatomy.anatomyTemplates?.alien;
    expect(template).toBeDefined();
    if (!template) return;
    const session = { characters: anatomy.characters } as unknown as Session;
    const pinned = pinSessionAnatomy(session, [template]);
    expect(pinned.anatomyTemplates?.alien?.parts).toHaveLength(8);
    expect(pinned.anatomyTemplates?.alien).not.toBe(template);
    expect(validateAnatomicalRelation(pinned, {
      id: "bad", subject: "alien_a", subjectPart: "arm_9", relation: "holding", target: "sword"
    })).toContain("arm_9");
  });
});
