import { LorebookSchema, type Lorebook } from "../lore/LorebookSchema";
import {
  parseCampaignTemplate,
  parseObjectTemplate,
  parsePlaceTemplate,
  parseRealmTemplate,
  parseRulesetTemplate,
  parseStoryTemplate,
  parseVoiceTemplate,
  recoverCharacterTemplate,
  type CampaignTemplate,
  type CharacterTemplate,
  type ObjectTemplate,
  type PlaceTemplate,
  type RealmTemplate,
  type RulesetTemplate,
  type StoryTemplate,
  type VoiceTemplate
} from "./LibrarySchema";

export const LIBRARY_BACKUP_KIND = "ai-sandbox-library";
export const LIBRARY_BACKUP_FORMAT = 2;

export type LibraryBackup = {
  kind: typeof LIBRARY_BACKUP_KIND;
  format: number;
  exportedAt: string;
  characters: CharacterTemplate[];
  places: PlaceTemplate[];
  realms: RealmTemplate[];
  stories: StoryTemplate[];
  voices: VoiceTemplate[];
  rulesets: RulesetTemplate[];
  objects: ObjectTemplate[];
  campaigns: CampaignTemplate[];
  lorebooks?: Lorebook[];
};

export type LibraryBackupStore = {
  listLorebooks?(): Promise<{ entries: Lorebook[]; unreadable: number }>;
  saveLorebook?(book: Lorebook): Promise<void>;
  listCharacters(): Promise<CharacterTemplate[]>;
  listPlaces(): Promise<PlaceTemplate[]>;
  listRealms(): Promise<RealmTemplate[]>;
  listStories(): Promise<StoryTemplate[]>;
  listVoices(): Promise<VoiceTemplate[]>;
  listRulesets(): Promise<RulesetTemplate[]>;
  listObjects(): Promise<ObjectTemplate[]>;
  listCampaigns(): Promise<CampaignTemplate[]>;
  saveCharacter(template: CharacterTemplate): Promise<void>;
  savePlace(template: PlaceTemplate): Promise<void>;
  saveRealm(template: RealmTemplate): Promise<void>;
  saveStory(template: StoryTemplate): Promise<void>;
  saveVoice(template: VoiceTemplate): Promise<void>;
  saveRuleset(template: RulesetTemplate): Promise<void>;
  saveObject(template: ObjectTemplate): Promise<void>;
  saveCampaign(template: CampaignTemplate): Promise<void>;
};

export type RestoreReport = {
  saved: number;
  skipped: number;
};

export class LibraryBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryBackupError";
  }
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function emptyBackup(exportedAt: string): LibraryBackup {
  return {
    kind: LIBRARY_BACKUP_KIND,
    format: LIBRARY_BACKUP_FORMAT,
    exportedAt,
    characters: [],
    places: [],
    realms: [],
    stories: [],
    voices: [],
    rulesets: [],
    objects: [],
    lorebooks: [],
    campaigns: []
  };
}

export async function collectLibraryBackup(store: LibraryBackupStore): Promise<LibraryBackup> {
  const [characters, places, realms, stories, voices, rulesets, objects, campaigns, lorebooks] = await Promise.all([
    store.listCharacters(),
    store.listPlaces(),
    store.listRealms(),
    store.listStories(),
    store.listVoices(),
    store.listRulesets(),
    store.listObjects(),
    store.listCampaigns(),
    store.listLorebooks?.() ?? Promise.resolve({ entries: [], unreadable: 0 })
  ]);
  if (lorebooks.unreadable) throw new LibraryBackupError("Some lorebooks could not be read. Export originals individually before replacing storage.");
  return {
    lorebooks: lorebooks.entries,
    kind: LIBRARY_BACKUP_KIND,
    format: LIBRARY_BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    characters,
    places,
    realms,
    stories,
    voices,
    rulesets,
    objects,
    campaigns
  };
}

export function parseLibraryBackup(input: unknown): { backup: LibraryBackup; skipped: number } {
  if (!input || typeof input !== "object") {
    throw new LibraryBackupError("That file is not a library backup.");
  }
  const row = input as Record<string, unknown>;
  if (row.kind !== LIBRARY_BACKUP_KIND) {
    throw new LibraryBackupError("That file is not a library backup. Export from Backup in the top bar.");
  }
  const backup = emptyBackup(typeof row.exportedAt === "string" ? row.exportedAt : new Date().toISOString());
  backup.format = typeof row.format === "number" ? row.format : LIBRARY_BACKUP_FORMAT;
  let skipped = 0;

  const take = <T>(raw: unknown, parse: (item: unknown) => T | null): T[] => {
    const out: T[] = [];
    for (const item of asList(raw)) {
      try {
        const parsed = parse(item);
        if (parsed) out.push(parsed);
        else skipped += 1;
      } catch {
        skipped += 1;
      }
    }
    return out;
  };

  backup.lorebooks = take(row.lorebooks, item => LorebookSchema.parse(item));
  backup.characters = take(row.characters, recoverCharacterTemplate);
  backup.places = take(row.places, (item) => parsePlaceTemplate(item));
  backup.realms = take(row.realms, (item) => parseRealmTemplate(item));
  backup.stories = take(row.stories, (item) => parseStoryTemplate(item));
  backup.voices = take(row.voices, (item) => parseVoiceTemplate(item));
  backup.rulesets = take(row.rulesets, (item) => parseRulesetTemplate(item));
  backup.objects = take(row.objects, (item) => parseObjectTemplate(item));
  backup.campaigns = take(row.campaigns, (item) => parseCampaignTemplate(item));
  return { backup, skipped };
}

export async function restoreLibraryBackup(
  store: LibraryBackupStore,
  backup: LibraryBackup
): Promise<RestoreReport> {
  let saved = 0;
  let skipped = 0;

  const write = async (run: () => Promise<void>) => {
    try {
      await run();
      saved += 1;
    } catch {
      skipped += 1;
    }
  };

  for (const item of backup.realms) await write(() => store.saveRealm(item));
  for (const item of backup.places) await write(() => store.savePlace(item));
  for (const item of backup.characters) await write(() => store.saveCharacter(item));
  for (const item of backup.stories) await write(() => store.saveStory(item));
  for (const item of backup.voices) await write(() => store.saveVoice(item));
  for (const item of backup.rulesets) await write(() => store.saveRuleset(item));
  for (const item of backup.objects) await write(() => store.saveObject(item));
  for (const item of backup.campaigns) await write(() => store.saveCampaign(item));
  for (const item of backup.lorebooks ?? []) await write(async () => {
    if (!store.saveLorebook) throw new Error("Lorebook storage is not available.");
    await store.saveLorebook(item);
  });

  return { saved, skipped };
}

export function backupFilename(exportedAt: string): string {
  const day = exportedAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
  return `sandbox-library-${day}.json`;
}

