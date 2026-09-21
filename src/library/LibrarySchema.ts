import {
  ApproximateAgeSchema,
  AttributeDefSchema,
  CharacterPronounSchema,
  PicturePlaySchema,
  ScenePictureSchema,
  SceneRoomSchema
} from "@state/StateSchema";
import { z } from "zod";

/**
 * Library templates — reusable characters, places, stories, narrator
 * voices, and campaign rule-sets.
 */

export const LibrarySourceSchema = z.enum(["player", "sillytavern", "example"]);
export type LibrarySource = z.infer<typeof LibrarySourceSchema>;

export const CharacterLoreEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().default(""),
  content: z.string().min(1),
  /** Empty = always in the prompt when the scene starts. Prefer keywords. */
  keywords: z.array(z.string().min(1)).default(() => [])
});
export type CharacterLoreEntry = z.infer<typeof CharacterLoreEntrySchema>;

export const CharacterTemplateSchema = z.object({
  id: z.string().min(1),
  /** Given name — what narration calls them once it has been spoken. */
  name: z.string().min(1),
  /** Leftover on old cards. Unused — narration uses pronoun until the given name is heard. */
  knownAs: z.string().default(""),
  /** Years. Used to find people in a campaign. Unspecified if omitted. */
  approximateAge: ApproximateAgeSchema,
  /** Optional surname. Identity, not the usual form of address. */
  familyName: z.string().default(""),
  /** Optional middle name(s). Between given and family. */
  middleName: z.string().default(""),
  personality: z.string().default(""),
  /** Typical temperament — not a scene. Room/place is campaign/scene, not archive. */
  mood: z.string().default(""),
  pronoun: CharacterPronounSchema.optional(),
  /** One-line body and face. Not clothes or what they are holding. */
  appearance: z.string().default(""),
  /**
   * Data-URL portrait for Studio / Cast. Not included in LLM context.
   */
  portraitDataUrl: z.string().optional(),
  /** Leftover on old cards. Play uses campaign-member lore. */
  lore: z.array(CharacterLoreEntrySchema).default(() => []),
  /**
   * Kept empty on archive cards. Scene position lives on the session
   * character, not the reusable template.
   */
  position: z.string().default(""),
  scenario: z.string().default(""),
  /** Character-shelf Look for. Not sent to the model. Not a place or object tag. */
  tags: z.array(z.string().min(1)).default(() => []),
  source: LibrarySourceSchema.default("player"),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CharacterTemplate = z.infer<typeof CharacterTemplateSchema>;

export const PlaceTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lighting: z.string().default(""),
  noise: z.string().default(""),
  music: z.boolean().default(false),
  /** Venue intro — typed over the picture. Player-facing. */
  note: z.string().default(""),
  /** Compact Here text for Pass 1. Empty = fall back to the intro. */
  brief: z.string().optional(),
  /** Venue thumb. UI only — not included in LLM context. */
  thumbDataUrl: z.string().optional(),
  /** Venue backdrop. UI only — not included in LLM context. */
  imageDataUrl: z.string().optional(),
  /** Extra venue backdrops after the first. UI only. */
  gallery: z.array(ScenePictureSchema).optional(),
  picturePlay: PicturePlaySchema.optional(),
  /** Venue ambient loop. UI only — not included in LLM context. */
  audioDataUrl: z.string().optional(),
  /** Extra venue loops after the first. UI only. */
  audioGallery: z.array(z.string().min(1)).optional(),
  audioPlay: PicturePlaySchema.optional(),
  rooms: z.array(SceneRoomSchema).default(() => []),
  /** Parent realm. Landmarks do not exist outside a realm. */
  realmId: z.string().min(1),
  /** Landmark Look for. Not sent to the model. Not a character tag. */
  tags: z.array(z.string().min(1)).default(() => []),
  source: LibrarySourceSchema.default("player"),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type PlaceTemplate = z.infer<typeof PlaceTemplateSchema>;

/** Built-in City of Dunbaar. Orphan landmarks attach here on load. */
export const FALLBACK_REALM_ID = "example-realm-dunbaar";

/**
 * A region that owns landmarks. Never Here — the scene still plays on
 * a landmark floor or a focal room. Pictures and audio are UI (atlas,
 * fallback backdrop). Intro is for the player; brief is for Pass 1.
 */
export const RealmTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Player-facing atlas / Cast blurb. Not Here. */
  note: z.string().default(""),
  /** Compact realm fact for Pass 1. Empty = the intro is sent instead. */
  brief: z.string().optional(),
  thumbDataUrl: z.string().optional(),
  imageDataUrl: z.string().optional(),
  gallery: z.array(ScenePictureSchema).optional(),
  picturePlay: PicturePlaySchema.optional(),
  audioDataUrl: z.string().optional(),
  audioGallery: z.array(z.string().min(1)).optional(),
  audioPlay: PicturePlaySchema.optional(),
  source: LibrarySourceSchema.default("player"),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type RealmTemplate = z.infer<typeof RealmTemplateSchema>;

export const StoryTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  premise: z.string().min(1),
  source: LibrarySourceSchema.default("player"),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type StoryTemplate = z.infer<typeof StoryTemplateSchema>;

export const VoiceTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  instruction: z.string().min(1),
  source: LibrarySourceSchema.default("player"),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type VoiceTemplate = z.infer<typeof VoiceTemplateSchema>;

export const RulesetTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  attributes: z.array(AttributeDefSchema).default(() => []),
  source: LibrarySourceSchema.default("player"),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type RulesetTemplate = z.infer<typeof RulesetTemplateSchema>;

/**
 * A named thing that can be placed in a scene. Tags are this shelf only
 * (relic, key). storyId / placeId are optional homes — not locks.
 */
export const ObjectTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  note: z.string().default(""),
  tags: z.array(z.string().min(1)).default(() => []),
  storyId: z.string().min(1).optional(),
  placeId: z.string().min(1).optional(),
  weight: z.number().nonnegative().optional(),
  difficulty: z.number().nonnegative().optional(),
  checkAttribute: z.string().min(1).optional(),
  source: LibrarySourceSchema.default("player"),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ObjectTemplate = z.infer<typeof ObjectTemplateSchema>;

/** When a scene Trigger may fire. Named beat — not a clock. */
export const TriggerWhenSchema = z.enum(["return_to_bar"]);
export type TriggerWhen = z.infer<typeof TriggerWhenSchema>;

export const CampaignTriggerSchema = z.object({
  id: z.string().min(1),
  /** What happens this beat, in plain language. */
  content: z.string().min(1),
  /** Already in play: said in chat ever, or in someone's hands. */
  keywords: z.array(z.string().min(1)).default(() => []),
  when: TriggerWhenSchema.default("return_to_bar"),
  /** Story flags this beat requires present — on top of `when`/`keywords`. */
  requiresFlags: z.array(z.string().min(1)).default(() => []),
  /** Story flags that must be ABSENT — a beat that stops firing once something else happened. */
  requiresAbsentFlags: z.array(z.string().min(1)).default(() => []),
  /** Story flags this beat sets the turn it fires. */
  setsFlags: z.array(z.string().min(1)).default(() => [])
});
export type CampaignTrigger = z.infer<typeof CampaignTriggerSchema>;

/**
 * One connection in the Storyboard: this scene leads to that one. Purely
 * authoring-time map data — it does not by itself make Start auto-chain
 * from one scene into the next (Scenes are still separate nights); it is
 * what a future "which scenes are open" view reads, and what the
 * Storyboard canvas draws as an arrow between two scene cards.
 */
export const StoryboardLinkSchema = z.object({
  id: z.string().min(1),
  fromSceneId: z.string().min(1),
  toSceneId: z.string().min(1),
  /** Story flags that must be present for this path to be open. */
  requiresFlags: z.array(z.string().min(1)).default(() => []),
  /** Story flags that must be absent — the case a plain requirement can't express. */
  requiresAbsentFlags: z.array(z.string().min(1)).default(() => []),
  /** Story flags this path sets when taken. */
  setsFlags: z.array(z.string().min(1)).default(() => []),
  /** Short chip text on the connector, e.g. "spelaren väljer". */
  label: z.string().default("")
});
export type StoryboardLink = z.infer<typeof StoryboardLinkSchema>;

/** Canvas placement for a scene card on the Storyboard. Missing = not yet placed. */
export const StoryboardPositionSchema = z.object({
  x: z.number(),
  y: z.number()
});
export type StoryboardPosition = z.infer<typeof StoryboardPositionSchema>;

export const CampaignMemberSchema = z.object({
  characterId: z.string().min(1),
  /** Starting rule-set numbers for this campaign. Where they stand is on the scene. */
  stats: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .default(() => ({}))
    .transform((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value)]))
    ),
  /** Keyword lore for this person in this campaign — not the archive card. */
  lore: z.array(CharacterLoreEntrySchema).default(() => [])
});
export type CampaignMember = z.infer<typeof CampaignMemberSchema>;

/** Who the player is tonight. Not an archive card. Not in Who is here. */
export const CampaignPlayerSchema = z.object({
  name: z.string().default(""),
  appearance: z.string().default(""),
  personality: z.string().default(""),
  pronoun: CharacterPronounSchema.optional(),
  portraitDataUrl: z.string().optional(),
  stats: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .default(() => ({}))
    .transform((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value)]))
    ),
});
export type CampaignPlayer = z.infer<typeof CampaignPlayerSchema>;

export function emptyCampaignPlayer(): CampaignPlayer {
  return CampaignPlayerSchema.parse({});
}

export function campaignPlayerIsFilled(player: CampaignPlayer | undefined): boolean {
  if (!player) return false;
  return Boolean(
    player.name.trim() ||
      player.appearance.trim() ||
      player.personality.trim() ||
      player.pronoun ||
      player.portraitDataUrl?.trim() ||
      Object.values(player.stats).some((value) => String(value).trim())
  );
}

export const SceneCastSchema = z.object({
  characterId: z.string().min(1),
  position: z.string().default(""),
  mood: z.string().default(""),
  clothing: z.string().default(""),
  holding: z.string().default(""),
  trust: z.string().default("20"),
  familiarity: z.string().default("10"),
  tension: z.string().default("5")
});
export type SceneCast = z.infer<typeof SceneCastSchema>;

/** Player-facing What now? button. `room` is a listed room, the landmark, or this beat. */
export const WhatNowChoiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().default(""),
  room: z.string().default("")
});
export type WhatNowChoice = z.infer<typeof WhatNowChoiceSchema>;

/** One Triggered-by list and its buttons. Several may live on a scene. */
export const WhatNowSetSchema = z.object({
  id: z.string().min(1),
  keywords: z.array(z.string().min(1)).default(() => []),
  choices: z.array(WhatNowChoiceSchema).max(3).default(() => [])
});
export type WhatNowSet = z.infer<typeof WhatNowSetSchema>;

function migrateSceneWhatNow(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const rec = { ...(raw as Record<string, unknown>) };
  const authored = Array.isArray(rec.whatNowSets) ? rec.whatNowSets : null;
  const leftoverChoices = Array.isArray(rec.whatNow) ? rec.whatNow : [];
  const leftoverKeywords = Array.isArray(rec.whatNowKeywords) ? rec.whatNowKeywords : [];
  delete rec.whatNow;
  delete rec.whatNowKeywords;
  if (authored && authored.length > 0) {
    rec.whatNowSets = authored;
    return rec;
  }
  rec.whatNowSets =
    leftoverChoices.length > 0 || leftoverKeywords.length > 0
      ? [
          {
            id: typeof rec.id === "string" && rec.id.trim() ? `${rec.id}-replies` : "replies",
            keywords: leftoverKeywords,
            choices: leftoverChoices
          }
        ]
      : authored ?? [];
  return rec;
}

export const CampaignSceneSchema = z.preprocess(
  migrateSceneWhatNow,
  z.object({
    id: z.string().min(1),
    name: z.string().default(""),
    placeId: z.string().default(""),
    /** Empty = the landmark floor. Otherwise a focal room id on that place. */
    startRoomId: z.string().default(""),
    people: z.array(SceneCastSchema).default([]),
    objectIds: z.array(z.string()).default([]),
    triggers: z.array(CampaignTriggerSchema).default([]),
    /** Pre-defined Replies: each entry is Triggered by + up to three buttons. */
    whatNowSets: z.array(WhatNowSetSchema).default(() => []),
    /** Card position on the Storyboard canvas. Missing = not yet placed. */
    position: StoryboardPositionSchema.optional()
  })
);
export type CampaignScene = z.infer<typeof CampaignSceneSchema>;

/**
 * A campaign picks from the library. A scene is tonight — where, who,
 * and optional Triggers. Start copies one scene onto a live session.
 */
export const CampaignTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Player-facing. Never sent to the model. */
  playerIntro: z.string().default(""),
  /** Writer premise for Pass 1. Characters do not automatically know it. */
  startPrompt: z.string().default(""),
  model: z.string().optional(),
  rulesetId: z.string().optional(),
  voiceId: z.string().optional(),
  /** The map. Every landmark in this realm belongs to the campaign. */
  realmId: z.string().optional(),
  /** Leftover. New saves use `realmId`. Still read if realmId is empty. */
  placeIds: z.array(z.string()).default([]),
  people: z.array(CampaignMemberSchema).default([]),
  /** Who you play. Sheet on You — not a library NPC. */
  player: CampaignPlayerSchema.optional(),
  objectIds: z.array(z.string()).default([]),
  scenes: z.array(CampaignSceneSchema).default([]),
  /** The Storyboard: how this campaign's scenes connect. */
  sceneLinks: z.array(StoryboardLinkSchema).default(() => []),
  /**
   * Character-shelf Look for. Empty = All. `__unsorted__` = no tags.
   * Does not change who already belongs. Not used on Objects.
   */
  lens: z.string().optional(),
  /** Landmark-shelf Look for. Same shape as `lens`. */
  placeLens: z.string().optional(),
  /** Object-shelf Look for. Same shape as `lens`. */
  objectLens: z.string().optional(),
  source: LibrarySourceSchema.default("player"),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CampaignTemplate = z.infer<typeof CampaignTemplateSchema>;

export function parseCharacterTemplate(input: unknown): CharacterTemplate {
  return CharacterTemplateSchema.parse(input);
}

export function parsePlaceTemplate(input: unknown): PlaceTemplate {
  const withRealm = attachRealmId(input);
  const direct = PlaceTemplateSchema.safeParse(withRealm);
  if (direct.success) return direct.data;
  return PlaceTemplateSchema.parse(sanitizePlacePictures(withRealm));
}

function attachRealmId(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const row = input as Record<string, unknown>;
  const realmId = typeof row.realmId === "string" && row.realmId.trim() ? row.realmId.trim() : FALLBACK_REALM_ID;
  return { ...row, realmId };
}

export function parseRealmTemplate(input: unknown): RealmTemplate {
  const direct = RealmTemplateSchema.safeParse(input);
  if (direct.success) return direct.data;
  return RealmTemplateSchema.parse(sanitizePlacePictures(input));
}

function asStoredPicture(value: unknown): { thumbDataUrl: string; imageDataUrl: string } | null {
  if (!value || typeof value !== "object") return null;
  const thumb = "thumbDataUrl" in value && typeof value.thumbDataUrl === "string" ? value.thumbDataUrl.trim() : "";
  const image = "imageDataUrl" in value && typeof value.imageDataUrl === "string" ? value.imageDataUrl.trim() : "";
  const picture = image || thumb;
  if (!picture) return null;
  return { thumbDataUrl: thumb || picture, imageDataUrl: picture };
}

function sanitizePlacePictures(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const row = input as Record<string, unknown>;
  const gallery = Array.isArray(row.gallery)
    ? row.gallery.map(asStoredPicture).filter((item): item is NonNullable<typeof item> => item !== null)
    : row.gallery;
  const rooms = Array.isArray(row.rooms)
    ? row.rooms.map((room) => {
        if (!room || typeof room !== "object") return room;
        const entry = room as Record<string, unknown>;
        const roomGallery = Array.isArray(entry.gallery)
          ? entry.gallery.map(asStoredPicture).filter((item): item is NonNullable<typeof item> => item !== null)
          : entry.gallery;
        return { ...entry, gallery: roomGallery };
      })
    : row.rooms;
  const cover = asStoredPicture({
    thumbDataUrl: row.thumbDataUrl,
    imageDataUrl: row.imageDataUrl
  });
  return {
    ...row,
    ...(cover ? { thumbDataUrl: cover.thumbDataUrl, imageDataUrl: cover.imageDataUrl } : {}),
    gallery,
    rooms
  };
}

export function parseStoryTemplate(input: unknown): StoryTemplate {
  return StoryTemplateSchema.parse(input);
}

export function parseVoiceTemplate(input: unknown): VoiceTemplate {
  return VoiceTemplateSchema.parse(input);
}

export function parseRulesetTemplate(input: unknown): RulesetTemplate {
  return RulesetTemplateSchema.parse(sanitizeRuleset(input));
}

function sanitizeRuleset(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const row = input as Record<string, unknown>;
  if (!Array.isArray(row.attributes)) return input;
  return {
    ...row,
    attributes: row.attributes.map((attribute) => {
      if (!attribute || typeof attribute !== "object") return attribute;
      const entry = attribute as Record<string, unknown>;
      if (!Array.isArray(entry.options)) return entry;
      return {
        ...entry,
        options: entry.options.filter((option): option is string => typeof option === "string" && option.trim().length > 0)
      };
    })
  };
}

export function parseObjectTemplate(input: unknown): ObjectTemplate {
  return ObjectTemplateSchema.parse(input);
}

export function parseCampaignTemplate(input: unknown): CampaignTemplate {
  return CampaignTemplateSchema.parse(input);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** List/load salvage after a crash: fill missing stamps/tags, still require a name. */
export function recoverCharacterTemplate(input: unknown): CharacterTemplate | null {
  const first = CharacterTemplateSchema.safeParse(input);
  if (first.success) return first.data;
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const stamp = nowIso();
  const tags = Array.isArray(row.tags)
    ? row.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
    : [];
  const second = CharacterTemplateSchema.safeParse({
    ...row,
    tags,
    createdAt: typeof row.createdAt === "string" && row.createdAt.trim() ? row.createdAt : stamp,
    updatedAt: typeof row.updatedAt === "string" && row.updatedAt.trim() ? row.updatedAt : stamp
  });
  return second.success ? second.data : null;
}

export function newCharacterTemplate(
  fields: Omit<z.input<typeof CharacterTemplateSchema>, "id" | "createdAt" | "updatedAt"> & { id?: string }
): CharacterTemplate {
  const stamp = nowIso();
  return CharacterTemplateSchema.parse({
    ...fields,
    id: fields.id ?? crypto.randomUUID(),
    createdAt: stamp,
    updatedAt: stamp
  });
}

export function newPlaceTemplate(
  fields: Omit<z.input<typeof PlaceTemplateSchema>, "id" | "createdAt" | "updatedAt" | "realmId"> & {
    id?: string;
    rooms?: PlaceTemplate["rooms"];
    realmId?: string;
  }
): PlaceTemplate {
  const stamp = nowIso();
  return PlaceTemplateSchema.parse({
    ...fields,
    realmId: fields.realmId?.trim() || FALLBACK_REALM_ID,
    id: fields.id ?? crypto.randomUUID(),
    createdAt: stamp,
    updatedAt: stamp
  });
}

export function newRealmTemplate(
  fields: Omit<RealmTemplate, "id" | "createdAt" | "updatedAt"> & { id?: string }
): RealmTemplate {
  const stamp = nowIso();
  return RealmTemplateSchema.parse({
    ...fields,
    id: fields.id ?? crypto.randomUUID(),
    createdAt: stamp,
    updatedAt: stamp
  });
}

export function newStoryTemplate(
  fields: Omit<StoryTemplate, "id" | "createdAt" | "updatedAt"> & { id?: string }
): StoryTemplate {
  const stamp = nowIso();
  return StoryTemplateSchema.parse({
    ...fields,
    id: fields.id ?? crypto.randomUUID(),
    createdAt: stamp,
    updatedAt: stamp
  });
}

export function newVoiceTemplate(
  fields: Omit<VoiceTemplate, "id" | "createdAt" | "updatedAt"> & { id?: string }
): VoiceTemplate {
  const stamp = nowIso();
  return VoiceTemplateSchema.parse({
    ...fields,
    id: fields.id ?? crypto.randomUUID(),
    createdAt: stamp,
    updatedAt: stamp
  });
}

export function newRulesetTemplate(
  fields: Omit<RulesetTemplate, "id" | "createdAt" | "updatedAt"> & { id?: string }
): RulesetTemplate {
  const stamp = nowIso();
  return RulesetTemplateSchema.parse({
    ...fields,
    id: fields.id ?? crypto.randomUUID(),
    createdAt: stamp,
    updatedAt: stamp
  });
}

export function newObjectTemplate(
  fields: Omit<ObjectTemplate, "id" | "createdAt" | "updatedAt"> & { id?: string }
): ObjectTemplate {
  const stamp = nowIso();
  return ObjectTemplateSchema.parse({
    ...fields,
    id: fields.id ?? crypto.randomUUID(),
    createdAt: stamp,
    updatedAt: stamp
  });
}

export function newCampaignTemplate(
  fields: Omit<z.input<typeof CampaignTemplateSchema>, "id" | "createdAt" | "updatedAt"> & { id?: string }
): CampaignTemplate {
  const stamp = nowIso();
  return CampaignTemplateSchema.parse({
    ...fields,
    id: fields.id ?? crypto.randomUUID(),
    createdAt: stamp,
    updatedAt: stamp
  });
}

/** Landmarks in play: the whole realm, or leftover `placeIds` if no realm is set. */
export function campaignLandmarks(
  campaign: Pick<CampaignTemplate, "realmId" | "placeIds">,
  places: PlaceTemplate[]
): PlaceTemplate[] {
  const realmId = campaign.realmId?.trim();
  if (realmId) return places.filter((item) => item.realmId === realmId);
  const ids = new Set(campaign.placeIds);
  if (ids.size === 0) return [];
  return places.filter((item) => ids.has(item.id));
}

/** Old campaigns listed landmarks. One shared realm becomes `realmId`. */
export function inferCampaignRealmId(
  campaign: Pick<CampaignTemplate, "realmId" | "placeIds">,
  places: PlaceTemplate[]
): string {
  const named = campaign.realmId?.trim();
  if (named) return named;
  const realms = new Set(
    places.filter((item) => campaign.placeIds.includes(item.id)).map((item) => item.realmId.trim()).filter(Boolean)
  );
  if (realms.size === 1) return [...realms][0] ?? "";
  return "";
}

export function emptyCampaignScene(): CampaignScene {
  return CampaignSceneSchema.parse({
    id: crypto.randomUUID(),
    name: "Opening"
  });
}

export function emptyWhatNowSet(): WhatNowSet {
  return WhatNowSetSchema.parse({
    id: crypto.randomUUID(),
    keywords: [],
    choices: [{ id: crypto.randomUUID(), label: "", room: "" }]
  });
}

/** Prefers authored groups; wraps a leftover single list from old saves or a live draft. */
export function whatNowSetsFromScene(scene: {
  id?: string;
  whatNowSets?: WhatNowSet[];
  whatNow?: WhatNowChoice[];
  whatNowKeywords?: string[];
}): WhatNowSet[] {
  return CampaignSceneSchema.parse({
    id: scene.id?.trim() || "scene",
    name: "Opening",
    whatNowSets: scene.whatNowSets,
    whatNow: scene.whatNow,
    whatNowKeywords: scene.whatNowKeywords
  }).whatNowSets;
}

export function triggerWhenLabel(when: TriggerWhen): string {
  if (when === "return_to_bar") return "You come back to the bar";
  return when;
}

function uniqueLabels(raw: string, split: RegExp): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const part of raw.split(split)) {
    const label = part.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

/** Split a typed tag field into unique tags, preserving first casing. */
export function parseTagList(raw: string): string[] {
  return uniqueLabels(raw, /[,;]/);
}

/** Allowed values for a text rule-set field. Lines, commas, or semicolons. */
export function parseChoiceOptions(raw: string): string[] {
  return uniqueLabels(raw, /[\n,;]/);
}

export function formatTagList(tags: string[]): string {
  return tags.join(", ");
}

export const IMPORTED_TAG = "Imported";

export function ensureImportedTag(tags: string[], source: LibrarySource): string[] {
  if (source !== "sillytavern") return tags;
  if (tags.some((tag) => tag.toLowerCase() === IMPORTED_TAG.toLowerCase())) return tags;
  return [...tags, IMPORTED_TAG];
}

/** Library chip / session title when the player only wrote the long premise. */
export function deriveStoryTitle(title: string, premise: string): string {
  const named = title.trim();
  if (named) return named;
  const first = premise.trim().split(/\n/)[0]?.trim() ?? "";
  if (!first) return "Untitled story";
  if (first.length <= 48) return first;
  return `${first.slice(0, 45).trimEnd()}…`;
}
