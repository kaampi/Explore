import { describe, expect, it } from "vitest";
import { newCharacterTemplate } from "@library/LibrarySchema";
import { CharacterTemplateSchema } from "@library/LibrarySchema";
import { copyCoreCharacter } from "../../src/integrations/coreBible";
import { applyCoreCharacterChanges, reviewCoreCharacter, sameCoreCharacter, snapshotCoreCharacter } from "../../src/integrations/coreCharacterUpdates";

const source = { workspaceId: "w", projectId: "p", entityRef: "person-1", revision: 2 };
const oldEntity = { entity_ref: "person-1", name: "Mira", personality: "Kind", looks: "Tall", referenceImages: [], facts: [{ predicate: "home", label: "Home", value: "North" }] };
const newEntity = { ...oldEntity, personality: "Brave", facts: [{ predicate: "home", label: "Home", value: "South" }, { predicate: "role", label: "Role", value: "Scout" }] };

describe("Core character updates", () => {
  it("persists the import baseline and keeps declined updates reviewable", () => {
    const original = CharacterTemplateSchema.parse(copyCoreCharacter(oldEntity, { ...source, revision: 1 }));
    const character = { ...original, personality: "Local" };
    const changes = reviewCoreCharacter(character, character.coreSnapshot!, newEntity);
    expect(changes.find(change => change.key === "fact:home")?.conflict).toBe(false);
    const updated = CharacterTemplateSchema.parse(applyCoreCharacterChanges(character, newEntity, ["fact:home"], source));
    expect(updated.lore).toHaveLength(1);
    expect(updated.lore[0]!.content).toContain("South");
    expect(updated.personality).toBe("Local");
    const remaining = reviewCoreCharacter(updated, updated.coreSnapshot!, newEntity);
    expect(remaining.map(change => change.key)).toEqual(["personality", "fact:role"]);
    expect(character.coreSnapshot).toEqual(snapshotCoreCharacter(oldEntity));
    expect(() => applyCoreCharacterChanges(updated, newEntity, ["personality"], { ...source, revision: 1 })).toThrow();
    expect(() => applyCoreCharacterChanges(character, { ...newEntity, entity_ref: "wrong" }, [], source)).toThrow();
  });
  it("matches stable provenance independent of revision", () => {
    const character = newCharacterTemplate({ name: "Mira", coreOrigin: { ...source, revision: 1 } });
    expect(sameCoreCharacter(character, source)).toBe(true);
    expect(sameCoreCharacter(character, { ...source, entityRef: "person-2" })).toBe(false);
  });

  it("detects local conflicts and does not mutate during review", () => {
    const character = newCharacterTemplate({ name: "Mira", personality: "Locally edited", coreOrigin: { ...source, revision: 1 } });
    const changes = reviewCoreCharacter(character, snapshotCoreCharacter(oldEntity), newEntity);
    expect(changes.find(c => c.key === "personality")?.conflict).toBe(true);
    expect(changes.some(c => c.key === "fact:role")).toBe(true);
    expect(character.personality).toBe("Locally edited");
  });

  it("applies only selected changes without replacing local fields or ID", () => {
    const character = newCharacterTemplate({ name: "Mira", personality: "Local", speech: "Soft", coreOrigin: { ...source, revision: 1 } });
    const updated = applyCoreCharacterChanges(character, newEntity, ["fact:role"], source);
    expect(updated.id).toBe(character.id);
    expect(updated.personality).toBe("Local");
    expect(updated.speech).toBe("Soft");
    expect(updated.lore.some(entry => entry.title === "Role")).toBe(true);
    expect(updated.coreOrigin?.revision).toBe(2);
    expect(character.lore).toHaveLength(0);
  });

  it("rejects updates from another Core entity", () => {
    const character = newCharacterTemplate({ name: "Mira", coreOrigin: { ...source, revision: 1 } });
    expect(() => applyCoreCharacterChanges(character, newEntity, [], { ...source, projectId: "other" })).toThrow();
  });
});
