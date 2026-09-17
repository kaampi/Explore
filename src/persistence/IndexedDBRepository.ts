import { safeParseSession, type Session } from "@state/StateSchema";
import {
  parseCampaignTemplate,
  parseCharacterTemplate,
  recoverCharacterTemplate,
  parseObjectTemplate,
  parsePlaceTemplate,
  parseRealmTemplate,
  parseRulesetTemplate,
  parseStoryTemplate,
  parseVoiceTemplate,
  type CampaignTemplate,
  type CharacterTemplate,
  type ObjectTemplate,
  type PlaceTemplate,
  type RealmTemplate,
  type RulesetTemplate,
  type StoryTemplate,
  type VoiceTemplate
} from "@library/LibrarySchema";
import { migrate, needsMigration } from "./MigrationEngine";
import { dropOversizedPortrait, dropOversizedPortraitFromRaw } from "@library/slimPortrait";

/**
 * Persistence Layer — Master Spec §39.
 * IndexedDB as primary storage for session data. Writes are atomic
 * (single IDB transaction per operation — either the whole session
 * record is written or the transaction aborts and nothing changes).
 *
 * v2 adds character and place library stores. v3 adds stories (ground
 * story / campaign premise). v4 adds narrator voices. v5 adds campaign
 * rule-sets. v6 adds objects (named things that can be placed in a scene).
 * v7 adds campaigns (picks from the library; scenes are what you Start).
 * v8 adds studio prefs (which campaign to open after "new scene").
 * v9 adds realms (City of Dunbaar owns landmarks; focals stay on the place).
 * Templates live independently of any one session so they
 * survive "new scene".
 *
 * The IDBFactory is injectable so this class is testable under Node
 * with `fake-indexeddb`, while production code uses the real
 * `window.indexedDB` implicitly (default param below).
 */

const DB_NAME = "ai-sandbox-engine";
const STORE_NAME = "sessions";
const CHARACTERS_STORE = "characters";
const PLACES_STORE = "places";
const STORIES_STORE = "stories";
const VOICES_STORE = "voices";
const RULESETS_STORE = "rulesets";
const OBJECTS_STORE = "objects";
const CAMPAIGNS_STORE = "campaigns";
const REALMS_STORE = "realms";
const PREFS_STORE = "prefs";
const STUDIO_RESUME_ID = "studio-resume";
const DB_VERSION = 9;

export type StudioResume = {
  campaignId: string;
  sceneId?: string;
  /** Agreement from the last session. Survives new scene. Not the chat log. */
  handoff?: string;
};

type LibraryKind = "character" | "place" | "story" | "voice" | "ruleset" | "object" | "campaign" | "realm";

export class SessionNotFoundError extends Error {
  constructor(id: string) {
    super(`Session not found: ${id}`);
    this.name = "SessionNotFoundError";
  }
}

export class SchemaValidationError extends Error {
  constructor(id: string, issues: string) {
    super(`Session ${id} failed schema validation on load: ${issues}`);
    this.name = "SchemaValidationError";
  }
}

export class LibraryItemNotFoundError extends Error {
  constructor(kind: LibraryKind, id: string) {
    super(`${kind} not found: ${id}`);
    this.name = "LibraryItemNotFoundError";
  }
}

export class TemplateValidationError extends Error {
  constructor(kind: LibraryKind, issues: string) {
    super(`${kind} template failed schema validation: ${issues}`);
    this.name = "TemplateValidationError";
  }
}

function ensureStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    db.createObjectStore(STORE_NAME, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(CHARACTERS_STORE)) {
    db.createObjectStore(CHARACTERS_STORE, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(PLACES_STORE)) {
    db.createObjectStore(PLACES_STORE, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(STORIES_STORE)) {
    db.createObjectStore(STORIES_STORE, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(VOICES_STORE)) {
    db.createObjectStore(VOICES_STORE, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(RULESETS_STORE)) {
    db.createObjectStore(RULESETS_STORE, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(OBJECTS_STORE)) {
    db.createObjectStore(OBJECTS_STORE, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(CAMPAIGNS_STORE)) {
    db.createObjectStore(CAMPAIGNS_STORE, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(REALMS_STORE)) {
    db.createObjectStore(REALMS_STORE, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(PREFS_STORE)) {
    db.createObjectStore(PREFS_STORE, { keyPath: "id" });
  }
}

export class IndexedDBRepository {
  private db: IDBDatabase | undefined;
  private opening: Promise<IDBDatabase> | undefined;

  constructor(
    private idbFactory: IDBFactory = globalThis.indexedDB,
    private dbName: string = DB_NAME,
    private dbVersion: number = DB_VERSION
  ) {}

  private async open(): Promise<IDBDatabase> {
    if (this.db && this.isUsable(this.db)) return this.db;
    if (this.opening) return this.opening;
    this.opening = this.openFresh().finally(() => {
      this.opening = undefined;
    });
    return this.opening;
  }

  private isUsable(db: IDBDatabase): boolean {
    if (db.version < this.dbVersion) return false;
    try {
      db.transaction(STORE_NAME, "readonly");
      return true;
    } catch {
      return false;
    }
  }

  private openFresh(): Promise<IDBDatabase> {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // Already closed after a versionchange from Vite HMR or another tab.
      }
      this.db = undefined;
    }

    return new Promise((resolve, reject) => {
      const request = this.idbFactory.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = () => {
        // Object-store creation only. Per-record session schema migration
        // happens in loadSession() via MigrationEngine.
        ensureStores(request.result);
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          if (this.db === db) this.db = undefined;
        };
        db.onclose = () => {
          if (this.db === db) this.db = undefined;
        };
        this.db = db;
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
    });
  }

  /**
   * Atomic write: the session is validated against the canonical schema
   * *before* the transaction opens, and the write is a single put() in a
   * single readwrite transaction — it either commits in full or not at all.
   */
  async saveSession(session: Session): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(session);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error(`Failed to save session ${session.id}.`));
      tx.onabort = () => reject(tx.error ?? new Error(`Save transaction aborted for session ${session.id}.`));
    });
  }

  /**
   * Loads a session, migrating it to the current schema if it's older
   * (§43), then validating the result against the canonical schema.
   * A record that still fails validation after migration throws rather
   * than returning data the rest of the system can't trust (§51
   * invariant 8: imported/loaded data must be schema-validated).
   *
   * Note: migration happens in memory only. Callers that want the
   * migrated shape persisted should call saveSession() with the result.
   */
  async loadSession(id: string): Promise<Session> {
    const db = await this.open();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error(`Failed to load session ${id}.`));
    });

    if (raw === undefined) {
      throw new SessionNotFoundError(id);
    }

    const record = raw as Record<string, unknown>;
    const migrated = needsMigration(record) ? migrate(record) : record;

    const parsed = safeParseSession(migrated);
    if (!parsed.success) {
      throw new SchemaValidationError(id, parsed.error.message);
    }
    return dropSessionPortraits(parsed.data);
  }

  async deleteSession(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error(`Failed to delete session ${id}.`));
    });
  }

  async listSessionIds(): Promise<string[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAllKeys();
      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error ?? new Error("Failed to list session ids."));
    });
  }

  /** Closes the underlying connection. Mainly useful for test teardown. */
  async close(): Promise<void> {
    this.opening = undefined;
    if (!this.db) return;
    this.db.close();
    this.db = undefined;
  }

  async saveCharacter(template: CharacterTemplate): Promise<void> {
    const parsed = parseLibraryTemplate("character", dropOversizedPortrait(template), parseCharacterTemplate);
    await this.putRecord(CHARACTERS_STORE, parsed);
  }

  async loadCharacter(id: string): Promise<CharacterTemplate> {
    const raw = await this.getRecord(CHARACTERS_STORE, id);
    if (raw === undefined) throw new LibraryItemNotFoundError("character", id);
    return parseLibraryTemplate("character", raw, parseCharacterTemplate);
  }

  async deleteCharacter(id: string): Promise<void> {
    await this.deleteRecord(CHARACTERS_STORE, id);
  }

  async listCharacters(): Promise<CharacterTemplate[]> {
    return (await this.listCharacterCatalog()).items;
  }

  /** Includes rows that fail schema, so Studio can say the archive is not empty. */
  async listCharacterCatalog(): Promise<{ items: CharacterTemplate[]; skipped: number }> {
    return this.withDb(async (db) => {
      if (!db.objectStoreNames.contains(CHARACTERS_STORE)) return { items: [], skipped: 0 };
      return new Promise((resolve, reject) => {
        const tx = db.transaction(CHARACTERS_STORE, "readwrite");
        const store = tx.objectStore(CHARACTERS_STORE);
        const parsed: CharacterTemplate[] = [];
        let skipped = 0;
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const slimRaw = dropOversizedPortraitFromRaw(cursor.value);
          const item = recoverCharacterTemplate(slimRaw);
          if (item) {
            parsed.push(item);
            if (slimRaw !== cursor.value) cursor.update(item);
          } else {
            skipped += 1;
            console.warn("Skipped unreadable character row", cursor.key);
          }
          cursor.continue();
        };
        request.onerror = () => reject(request.error ?? new Error("Failed to list character."));
        tx.oncomplete = () => {
          parsed.sort((a, b) => a.name.localeCompare(b.name));
          resolve({ items: parsed, skipped });
        };
        tx.onerror = () => reject(tx.error ?? new Error("Failed to list characters."));
      });
    });
  }

  async savePlace(template: PlaceTemplate): Promise<void> {
    const parsed = parseLibraryTemplate("place", template, parsePlaceTemplate);
    await this.putRecord(PLACES_STORE, parsed);
  }

  async loadPlace(id: string): Promise<PlaceTemplate> {
    const raw = await this.getRecord(PLACES_STORE, id);
    if (raw === undefined) throw new LibraryItemNotFoundError("place", id);
    return parseLibraryTemplate("place", raw, parsePlaceTemplate);
  }

  async deletePlace(id: string): Promise<void> {
    await this.deleteRecord(PLACES_STORE, id);
  }

  async listPlaces(): Promise<PlaceTemplate[]> {
    const rows = await this.getAllRecords(PLACES_STORE);
    return parseLibraryList("place", rows, parsePlaceTemplate);
  }

  async saveRealm(template: RealmTemplate): Promise<void> {
    const parsed = parseLibraryTemplate("realm", template, parseRealmTemplate);
    await this.putRecord(REALMS_STORE, parsed);
  }

  async loadRealm(id: string): Promise<RealmTemplate> {
    const raw = await this.getRecord(REALMS_STORE, id);
    if (raw === undefined) throw new LibraryItemNotFoundError("realm", id);
    return parseLibraryTemplate("realm", raw, parseRealmTemplate);
  }

  async deleteRealm(id: string): Promise<void> {
    await this.deleteRecord(REALMS_STORE, id);
  }

  async listRealms(): Promise<RealmTemplate[]> {
    const rows = await this.getAllRecords(REALMS_STORE);
    return parseLibraryList("realm", rows, parseRealmTemplate);
  }

  async saveStory(template: StoryTemplate): Promise<void> {
    const parsed = parseLibraryTemplate("story", template, parseStoryTemplate);
    await this.putRecord(STORIES_STORE, parsed);
  }

  async loadStory(id: string): Promise<StoryTemplate> {
    const raw = await this.getRecord(STORIES_STORE, id);
    if (raw === undefined) throw new LibraryItemNotFoundError("story", id);
    return parseLibraryTemplate("story", raw, parseStoryTemplate);
  }

  async deleteStory(id: string): Promise<void> {
    await this.deleteRecord(STORIES_STORE, id);
  }

  async listStories(): Promise<StoryTemplate[]> {
    const rows = await this.getAllRecords(STORIES_STORE);
    return parseLibraryList("story", rows, parseStoryTemplate);
  }

  async saveVoice(template: VoiceTemplate): Promise<void> {
    const parsed = parseLibraryTemplate("voice", template, parseVoiceTemplate);
    await this.putRecord(VOICES_STORE, parsed);
  }

  async loadVoice(id: string): Promise<VoiceTemplate> {
    const raw = await this.getRecord(VOICES_STORE, id);
    if (raw === undefined) throw new LibraryItemNotFoundError("voice", id);
    return parseLibraryTemplate("voice", raw, parseVoiceTemplate);
  }

  async deleteVoice(id: string): Promise<void> {
    await this.deleteRecord(VOICES_STORE, id);
  }

  async listVoices(): Promise<VoiceTemplate[]> {
    const rows = await this.getAllRecords(VOICES_STORE);
    return parseLibraryList("voice", rows, parseVoiceTemplate);
  }

  async saveRuleset(template: RulesetTemplate): Promise<void> {
    const parsed = parseLibraryTemplate("ruleset", template, parseRulesetTemplate);
    await this.putRecord(RULESETS_STORE, parsed);
  }

  async loadRuleset(id: string): Promise<RulesetTemplate> {
    const raw = await this.getRecord(RULESETS_STORE, id);
    if (raw === undefined) throw new LibraryItemNotFoundError("ruleset", id);
    return parseLibraryTemplate("ruleset", raw, parseRulesetTemplate);
  }

  async deleteRuleset(id: string): Promise<void> {
    await this.deleteRecord(RULESETS_STORE, id);
  }

  async listRulesets(): Promise<RulesetTemplate[]> {
    const rows = await this.getAllRecords(RULESETS_STORE);
    return parseLibraryList("ruleset", rows, parseRulesetTemplate);
  }

  async saveObject(template: ObjectTemplate): Promise<void> {
    const parsed = parseLibraryTemplate("object", template, parseObjectTemplate);
    await this.putRecord(OBJECTS_STORE, parsed);
  }

  async loadObject(id: string): Promise<ObjectTemplate> {
    const raw = await this.getRecord(OBJECTS_STORE, id);
    if (raw === undefined) throw new LibraryItemNotFoundError("object", id);
    return parseLibraryTemplate("object", raw, parseObjectTemplate);
  }

  async deleteObject(id: string): Promise<void> {
    await this.deleteRecord(OBJECTS_STORE, id);
  }

  async listObjects(): Promise<ObjectTemplate[]> {
    const rows = await this.getAllRecords(OBJECTS_STORE);
    return parseLibraryList("object", rows, parseObjectTemplate);
  }

  async saveCampaign(template: CampaignTemplate): Promise<void> {
    const parsed = parseLibraryTemplate("campaign", template, parseCampaignTemplate);
    await this.putRecord(CAMPAIGNS_STORE, parsed);
  }

  async loadCampaign(id: string): Promise<CampaignTemplate> {
    const raw = await this.getRecord(CAMPAIGNS_STORE, id);
    if (raw === undefined) throw new LibraryItemNotFoundError("campaign", id);
    return parseLibraryTemplate("campaign", raw, parseCampaignTemplate);
  }

  async deleteCampaign(id: string): Promise<void> {
    await this.deleteRecord(CAMPAIGNS_STORE, id);
  }

  async listCampaigns(): Promise<CampaignTemplate[]> {
    const rows = await this.getAllRecords(CAMPAIGNS_STORE);
    return parseLibraryList("campaign", rows, parseCampaignTemplate);
  }

  async saveStudioResume(resume: StudioResume): Promise<void> {
    const campaignId = resume.campaignId.trim();
    if (!campaignId) {
      await this.clearStudioResume();
      return;
    }
    const sceneId = resume.sceneId?.trim();
    const handoff = resume.handoff?.trim();
    await this.putRecord(PREFS_STORE, {
      id: STUDIO_RESUME_ID,
      campaignId,
      ...(sceneId ? { sceneId } : {}),
      ...(handoff ? { handoff } : {})
    });
  }

  async loadStudioResume(): Promise<StudioResume | null> {
    const raw = await this.getRecord(PREFS_STORE, STUDIO_RESUME_ID);
    if (!raw || typeof raw !== "object") return null;
    const campaignId = "campaignId" in raw && typeof raw.campaignId === "string" ? raw.campaignId.trim() : "";
    if (!campaignId) return null;
    const sceneId = "sceneId" in raw && typeof raw.sceneId === "string" ? raw.sceneId.trim() : "";
    const handoff = "handoff" in raw && typeof raw.handoff === "string" ? raw.handoff.trim() : "";
    return {
      campaignId,
      ...(sceneId ? { sceneId } : {}),
      ...(handoff ? { handoff } : {})
    };
  }

  async clearStudioResume(): Promise<void> {
    await this.deleteRecord(PREFS_STORE, STUDIO_RESUME_ID);
  }

  private async withDb<T>(work: (db: IDBDatabase) => Promise<T>): Promise<T> {
    try {
      return await work(await this.open());
    } catch (err) {
      if (!isStaleConnection(err)) throw err;
      this.db = undefined;
      return await work(await this.open());
    }
  }

  private async putRecord(storeName: string, value: unknown): Promise<void> {
    const payload = cloneRecord(value);
    return this.withDb((db) => {
      if (!db.objectStoreNames.contains(storeName)) {
        return Promise.reject(new Error(`Missing store ${storeName}.`));
      }
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(payload);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(writeError(storeName, tx.error));
        tx.onabort = () => reject(writeError(storeName, tx.error));
      });
    });
  }

  private async getRecord(storeName: string, id: string): Promise<unknown> {
    return this.withDb(async (db) => {
      if (!db.objectStoreNames.contains(storeName)) return undefined;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).get(id);
        request.onsuccess = () => resolve(cloneRecord(request.result));
        request.onerror = () => reject(request.error ?? new Error(`Failed to read ${storeName}.`));
      });
    });
  }

  private async getAllRecords(storeName: string): Promise<unknown[]> {
    return this.withDb(async (db) => {
      if (!db.objectStoreNames.contains(storeName)) return [];
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const rows: unknown[] = [];
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve(rows);
            return;
          }
          rows.push(cloneRecord(cursor.value));
          cursor.continue();
        };
        request.onerror = () => reject(request.error ?? new Error(`Failed to list ${storeName}.`));
      });
    });
  }

  private async deleteRecord(storeName: string, id: string): Promise<void> {
    return this.withDb(async (db) => {
      if (!db.objectStoreNames.contains(storeName)) return;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error(`Failed to delete from ${storeName}.`));
      });
    });
  }
}

function isStaleConnection(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "name" in err &&
      (err.name === "InvalidStateError" || err.name === "InvalidAccessError")
  );
}

function cloneRecord<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return structuredClone(value);
}

function dropSessionPortraits(session: Session): Session {
  let changed = false;
  const characters: Session["characters"] = { ...session.characters };
  for (const [id, character] of Object.entries(characters)) {
    const next = dropOversizedPortrait(character);
    if (next !== character) {
      characters[id] = next;
      changed = true;
    }
  }
  return changed ? { ...session, characters } : session;
}

function writeError(storeName: string, err: unknown): Error {
  if (err && typeof err === "object" && "name" in err && err.name === "QuotaExceededError") {
    return new Error(
      "Not enough storage for that picture. Remove a picture or sound from another card and try again."
    );
  }
  return err instanceof Error ? err : new Error(`Failed to write to ${storeName}.`);
}

function parseLibraryTemplate<T>(
  kind: LibraryKind,
  input: unknown,
  parse: (value: unknown) => T
): T {
  try {
    return parse(input);
  } catch (err) {
    throw new TemplateValidationError(kind, err instanceof Error ? err.message : String(err));
  }
}

function parseLibraryList<T extends { name: string }>(
  kind: LibraryKind,
  rows: unknown[],
  parse: (value: unknown) => T
): T[] {
  const parsed: T[] = [];
  for (const row of rows) {
    try {
      parsed.push(parse(row));
    } catch {
      // Skip corrupt library rows rather than blocking the whole library.
    }
  }
  parsed.sort((a, b) => a.name.localeCompare(b.name));
  return parsed;
}
