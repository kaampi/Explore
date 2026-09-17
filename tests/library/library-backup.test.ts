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
