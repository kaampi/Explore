import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { copyCoreCharacter } from "../../src/integrations/coreBible";
import { CoreBibleSchema } from "../../src/integrations/coreBibleSchema";
import { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { newCharacterTemplate } from "@library/LibrarySchema";

const source = { workspaceId: "shared-workspace", projectId: "book-one", revision: 3 };
const entity = CoreBibleSchema.parse([{ kind: "characters", label: "Characters", entities: [{
  entity_ref: "emma", name: "Emma", pronoun: "she/her", approximateAge: 28,
  looks: "Dark coat", personality: "Curious", referenceImages: ["data:image/png;base64,AA=="],
  facts: [{ predicate: "core.identity", label: "Identity", value: "Bartender" }],
  brainstorm: "Never copy this", hidden_from_ai: true,
}] }])[0]!.entities[0]!;

describe("copying a shared Storybook character", () => {
  it("creates a separate Sandbox card with approved facts and provenance without replacing a local namesake", async () => {
    const repo = new IndexedDBRepository(new IDBFactory(), "core-character-import");
    const original = newCharacterTemplate({ name: "Emma", personality: "Local version" });
    await repo.saveCharacter(original);
    const card = copyCoreCharacter(entity, source);
    expect(card.id).not.toBe(original.id);
    expect(card.coreOrigin).toEqual({ ...source, entityRef: "emma" });
    expect(card.personality).toBe("Curious");
    expect(card.appearance).toBe("Dark coat");
    expect(card.pronoun).toBe("she/her");
    expect(card.approximateAge).toBe(28);
    expect(card.lore).toEqual([{ id: "core-fact-core.identity", title: "Identity", content: "Emma: Identity: Bartender", keywords: [] }]);
    expect(JSON.stringify(card)).not.toContain("Never copy this");
    await repo.saveCharacter(card);
    expect((await repo.loadCharacter(original.id)).personality).toBe("Local version");
    expect((await repo.loadCharacter(card.id)).coreOrigin).toEqual(card.coreOrigin);
    expect((await repo.listCharacters()).length).toBe(2);
  });

  it("omits unsupported portrait and profile fields instead of importing invalid data", () => {
    const card = copyCoreCharacter({ ...entity, pronoun: "x".repeat(40), approximateAge: 1000, referenceImages: ["https://example.test/portrait.png"] }, source);
    expect(card.pronoun).toBeUndefined();
    expect(card.approximateAge).toBeUndefined();
    expect(card.portraitDataUrl).toBeUndefined();
  });
});
