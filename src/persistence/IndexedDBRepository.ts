import {
  CutsceneFilmSchema,
  migrateCutsceneDocument,
  referencedFilms,
  type CutsceneFilm,
} from "../cutscenes/schema";
import { FactionSchema, type Faction } from "../library/factions";
import { buildGuideAdventure } from "../library/buildGuideAdventure";
import { AdventureGuideDraftSchema, type AdventureGuideDraft } from "../library/adventureGuidePlan";
import {
  guideApprovalDraft,
  GuideInterviewSchema,
  type GuideInterview,
} from "../library/guideInterview";
import {
  mergeGuideEdits,
  type EditConflict,
  type EditDecision,
} from "../library/guideConcurrentEdit";
import {
  applyGuideSceneRevision,
  authoredGuideScene,
  GuideSceneConflictError,
  GuideSceneRevisionSchema,
  sceneRevisionSnapshot,
  type GuideSceneDecision,
  type GuideSceneSnapshot,
  type GuideSceneTarget,
} from "../library/guideSceneRevision";
import {
  PlaceBlueprintSchema,
  starterBlueprints,
  type PlaceBlueprint,
} from "@library/placeBlueprint";
import { AnatomyTemplateSchema, type AnatomyTemplate } from "@state/StateSchema";
import { validateObjectNesting, objectContents } from "@library/objectLocation";
import { BUILTIN_ANATOMY_TEMPLATES } from "@state/builtinAnatomy";
import mona from "../library/examples/mona.json";
import monaMorph from "../library/examples/mona-morph.json";
import type { materializeWorld } from "../lore/materializeWorld";
import { LorebookSchema, type Lorebook } from "../lore/LorebookSchema";
import { IdeaSchema, type Idea } from "../ideas/IdeaSchema";
import { upgradeMissingMessengerSession } from "../scenarios/missingMessenger";
import {
  ConversationEntrySchema,
  conversationEntry,
  recentConversations,
  type ConversationEntry,
  type ConversationCatalog,
} from "./ConversationSchema";
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
  type VoiceTemplate,
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
 * v12 adds imported lorebooks with original data and explicit approvals.
 * v11 adds saved ideas with source-message snapshots.
 * v10 adds conversation metadata; existing session records stay in place.
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
const FACTIONS_STORE = "factions";
const PREFS_STORE = "prefs";
const STUDIO_RESUME_ID = "studio-resume";
const CONVERSATIONS_STORE = "conversations";
const ACTIVE_CONVERSATION_ID = "active-conversation";
const CONVERSATION_INDEX_ID = "conversation-index-v1";
const IDEAS_STORE = "ideas";
const LOREBOOKS_STORE = "lorebooks";
const CUTSCENES_STORE = "cutscenes";
const DB_VERSION = 16;
const ANATOMY_STORE = "anatomy-templates";
const GUIDE_DRAFTS_STORE = "guideDrafts";
const GUIDE_INTERVIEW_ID = "active-guide-interview";

type GuideInterviewVersion = Pick<GuideInterview, "id" | "revision">;

function readGuideInterview(row: unknown): GuideInterview | undefined {
  return row === undefined
    ? undefined
    : GuideInterviewSchema.parse((row as { interview: unknown }).interview);
}

function matchesGuideVersion(
  current: GuideInterviewVersion | undefined,
  expected: GuideInterviewVersion | undefined,
): boolean {
  return current?.id === expected?.id && current?.revision === expected?.revision;
}

export class GuideInterviewConflictError extends Error {
  constructor() {
    super(
      "Guiden har ändrats i en annan flik. Öppna det senaste utkastet och granska den nya versionen.",
    );
    this.name = "GuideInterviewConflictError";
  }
}

export class CampaignEditConflictError extends Error {
  constructor(
    readonly revision?: number,
    readonly conflicts: EditConflict[] = [],
  ) {
    super("This adventure changed in another tab. Review the latest version before saving.");
    this.name = "CampaignEditConflictError";
  }
}

export type StudioResume = {
  conversationId?: string;
  campaignId: string;
  /** An explicit request to open the editor when entering Studio. */
  openStoryboard?: boolean;
  sceneId?: string;
  /** Agreement from the last session. Survives new scene. Not the chat log. */
  handoff?: string;
};

type LibraryKind =
  | "character"
  | "place"
  | "story"
  | "voice"
  | "ruleset"
  | "object"
  | "campaign"
  | "realm"
  | "cutscene";

export class SessionNotFoundError extends Error {
  constructor(id: string) {
    super(`Session not found: ${id}`);
    this.name = "SessionNotFoundError";
  }
}

export class SchemaValidationError extends Error {
  constructor(id: string, issues: string) {
    super(`Session ${id} failed schema validation: ${issues}`);
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
  if (!db.objectStoreNames.contains(GUIDE_DRAFTS_STORE))
    db.createObjectStore(GUIDE_DRAFTS_STORE, { keyPath: "id" });
  if (!db.objectStoreNames.contains(CUTSCENES_STORE))
    db.createObjectStore(CUTSCENES_STORE, { keyPath: "id" });
  if (!db.objectStoreNames.contains(FACTIONS_STORE))
    db.createObjectStore(FACTIONS_STORE, { keyPath: "id" });
  if (!db.objectStoreNames.contains(ANATOMY_STORE))
    db.createObjectStore(ANATOMY_STORE, { keyPath: "id" });
  if (!db.objectStoreNames.contains(LOREBOOKS_STORE))
    db.createObjectStore(LOREBOOKS_STORE, { keyPath: "id" });
  if (!db.objectStoreNames.contains(IDEAS_STORE))
    db.createObjectStore(IDEAS_STORE, { keyPath: "id" });
  if (!db.objectStoreNames.contains(CONVERSATIONS_STORE))
    db.createObjectStore(CONVERSATIONS_STORE, { keyPath: "id" });
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

function saveMigratedFilms(store: IDBObjectStore, films: readonly CutsceneFilm[]) {
  for (const film of films) {
    const existing = store.get(film.id);
    existing.onsuccess = () => {
      if (existing.result === undefined) store.put(film);
    };
  }
}

function migrateCampaignFilms(transaction: IDBTransaction) {
  const campaigns = transaction.objectStore(CAMPAIGNS_STORE);
  const films = transaction.objectStore(CUTSCENES_STORE);
  const opened = campaigns.openCursor();
  opened.onsuccess = () => {
    const cursor = opened.result;
    if (!cursor) return;
    const original: unknown = cursor.value;
    const migrated = migrateCutsceneDocument(original);
    if (migrated !== original) {
      // Only the new cut-scene fields are normalised. Other campaign data stays as stored.
      const document = migrated as Record<string, unknown>;
      const { cutsceneFilms, ...placementDocument } = document;
      const parsed = CutsceneFilmSchema.array().safeParse(cutsceneFilms);
      if (parsed.success) {
        saveMigratedFilms(films, parsed.data);
        cursor.update(placementDocument);
      }
    }
    cursor.continue();
  };
}

export class IndexedDBRepository {
  private db: IDBDatabase | undefined;
  private opening: Promise<IDBDatabase> | undefined;

  constructor(
    private idbFactory: IDBFactory = globalThis.indexedDB,
    private dbName: string = DB_NAME,
    private dbVersion: number = DB_VERSION,
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
        const upgradeFilms = !request.result.objectStoreNames.contains(CUTSCENES_STORE);
        ensureStores(request.result);
        if (upgradeFilms && request.transaction) migrateCampaignFilms(request.transaction);
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
    return this.writeConversation(session, false);
  }

  /** New IDs use add(), so creating a conversation can never overwrite another. */
  async createConversation(session: Session): Promise<void> {
    return this.writeConversation(session, true);
  }

  /** Atomic archive-only import: never activates the new session or overwrites an existing ID. */
  async createArchivedConversation(session: Session): Promise<void> {
    return this.writeConversation(session, true, true);
  }

  private async writeConversation(
    session: Session,
    create: boolean,
    archived = false,
  ): Promise<void> {
    const parsed = safeParseSession(session);
    if (!parsed.success) throw new SchemaValidationError(session.id, parsed.error.message);
    const snapshot = parsed.data;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, CONVERSATIONS_STORE, PREFS_STORE], "readwrite");
      const sessions = tx.objectStore(STORE_NAME),
        metadata = tx.objectStore(CONVERSATIONS_STORE);
      if (create) sessions.add(snapshot);
      else sessions.put(snapshot);
      const existing = metadata.get(snapshot.id);
      existing.onsuccess = () => {
        const parsed = ConversationEntrySchema.safeParse(existing.result);
        metadata.put(
          archived
            ? {
                ...conversationEntry(snapshot),
                archived: true,
                importQuarantined: true,
                title: `Imported: ${snapshot.scene?.location ?? "Aventuras"}`.slice(0, 120),
              }
            : conversationEntry(snapshot, parsed.success ? parsed.data : undefined),
        );
      };
      if (create && !archived)
        tx.objectStore(PREFS_STORE).put({
          id: ACTIVE_CONVERSATION_ID,
          conversationId: snapshot.id,
        });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not save this conversation."));
      tx.onabort = () => reject(tx.error ?? new Error("Conversation save was cancelled."));
    });
  }

  /** Index legacy snapshots in-place. Invalid snapshots remain untouched and are reported. */
  async listConversations(): Promise<ConversationCatalog> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, CONVERSATIONS_STORE, PREFS_STORE], "readwrite");
      const metadata = tx.objectStore(CONVERSATIONS_STORE),
        sessions = tx.objectStore(STORE_NAME),
        prefs = tx.objectStore(PREFS_STORE);
      let entries: ConversationEntry[] = [],
        sessionIds: string[] = [];
      const marker = prefs.get(CONVERSATION_INDEX_ID);
      const readIndex = () => {
        const listed = metadata.getAll();
        listed.onsuccess = () => {
          entries = listed.result.flatMap((raw: unknown) => {
            const parsed = ConversationEntrySchema.safeParse(raw);
            return parsed.success ? [parsed.data] : [];
          });
        };
        const ids = sessions.getAllKeys();
        ids.onsuccess = () => {
          sessionIds = ids.result.map(String);
        };
      };
      marker.onsuccess = () => {
        if (marker.result) {
          readIndex();
          return;
        }
        const request = sessions.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            prefs.put({ id: CONVERSATION_INDEX_ID, version: 1 });
            readIndex();
            return;
          }
          try {
            const raw = cursor.value as Record<string, unknown>;
            const parsed = safeParseSession(needsMigration(raw) ? migrate(raw) : raw);
            if (!parsed.success) {
              cursor.continue();
              return;
            }
            const lookup = metadata.get(parsed.data.id);
            lookup.onsuccess = () => {
              const saved = ConversationEntrySchema.safeParse(lookup.result);
              if (!saved.success) metadata.put(conversationEntry(parsed.data));
              cursor.continue();
            };
          } catch {
            cursor.continue();
          }
        };
      };
      tx.oncomplete = () => {
        const validIds = new Set(entries.map((entry) => entry.id));
        resolve({
          entries: [
            ...recentConversations(entries),
            ...entries
              .filter((entry) => entry.archived)
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
          ],
          unreadable: sessionIds.filter((id) => !validIds.has(id)).length,
        });
      };
      tx.onerror = () => reject(tx.error ?? new Error("Could not open your conversation library."));
      tx.onabort = () => reject(tx.error ?? new Error("Could not open your conversation library."));
    });
  }

  async renameConversation(id: string, title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed || trimmed.length > 120)
      throw new Error("Use a conversation name between 1 and 120 characters.");
    return this.updateConversation(id, (entry) => ({
      ...entry,
      title: trimmed,
    }));
  }

  async archiveConversation(id: string, archived: boolean): Promise<void> {
    return this.updateConversation(id, (entry) => {
      if (!archived && entry.importQuarantined)
        throw new Error(
          "Imported archives cannot be restored to active play until a safe migration is available.",
        );
      return { ...entry, archived };
    });
  }

  private async updateConversation(
    id: string,
    update: (entry: ConversationEntry) => ConversationEntry,
  ): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([CONVERSATIONS_STORE, PREFS_STORE], "readwrite");
      const store = tx.objectStore(CONVERSATIONS_STORE);
      const request = store.get(id);
      request.onsuccess = () => {
        const parsed = ConversationEntrySchema.safeParse(request.result);
        if (!parsed.success) {
          reject(new Error("This conversation is not in the library."));
          tx.abort();
          return;
        }
        let entry: ConversationEntry;
        try {
          entry = update(parsed.data);
        } catch (error) {
          reject(error);
          tx.abort();
          return;
        }
        store.put(entry);
        if (entry.archived) {
          const active = tx.objectStore(PREFS_STORE).get(ACTIVE_CONVERSATION_ID);
          active.onsuccess = () => {
            if (active.result?.conversationId === id)
              tx.objectStore(PREFS_STORE).delete(ACTIVE_CONVERSATION_ID);
          };
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not update this conversation."));
      tx.onabort = () => reject(tx.error ?? new Error("Could not update this conversation."));
    });
  }

  async activateConversation(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([CONVERSATIONS_STORE, PREFS_STORE], "readwrite");
      const request = tx.objectStore(CONVERSATIONS_STORE).get(id);
      request.onsuccess = () => {
        const parsed = ConversationEntrySchema.safeParse(request.result);
        if (!parsed.success || parsed.data.archived) {
          reject(new Error("Restore this conversation before continuing."));
          tx.abort();
          return;
        }
        tx.objectStore(CONVERSATIONS_STORE).put({
          ...parsed.data,
          lastOpenedAt: new Date().toISOString(),
        });
        tx.objectStore(PREFS_STORE).put({
          id: ACTIVE_CONVERSATION_ID,
          conversationId: id,
        });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not open this conversation."));
      tx.onabort = () => reject(tx.error ?? new Error("Could not open this conversation."));
    });
  }

  async loadActiveConversationId(): Promise<string | null> {
    const raw = await this.getRecord(PREFS_STORE, ACTIVE_CONVERSATION_ID);
    return raw &&
      typeof raw === "object" &&
      "conversationId" in raw &&
      typeof raw.conversationId === "string"
      ? raw.conversationId
      : null;
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
    return dropSessionPortraits(upgradeMissingMessengerSession(parsed.data));
  }

  async deleteSession(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, CONVERSATIONS_STORE, PREFS_STORE], "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.objectStore(CONVERSATIONS_STORE).delete(id);
      const active = tx.objectStore(PREFS_STORE).get(ACTIVE_CONVERSATION_ID);
      active.onsuccess = () => {
        if (active.result?.conversationId === id)
          tx.objectStore(PREFS_STORE).delete(ACTIVE_CONVERSATION_ID);
      };
      const resume = tx.objectStore(PREFS_STORE).get(STUDIO_RESUME_ID);
      resume.onsuccess = () => {
        if (
          resume.result?.conversationId === id ||
          (id === "demo-session" && resume.result && !resume.result.conversationId)
        )
          tx.objectStore(PREFS_STORE).delete(STUDIO_RESUME_ID);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error(`Failed to delete session ${id}.`));
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

  async listAnatomyTemplates(): Promise<AnatomyTemplate[]> {
    const builtInIds = new Set(BUILTIN_ANATOMY_TEMPLATES.map((template) => template.id));
    const custom = (await this.getAllRecords(ANATOMY_STORE))
      .map((row) => AnatomyTemplateSchema.parse(row))
      .filter((template) => !builtInIds.has(template.id));
    return [...structuredClone(BUILTIN_ANATOMY_TEMPLATES), ...custom];
  }

  async saveAnatomyTemplate(template: AnatomyTemplate): Promise<void> {
    await this.putRecord(ANATOMY_STORE, AnatomyTemplateSchema.parse(template));
  }

  async deleteAnatomyTemplate(id: string): Promise<void> {
    await this.deleteRecord(ANATOMY_STORE, id);
  }

  async saveCharacter(template: CharacterTemplate): Promise<void> {
    const parsed = parseLibraryTemplate(
      "character",
      dropOversizedPortrait(template),
      parseCharacterTemplate,
    );
    await this.putRecord(CHARACTERS_STORE, parsed);
  }

  async loadCharacter(id: string): Promise<CharacterTemplate> {
    const raw = await this.getRecord(CHARACTERS_STORE, id);
    if (raw === undefined) throw new LibraryItemNotFoundError("character", id);
    return parseLibraryTemplate("character", raw, parseCharacterTemplate);
  }

  async deleteCharacter(id: string): Promise<void> {
    await this.deleteRecord(CHARACTERS_STORE, id);
    await this.deleteCharacterMorph(id);
  }

  async listCharacters(): Promise<CharacterTemplate[]> {
    return (await this.listCharacterCatalog()).items;
  }

  /** Install the bundled demonstration once; edits and deliberate deletion are retained. */
  async installExampleMona(): Promise<void> {
    const character = parseCharacterTemplate(mona);
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([CHARACTERS_STORE, PREFS_STORE], "readwrite");
      const preferences = tx.objectStore(PREFS_STORE);
      const marker = "example-mona-installed-v1";
      const checked = preferences.get(marker);
      checked.onsuccess = () => {
        if (checked.result) {
          // Extend the installed example without replacing edited expressions.
          const stored = preferences.get(`character-morph:${character.id}`);
          stored.onsuccess = () => {
            const profile = stored.result?.profile;
            if (!profile || !Array.isArray(profile.expressions)) return;
            const additions = monaMorph.expressions.filter(
              (item) =>
                ["neutral", "stressed"].includes(item.name) &&
                !profile.expressions.some(
                  (existing: { name: string }) => existing.name === item.name,
                ),
            );
            if (!additions.length) return;
            preferences.put({
              ...stored.result,
              profile: {
                ...profile,
                expressions: [...profile.expressions, ...additions],
                gallery: [
                  ...(profile.gallery ?? []),
                  ...monaMorph.gallery.filter((item) =>
                    additions.some((expression) => expression.name === item.name),
                  ),
                ],
              },
            });
          };
          return;
        }
        const characters = tx.objectStore(CHARACTERS_STORE);
        const existing = characters.get(character.id);
        existing.onsuccess = () => {
          if (!existing.result) {
            characters.put(character);
            preferences.put({ id: `character-morph:${character.id}`, profile: monaMorph });
          }
          preferences.put({ id: marker, installed: true });
        };
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not install example Mona."));
      tx.onabort = () => reject(tx.error ?? new Error("Could not install example Mona."));
    });
  }

  /** Includes rows that fail schema, so Studio can say the archive is not empty. */
  async listCharacterCatalog(): Promise<{
    items: CharacterTemplate[];
    skipped: number;
  }> {
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

  async saveFaction(faction: Faction): Promise<void> {
    await this.putRecord(FACTIONS_STORE, FactionSchema.parse(faction));
  }

  async listFactions(): Promise<Faction[]> {
    const rows = await this.getAllRecords(FACTIONS_STORE);
    return rows.map((row) => FactionSchema.parse(row)).sort((a, b) => a.name.localeCompare(b.name));
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
    const nestingError = validateObjectNesting(parsed, await this.listObjects());
    if (nestingError) throw new Error(nestingError);
    await this.putRecord(OBJECTS_STORE, parsed);
  }

  async loadObject(id: string): Promise<ObjectTemplate> {
    const raw = await this.getRecord(OBJECTS_STORE, id);
    if (raw === undefined) throw new LibraryItemNotFoundError("object", id);
    return parseLibraryTemplate("object", raw, parseObjectTemplate);
  }

  async deleteObject(id: string): Promise<void> {
    if (objectContents(await this.listObjects(), id).length) {
      throw new Error("Move the objects inside this container before deleting it.");
    }
    await this.deleteRecord(OBJECTS_STORE, id);
  }

  async listObjects(): Promise<ObjectTemplate[]> {
    const rows = await this.getAllRecords(OBJECTS_STORE);
    return parseLibraryList("object", rows, parseObjectTemplate);
  }

  /** Library films are independent of the adventures that reference them. */
  async listCutsceneFilms(): Promise<CutsceneFilm[]> {
    const rows = await this.getAllRecords(CUTSCENES_STORE);
    return rows
      .flatMap((value) => {
        const parsed = CutsceneFilmSchema.safeParse(value);
        return parsed.success ? [parsed.data] : [];
      })
      .sort((left, right) => left.title.localeCompare(right.title));
  }

  async loadCutsceneFilm(id: string): Promise<CutsceneFilm> {
    const raw = await this.getRecord(CUTSCENES_STORE, id);
    if (raw === undefined) throw new LibraryItemNotFoundError("cutscene", id);
    return parseLibraryTemplate("cutscene", raw, (value) => CutsceneFilmSchema.parse(value));
  }

  async saveCutsceneFilm(film: CutsceneFilm): Promise<void> {
    const parsed = parseLibraryTemplate("cutscene", film, (value) =>
      CutsceneFilmSchema.parse(value),
    );
    await this.putRecord(CUTSCENES_STORE, parsed);
  }

  async deleteCutsceneFilm(id: string): Promise<void> {
    await this.deleteRecord(CUTSCENES_STORE, id);
  }

  async loadGuideInterview(): Promise<GuideInterview | undefined> {
    return readGuideInterview(await this.getRecord(PREFS_STORE, GUIDE_INTERVIEW_ID));
  }

  async saveGuideInterview(
    interview: GuideInterview,
    expected: GuideInterviewVersion | undefined,
  ): Promise<void> {
    const updated = GuideInterviewSchema.parse(interview);
    return this.withDb(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(PREFS_STORE, "readwrite");
          const store = tx.objectStore(PREFS_STORE);
          const request = store.get(GUIDE_INTERVIEW_ID);
          let failure: unknown;
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(failure ?? writeError(PREFS_STORE, tx.error));
          request.onsuccess = () => {
            try {
              const current = readGuideInterview(request.result);
              if (!matchesGuideVersion(current, expected)) throw new GuideInterviewConflictError();
              if (
                updated.appliedCampaignId ||
                (current?.id === updated.id &&
                  (current.appliedCampaignId || updated.revision <= current.revision))
              )
                throw new GuideInterviewConflictError();
              store.put({ id: GUIDE_INTERVIEW_ID, interview: updated });
            } catch (error) {
              failure = error;
              tx.abort();
            }
          };
        }),
    );
  }

  async createGuideDraft(draft: AdventureGuideDraft): Promise<void> {
    const record = AdventureGuideDraftSchema.parse(draft);
    if (record.applied) throw new Error("A new guide draft cannot already be approved.");
    return this.withDb(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(GUIDE_DRAFTS_STORE, "readwrite");
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(writeError(GUIDE_DRAFTS_STORE, tx.error));
          tx.objectStore(GUIDE_DRAFTS_STORE).add(record);
        }),
    );
  }

  async loadGuideDraft(id: string): Promise<AdventureGuideDraft> {
    return AdventureGuideDraftSchema.parse(await this.getRecord(GUIDE_DRAFTS_STORE, id));
  }

  /** Approve the saved revision and its selected map references in the same transaction. */
  async approveGuideDraft(id: string, revision: number): Promise<CampaignTemplate> {
    return this.commitGuideAdventure({ draftId: id, revision });
  }

  async approveGuideInterview(expected: GuideInterviewVersion): Promise<CampaignTemplate> {
    return this.commitGuideAdventure({ interviewId: expected.id, revision: expected.revision });
  }

  async hasGuideScene(target: GuideSceneTarget): Promise<boolean> {
    const rows = await this.getAllRecords(GUIDE_DRAFTS_STORE);
    return rows.some((row) => {
      const draft = AdventureGuideDraftSchema.safeParse(row);
      return (
        draft.success &&
        draft.data.applied?.campaignId === target.campaignId &&
        !!authoredGuideScene(draft.data, target.sceneId)
      );
    });
  }

  loadGuideSceneRevision(target: GuideSceneTarget): Promise<GuideSceneSnapshot> {
    return this.withGuideSceneRevision(target, "readonly", (snapshot) => snapshot);
  }

  saveGuideSceneRevision(
    target: GuideSceneTarget,
    expectedRevision: number,
    changes: Record<string, string>,
  ): Promise<GuideSceneSnapshot> {
    return this.withGuideSceneRevision(target, "readwrite", (snapshot, _campaign, write) => {
      if (snapshot.revision.revision !== expectedRevision) throw new GuideSceneConflictError();
      const revision = GuideSceneRevisionSchema.parse({
        ...snapshot.revision,
        revision: expectedRevision + 1,
        changes,
      });
      write(revision);
      return { ...snapshot, revision };
    });
  }

  applyGuideSceneRevision(
    reviewed: GuideSceneSnapshot,
    decisions: Record<string, GuideSceneDecision>,
  ): Promise<CampaignTemplate> {
    return this.withGuideSceneRevision(reviewed, "readwrite", (snapshot, campaign, write) => {
      const applied = applyGuideSceneRevision(campaign, snapshot, reviewed, decisions);
      write(applied.revision, applied.campaign);
      return applied.campaign;
    });
  }

  /** Read the live editor values and the revision together, and update both atomically. */
  private withGuideSceneRevision<T>(
    target: GuideSceneTarget,
    mode: "readonly" | "readwrite",
    handleSnapshot: (
      snapshot: GuideSceneSnapshot,
      campaign: CampaignTemplate,
      write: (revision: GuideSceneSnapshot["revision"], campaign?: CampaignTemplate) => void,
    ) => T,
  ): Promise<T> {
    return this.withDb(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const stores = [
            GUIDE_DRAFTS_STORE,
            CAMPAIGNS_STORE,
            PREFS_STORE,
            OBJECTS_STORE,
            REALMS_STORE,
            PLACES_STORE,
          ];
          const tx = db.transaction(stores, mode);
          const prefId = `guide-scene-revision:${JSON.stringify([target.campaignId, target.sceneId])}`;
          let result: T;
          let failure: unknown;
          tx.oncomplete = () => resolve(result);
          tx.onabort = () => reject(failure ?? writeError(CAMPAIGNS_STORE, tx.error));

          function accept<Row>(request: IDBRequest<Row>, handler: (row: Row) => void) {
            request.onsuccess = () => {
              try {
                handler(request.result);
              } catch (error) {
                failure = error;
                tx.abort();
              }
            };
          }

          function read(store: string, id: string, handler: (row: unknown) => void) {
            accept(tx.objectStore(store).get(id), handler);
          }

          accept(tx.objectStore(GUIDE_DRAFTS_STORE).getAll(), (rows) => {
            const guide = rows
              .map((row) => AdventureGuideDraftSchema.safeParse(row))
              .find(
                (draft) => draft.success && draft.data.applied?.campaignId === target.campaignId,
              );
            if (!guide?.success)
              throw new Error("Äventyret har inget sparat underlag från guiden.");
            read(CAMPAIGNS_STORE, target.campaignId, (row) => {
              if (row === undefined)
                throw new GuideSceneConflictError("Äventyret finns inte kvar i biblioteket.");
              const campaign = parseCampaignTemplate(row);
              const scene = campaign.scenes.find(({ id }) => id === target.sceneId);
              if (!scene?.encounter)
                throw new GuideSceneConflictError(
                  "Scenen finns inte kvar som spelbar scen i äventyret.",
                );
              const input: Parameters<typeof sceneRevisionSnapshot>[0] = {
                campaign,
                sceneId: target.sceneId,
                guide: guide.data,
                revision: GuideSceneRevisionSchema.parse({ revision: 0 }),
                objects: [],
                places: [],
              };
              const reads: { store: string; id: string; handle: (row: unknown) => void }[] = [
                {
                  store: PREFS_STORE,
                  id: prefId,
                  handle: (row) => {
                    if (row !== undefined)
                      input.revision = GuideSceneRevisionSchema.parse(
                        (row as { revision: unknown }).revision,
                      );
                  },
                },
              ];
              for (const { id } of scene.encounter.definition.items)
                reads.push({
                  store: OBJECTS_STORE,
                  id,
                  handle: (row) => {
                    if (row !== undefined) input.objects.push(parseObjectTemplate(row));
                  },
                });
              if (scene.usePlaceIntro && campaign.mapWorldId) {
                reads.push({
                  store: REALMS_STORE,
                  id: campaign.mapWorldId,
                  handle: (row) => {
                    if (row !== undefined) input.world = parseRealmTemplate(row);
                  },
                });
                reads.push({
                  store: PLACES_STORE,
                  id: scene.placeId,
                  handle: (row) => {
                    if (row !== undefined) input.places.push(parsePlaceTemplate(row));
                  },
                });
              }

              function readNext(index: number) {
                const next = reads[index];
                if (next) {
                  read(next.store, next.id, (row) => {
                    next.handle(row);
                    readNext(index + 1);
                  });
                  return;
                }
                result = handleSnapshot(
                  sceneRevisionSnapshot(input),
                  campaign,
                  (revision, nextCampaign) => {
                    if (nextCampaign)
                      tx.objectStore(CAMPAIGNS_STORE).put(parseCampaignTemplate(nextCampaign));
                    tx.objectStore(PREFS_STORE).put({ id: prefId, revision });
                  },
                );
              }
              readNext(0);
            });
          });
        }),
    );
  }

  private async commitGuideAdventure(
    source: { draftId: string; revision: number } | { interviewId: string; revision: number },
  ): Promise<CampaignTemplate> {
    return this.withDb(
      (db) =>
        new Promise<CampaignTemplate>((resolve, reject) => {
          const { revision } = source;
          const tx = db.transaction(
            [
              GUIDE_DRAFTS_STORE,
              CAMPAIGNS_STORE,
              REALMS_STORE,
              PLACES_STORE,
              OBJECTS_STORE,
              CHARACTERS_STORE,
              FACTIONS_STORE,
              ...("interviewId" in source ? [PREFS_STORE] : []),
            ],
            "readwrite",
          );
          let result: CampaignTemplate;
          let failure: unknown;
          tx.oncomplete = () => resolve(result);
          tx.onabort = () => reject(failure ?? writeError(GUIDE_DRAFTS_STORE, tx.error));

          // Schedule dependent requests inside request events so the transaction stays active.
          function read(store: string, key: string, onRecord: (row: unknown) => void) {
            const request = tx.objectStore(store).get(key);
            request.onsuccess = () => {
              try {
                onRecord(request.result);
              } catch (error) {
                failure = error;
                tx.abort();
              }
            };
          }

          function readCampaign(id: string) {
            read(CAMPAIGNS_STORE, id, (campaign) => {
              if (campaign === undefined) throw new LibraryItemNotFoundError("campaign", id);
              result = parseCampaignTemplate(campaign);
            });
          }

          function build(draft: AdventureGuideDraft, interview?: GuideInterview) {
            if (draft.revision !== revision)
              throw new Error("Planen har ändrats. Öppna förhandsvisningen igen.");
            const { applied } = draft;
            if (applied) {
              readCampaign(applied.campaignId);
              return;
            }

            const library: Parameters<typeof buildGuideAdventure>[1] & {
              characters: CharacterTemplate[];
              factions: Faction[];
              objects: ObjectTemplate[];
            } = { places: [], characters: [], factions: [], objects: [] };
            function writeAdventure() {
              const built = buildGuideAdventure(draft, library);
              result = parseCampaignTemplate(built.campaign);
              const startSceneId = result.startSceneId;
              if (
                !startSceneId ||
                !result.scenes.some((scene) => scene.id === startSceneId && scene.encounter)
              )
                throw new Error("Välj en spelbar startscen.");
              if (built.realm) tx.objectStore(REALMS_STORE).add(built.realm);
              for (const place of built.places) tx.objectStore(PLACES_STORE).add(place);
              for (const object of built.objects) tx.objectStore(OBJECTS_STORE).add(object);
              for (const character of built.characters)
                tx.objectStore(CHARACTERS_STORE).add(character);
              for (const faction of built.factions) tx.objectStore(FACTIONS_STORE).add(faction);
              tx.objectStore(CAMPAIGNS_STORE).add(result);
              tx.objectStore(GUIDE_DRAFTS_STORE).put({
                ...draft,
                applied: { revision, campaignId: result.id, startSceneId },
              });
              if (interview)
                tx.objectStore(PREFS_STORE).put({
                  id: GUIDE_INTERVIEW_ID,
                  interview: { ...interview, revision: revision + 1, appliedCampaignId: result.id },
                });
            }

            const reads: { store: string; id: string; accept: (row: unknown) => void }[] = [];
            if (draft.map.kind !== "new") {
              const map = draft.map;
              reads.push({
                store: REALMS_STORE,
                id: map.realmId,
                accept: (row) => {
                  library.realm = row === undefined ? undefined : parseRealmTemplate(row);
                },
              });
              const cardIds = draft.plan.places.flatMap(({ id }) => {
                const cardId = map.kind === "existing" ? map.sites[id]?.placeCardId : map.sites[id];
                return cardId ? [cardId] : [];
              });
              for (const id of new Set(cardIds))
                reads.push({
                  store: PLACES_STORE,
                  id,
                  accept: (row) => {
                    if (row !== undefined) library.places.push(parsePlaceTemplate(row));
                  },
                });
            }
            function queueRecords<T>(
              store: string,
              ids: (string | undefined)[],
              target: T[],
              parse: (value: unknown) => T,
            ) {
              for (const id of new Set(ids))
                if (id)
                  reads.push({
                    store,
                    id,
                    accept: (row) => {
                      if (row !== undefined) target.push(parse(row));
                    },
                  });
            }
            queueRecords(
              CHARACTERS_STORE,
              [
                draft.plan.playerCharacterId,
                ...draft.plan.world.characters.map(({ existingId }) => existingId),
              ],
              library.characters,
              parseCharacterTemplate,
            );
            queueRecords(
              FACTIONS_STORE,
              draft.plan.world.factions.map(({ existingId }) => existingId),
              library.factions,
              (row) => FactionSchema.parse(row),
            );
            queueRecords(
              OBJECTS_STORE,
              draft.plan.items.map(({ existingId }) => existingId),
              library.objects,
              parseObjectTemplate,
            );
            function readNext(index: number) {
              const request = reads[index];
              if (!request) return writeAdventure();
              read(request.store, request.id, (row) => {
                request.accept(row);
                readNext(index + 1);
              });
            }
            readNext(0);
          }

          if ("interviewId" in source) {
            read(PREFS_STORE, GUIDE_INTERVIEW_ID, (row) => {
              const interview = readGuideInterview(row);
              if (interview?.id !== source.interviewId) throw new GuideInterviewConflictError();
              if (interview.appliedCampaignId && interview.revision === revision + 1) {
                readCampaign(interview.appliedCampaignId);
                return;
              }
              if (interview.appliedCampaignId || interview.revision !== revision)
                throw new GuideInterviewConflictError();
              const candidate = guideApprovalDraft(interview);
              if (!candidate.ok) throw new Error(candidate.message);
              build(candidate.draft, interview);
            });
          } else {
            read(GUIDE_DRAFTS_STORE, source.draftId, (row) =>
              build(AdventureGuideDraftSchema.parse(row)),
            );
          }
        }),
    );
  }

  async saveCampaign(template: CampaignTemplate): Promise<void> {
    await this.saveEditedCampaign(template);
  }

  async saveEditedCampaign(
    template: CampaignTemplate,
    baseline?: CampaignTemplate,
    resolution?: { revision: number; choices: Record<string, EditDecision> },
  ): Promise<CampaignTemplate> {
    return this.writeCampaign(template, { baseline, resolution });
  }

  /** An explicitly restored backup replaces the saved adventure and invalidates older editors. */
  async restoreCampaign(template: CampaignTemplate): Promise<void> {
    await this.writeCampaign(template, { restore: true });
  }

  private writeCampaign(
    template: CampaignTemplate,
    options: {
      baseline?: CampaignTemplate | undefined;
      resolution?: { revision: number; choices: Record<string, EditDecision> } | undefined;
      restore?: boolean;
    },
  ): Promise<CampaignTemplate> {
    const { baseline, resolution, restore } = options;
    const edited = parseLibraryTemplate("campaign", template, parseCampaignTemplate);
    function comparable(campaign: CampaignTemplate) {
      return {
        ...campaign,
        updatedAt: "",
        createdAt: "",
        guideEditRevision: undefined,
        cutsceneFilms: undefined,
      };
    }
    return this.withDb(
      (db) =>
        new Promise<CampaignTemplate>((resolve, reject) => {
          const tx = db.transaction([CAMPAIGNS_STORE, CUTSCENES_STORE], "readwrite");
          const store = tx.objectStore(CAMPAIGNS_STORE);
          const request = store.get(edited.id);
          let saved = edited;
          let failure: unknown;
          tx.oncomplete = () => resolve(saved);
          tx.onabort = () => reject(failure ?? writeError(CAMPAIGNS_STORE, tx.error));
          request.onsuccess = () => {
            try {
              const current =
                request.result === undefined ? undefined : parseCampaignTemplate(request.result);
              if (
                !current &&
                (baseline?.guideItemText || baseline?.guideEditRevision !== undefined)
              )
                throw new CampaignEditConflictError();
              if (current && (current.guideItemText || current.guideEditRevision !== undefined)) {
                const revision = current.guideEditRevision ?? 0;
                if (!restore && (edited.guideEditRevision ?? 0) !== revision) {
                  if (
                    baseline?.id !== current.id ||
                    (baseline.guideEditRevision ?? 0) !== (edited.guideEditRevision ?? 0)
                  )
                    throw new CampaignEditConflictError();
                  const choices =
                    resolution?.revision === revision ? resolution.choices : undefined;
                  const merged = mergeGuideEdits(
                    comparable(baseline),
                    comparable(current),
                    comparable(edited),
                    choices,
                  );
                  if (merged.conflicts.length)
                    throw new CampaignEditConflictError(revision, merged.conflicts);
                  saved = {
                    ...merged.value,
                    createdAt: current.createdAt,
                    updatedAt: edited.updatedAt,
                    ...(edited.cutsceneFilms ? { cutsceneFilms: edited.cutsceneFilms } : {}),
                  };
                }
                saved = { ...saved, guideEditRevision: revision + 1 };
              }
              const { cutsceneFilms, ...parsed } = saved;
              const migrated =
                cutsceneFilms?.filter(({ id }) => id.startsWith("cutscene-v1:")) ?? [];
              if (migrated.length) saveMigratedFilms(tx.objectStore(CUTSCENES_STORE), migrated);
              store.put(parseCampaignTemplate(parsed));
            } catch (error) {
              failure = error;
              tx.abort();
            }
          };
        }),
    );
  }

  async loadCampaign(id: string): Promise<CampaignTemplate> {
    const raw = await this.getRecord(CAMPAIGNS_STORE, id);
    if (raw === undefined) throw new LibraryItemNotFoundError("campaign", id);
    const campaign = parseLibraryTemplate("campaign", raw, parseCampaignTemplate);
    if (!campaign.cutscenes.length) return campaign;
    return {
      ...campaign,
      cutsceneFilms: referencedFilms(campaign.cutscenes, await this.listCutsceneFilms()),
    };
  }

  async deleteCampaign(id: string): Promise<void> {
    await this.deleteRecord(CAMPAIGNS_STORE, id);
  }

  async listCampaigns(): Promise<CampaignTemplate[]> {
    const rows = await this.getAllRecords(CAMPAIGNS_STORE);
    const campaigns = parseLibraryList("campaign", rows, parseCampaignTemplate);
    if (!campaigns.some(({ cutscenes }) => cutscenes.length)) return campaigns;
    const films = await this.listCutsceneFilms();
    return campaigns.map((campaign) =>
      campaign.cutscenes.length
        ? { ...campaign, cutsceneFilms: referencedFilms(campaign.cutscenes, films) }
        : campaign,
    );
  }

  /** Character morph profiles are UI-only assets kept in the existing IndexedDB prefs store. */
  async listPlaceBlueprints(): Promise<PlaceBlueprint[]> {
    const r = await this.getRecord(PREFS_STORE, "place-blueprints");
    if (!r) return starterBlueprints.map((t) => ({ ...t, tags: [...t.tags] }));
    if (typeof r !== "object" || !("items" in r)) throw Error("Invalid place template library");
    return PlaceBlueprintSchema.array().parse(r.items);
  }
  async savePlaceBlueprints(items: PlaceBlueprint[]): Promise<void> {
    await this.putRecord(PREFS_STORE, {
      id: "place-blueprints",
      items: PlaceBlueprintSchema.array().parse(items),
    });
  }
  async saveCharacterMorph(characterId: string, profile: unknown): Promise<void> {
    if (!characterId.trim()) throw new Error("Character ID is required.");
    await this.putRecord(PREFS_STORE, { id: `character-morph:${characterId}`, profile });
  }

  async loadCharacterMorph(characterId: string): Promise<unknown | null> {
    if (!characterId.trim()) return null;
    const record = await this.getRecord(PREFS_STORE, `character-morph:${characterId}`);
    if (!record || typeof record !== "object" || !("profile" in record)) return null;
    return record.profile;
  }

  async deleteCharacterMorph(characterId: string): Promise<void> {
    if (characterId.trim()) await this.deleteRecord(PREFS_STORE, `character-morph:${characterId}`);
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
      ...(resume.conversationId ? { conversationId: resume.conversationId } : {}),
      campaignId,
      ...(sceneId ? { sceneId } : {}),
      ...(handoff ? { handoff } : {}),
    });
  }

  async loadStudioResume(): Promise<StudioResume | null> {
    const raw = await this.getRecord(PREFS_STORE, STUDIO_RESUME_ID);
    if (!raw || typeof raw !== "object") return null;
    const campaignId =
      "campaignId" in raw && typeof raw.campaignId === "string" ? raw.campaignId.trim() : "";
    if (!campaignId) return null;
    const sceneId = "sceneId" in raw && typeof raw.sceneId === "string" ? raw.sceneId.trim() : "";
    const handoff = "handoff" in raw && typeof raw.handoff === "string" ? raw.handoff.trim() : "";
    return {
      ...("conversationId" in raw && typeof raw.conversationId === "string"
        ? { conversationId: raw.conversationId }
        : {}),
      campaignId,
      ...(sceneId ? { sceneId } : {}),
      ...(handoff ? { handoff } : {}),
    };
  }

  async clearStudioResume(): Promise<void> {
    await this.deleteRecord(PREFS_STORE, STUDIO_RESUME_ID);
  }

  async saveLorebook(book: Lorebook): Promise<void> {
    await this.putRecord(LOREBOOKS_STORE, LorebookSchema.parse(book));
  }

  /** Import as one atomic unit; add() prevents replacing existing library cards. */
  async saveWorldImport(result: ReturnType<typeof materializeWorld>): Promise<void> {
    const book = LorebookSchema.parse(result.book);
    const realm = parseRealmTemplate(result.realm);
    const characters = result.characters.map((person) => parseCharacterTemplate(person));
    const places = result.places.map((place) => parsePlaceTemplate(place));
    if (
      book.materializedRealmId !== realm.id ||
      book.binding.kind !== "realm" ||
      book.binding.targetId !== realm.id ||
      places.some((place) => place.realmId !== realm.id)
    )
      throw new Error("The imported world links are inconsistent.");
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [LOREBOOKS_STORE, REALMS_STORE, CHARACTERS_STORE, PLACES_STORE],
        "readwrite",
      );
      try {
        tx.objectStore(LOREBOOKS_STORE).add(cloneRecord(book));
        tx.objectStore(REALMS_STORE).add(cloneRecord(realm));
        characters.forEach((person) => tx.objectStore(CHARACTERS_STORE).add(cloneRecord(person)));
        places.forEach((place) => tx.objectStore(PLACES_STORE).add(cloneRecord(place)));
      } catch (err) {
        tx.abort();
        reject(err);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () =>
        reject(tx.error ?? new Error("Could not save the imported world. Nothing was replaced."));
    });
  }

  async listLorebooks(): Promise<{ entries: Lorebook[]; unreadable: number }> {
    const entries: Lorebook[] = [];
    let unreadable = 0;
    for (const raw of await this.getAllRecords(LOREBOOKS_STORE)) {
      const parsed = LorebookSchema.safeParse(raw);
      if (parsed.success) entries.push(parsed.data);
      else unreadable++;
    }
    return { entries, unreadable };
  }

  async saveCharacterWithLorebook(character: CharacterTemplate, book: Lorebook): Promise<void> {
    const person = parseCharacterTemplate(character);
    const lore = LorebookSchema.parse(book);
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([CHARACTERS_STORE, LOREBOOKS_STORE], "readwrite");
      tx.objectStore(CHARACTERS_STORE).put(cloneRecord(person));
      tx.objectStore(LOREBOOKS_STORE).put(cloneRecord(lore));
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () =>
        reject(tx.error ?? new Error("Could not save character and lorebook."));
    });
  }

  /** Ideas survive conversation edits, archive and deletion. */
  async saveIdea(idea: Idea): Promise<void> {
    await this.putRecord(IDEAS_STORE, IdeaSchema.parse(idea));
  }

  async listIdeas(): Promise<{ entries: Idea[]; unreadable: number }> {
    const entries: Idea[] = [];
    let unreadable = 0;
    for (const raw of await this.getAllRecords(IDEAS_STORE)) {
      const parsed = IdeaSchema.safeParse(raw);
      if (parsed.success) entries.push(parsed.data);
      else unreadable++;
    }
    entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    return { entries, unreadable };
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
    (err.name === "InvalidStateError" || err.name === "InvalidAccessError"),
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
      "Not enough storage for that picture. Remove a picture or sound from another card and try again.",
    );
  }
  return err instanceof Error ? err : new Error(`Failed to write to ${storeName}.`);
}

function parseLibraryTemplate<T>(
  kind: LibraryKind,
  input: unknown,
  parse: (value: unknown) => T,
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
  parse: (value: unknown) => T,
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
