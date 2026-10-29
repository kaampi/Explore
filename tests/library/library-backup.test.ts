import { describe, it, expect } from "vitest";
import {
  LIBRARY_BACKUP_KIND,
  parseLibraryBackup,
  restoreLibraryBackup,
  type LibraryBackupStore
} from "@library/libraryBackup";
import { exampleCharacterTemplate, exampleVoiceTemplates } from "@library/exampleTemplates";

function memoryStore(seed: Partial<LibraryBackupStore> = {}): LibraryBackupStore & { voices: unknown[] } {
  const voices: unknown[] = [];
  return {
    voices,
    listCharacters: async () => [],
    listPlaces: async () => [],
    listRealms: async () => [],
    listStories: async () => [],
    listVoices: async () => [],
    listRulesets: async () => [],
    listObjects: async () => [],
    listCampaigns: async () => [],
    saveCharacter: async () => undefined,
    savePlace: async () => undefined,
    saveRealm: async () => undefined,
    saveStory: async () => undefined,
    saveVoice: async (item) => {
      voices.push(item);
    },
    saveRuleset: async () => undefined,
    saveObject: async () => undefined,
    saveCampaign: async () => undefined,
    ...seed
  };
}

describe("library backup", () => {
  it("rejects a lone character card as a full backup", () => {
    expect(() => parseLibraryBackup(exampleCharacterTemplate())).toThrow(/not a library backup/i);
  });

  it("restores voices and skips a broken row", async () => {
    const voice = exampleVoiceTemplates()[0]!;
    const { backup, skipped } = parseLibraryBackup({
      kind: LIBRARY_BACKUP_KIND,
      format: 1,
      exportedAt: "2026-09-06T00:00:00.000Z",
      voices: [voice, { id: "bad" }],
      characters: []
    });
    expect(skipped).toBe(1);
    expect(backup.voices).toHaveLength(1);
    const store = memoryStore();
    const report = await restoreLibraryBackup(store, backup);
    expect(report.saved).toBe(1);
    expect(store.voices).toHaveLength(1);
  });
});


it("round-trips all character images and morph settings in full and individual exports", async () => {
  const { collectLibraryBackup, collectCharacterBackup } = await import("@library/libraryBackup");
  const { IndexedDBRepository } = await import("../../src/persistence/IndexedDBRepository");
  const { IDBFactory } = await import("fake-indexeddb");
  const source = new IndexedDBRepository(new IDBFactory(), "source");
  const card = exampleCharacterTemplate();
  const profile = {
    version: 1, active: true,
    gallery: [{ id: "photo", name: "Photo", image: "data:image/png;base64,YQ==", kind: "ordinary", emotion: "" }],
    expressions: [{ name: "happy", image: "data:image/png;base64,Yg==", points: [[0.2, 0.3]] }],
    triangles: [[0, 1, 2]], eyeCenters: { happy: [[0.3, 0.4], [0.6, 0.4]] },
    morphDurations: { "neutral:happy": 2500 }, eyeCorrections: { "neutral:happy": true }
  };
  await source.saveCharacter(card);
  await source.saveCharacterMorph(card.id, profile);
  for (const exported of [await collectLibraryBackup(source), await collectCharacterBackup(source, card)]) {
    const { backup, skipped } = parseLibraryBackup(JSON.parse(JSON.stringify(exported)));
    expect(skipped).toBe(0);
    const target = new IndexedDBRepository(new IDBFactory(), "target");
    const report = await restoreLibraryBackup(target, backup);
    expect(report.skipped).toBe(0);
    expect(await target.loadCharacterMorph(card.id)).toEqual(profile);
    expect((await target.listCharacters()).find(c => c.id === card.id)?.portraitDataUrl).toEqual(card.portraitDataUrl);
  }
});
it("keeps existing morphs when importing older cards without morph data", async () => {
  const { backup } = parseLibraryBackup({ kind: LIBRARY_BACKUP_KIND, format: 2, characters: [exampleCharacterTemplate()] });
  let changed = false;
  await restoreLibraryBackup(memoryStore({ saveCharacterMorph: async () => { changed = true; } }), backup);
  expect(changed).toBe(false);
});
