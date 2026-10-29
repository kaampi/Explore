import { z } from "zod";

/**
 * Canonical Data Model — Master Spec §54.
 * This is the single source of truth for what a session's shape looks like.
 * Every mutation, every LLM proposal, every import must validate against
 * these schemas before it can touch the State Engine (§8.1 Valideringspipeline).
 */

export const CURRENT_SCHEMA_VERSION = 2;

// ---------------------------------------------------------------------------
// Variable Locking — §7
// ---------------------------------------------------------------------------

export const LockStateSchema = z.enum(["unlocked", "player_locked", "system_locked"]);
export type LockState = z.infer<typeof LockStateSchema>;

/**
 * A lockable field wraps any mutable value with its lock state.
 * Authority/Lock Resolution (§6, §8.1) reads `.lock` before ever
 * accepting an AI-proposed mutation to `.value`.
 */
export function lockable<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    value: valueSchema,
    lock: LockStateSchema.default("unlocked")
  });
}

// ---------------------------------------------------------------------------
// Scene / Positioning — §20-21 (Relative positioning, proximity zones)
// ---------------------------------------------------------------------------

export const ProximityZoneSchema = z.enum(["intimate", "personal", "social"]);
export type ProximityZone = z.infer<typeof ProximityZoneSchema>;

export const PositionSchema = z.object({
  location: z.string(),
  zone: ProximityZoneSchema.optional(),
  relativeTo: z.string().optional() // character id this position is relative to, if any
});

export const ScenePictureSchema = z.object({
  thumbDataUrl: z.string().min(1),
  imageDataUrl: z.string().min(1)
});
export type ScenePicture = z.infer<typeof ScenePictureSchema>;

export const PicturePlaySchema = z.enum(["fade", "random"]);
export type PicturePlay = z.infer<typeof PicturePlaySchema>;

export const SceneRoomSchema = z.object({
  id: z.string().min(1),
  /** Display name, e.g. Emma's room. */
  label: z.string().min(1),
  /** Room intro — typed over the picture. Player-facing. */
  description: z.string().default(""),
  /** Compact Here text for Pass 1. Empty = fall back to the intro. */
  brief: z.string().optional(),
  keywords: z.array(z.string().min(1)).default(() => []),
  /**
   * Focal ids you must already be in to walk here.
   * Empty = from the landmark floor only. `__floor__` = the landmark.
   */
  fromRoomIds: z.array(z.string()).default([]),
  /**
   * How this door shows in play. `open` = a Go button. `locked` = visible, shut
   * until chat names it or the player opens it. `hidden` = no button until named.
   */
  gate: z.enum(["open", "locked", "hidden"]).default("open"),
  /** List thumb. UI only — never sent to the model. */
  thumbDataUrl: z.string().optional(),
  /** Chat backdrop. UI only — never sent to the model. */
  imageDataUrl: z.string().optional(),
  /** Extra backdrops after the first. UI only. */
  gallery: z.array(ScenePictureSchema).optional(),
  /** Several pictures: slow crossfade, or one at random when you enter. */
  picturePlay: PicturePlaySchema.optional(),
  /** Looping ambient. UI only — never sent to the model. */
  audioDataUrl: z.string().optional(),
  /** Extra loops after the first. UI only. */
  audioGallery: z.array(z.string().min(1)).optional(),
  /** Several loops: slow crossfade, or one at random when you enter. */
  audioPlay: PicturePlaySchema.optional()
});
export type SceneRoom = z.infer<typeof SceneRoomSchema>;

export const WorldStateSchema = z.object({
  location: z.string(),
  /** Atlas parent (City of Dunbaar). Not Here — the landmark/room is. */
  realm: z.string().optional(),
  environment: z.object({
    lighting: z.string().optional(),
    noise: z.string().optional(),
    music: z.boolean().optional()
  }),
  /** Venue intro — typed over the picture. Player-facing. */
  note: z.string().optional(),
  /** Compact Here text for Pass 1. Empty = fall back to the intro. */
  brief: z.string().optional(),
  /** Venue thumb. UI only. */
  thumbDataUrl: z.string().optional(),
  /** Venue backdrop. UI only. */
  imageDataUrl: z.string().optional(),
  /** Extra venue backdrops after the first. UI only. */
  gallery: z.array(ScenePictureSchema).optional(),
  /** Several pictures: slow crossfade, or one at random when you enter. */
  picturePlay: PicturePlaySchema.optional(),
  /** Venue ambient loop. UI only. */
  audioDataUrl: z.string().optional(),
  /** Extra venue loops after the first. UI only. */
  audioGallery: z.array(z.string().min(1)).optional(),
  audioPlay: PicturePlaySchema.optional(),
  rooms: z.array(SceneRoomSchema).optional(),
  /** Library landmark this scene is on. Used to list other landmarks on Go. */
  placeId: z.string().min(1).optional(),
  /** Player-facing realm blurb. Not Here. */
  realmNote: z.string().optional(),
  /** Compact realm fact for Pass 1. Empty = fall back to realmNote. */
  realmBrief: z.string().optional(),
  /** Realm pictures/audio. UI only — fallback when the landmark has none. */
  realmVisual: z
    .object({
      thumbDataUrl: z.string().optional(),
      imageDataUrl: z.string().optional(),
      gallery: z.array(ScenePictureSchema).optional(),
      picturePlay: PicturePlaySchema.optional(),
      audioDataUrl: z.string().optional(),
      audioGallery: z.array(z.string().min(1)).optional(),
      audioPlay: PicturePlaySchema.optional()
    })
    .optional()
});

/**
 * Ground story — the world/campaign premise. Independent of any one
 * place: Bag End and Mount Doom can share the same story.
 */
export const StoryStateSchema = z.object({
  title: z.string().default(""),
  premise: z.string().min(1)
});
export type StoryState = z.infer<typeof StoryStateSchema>;

/**
 * Narrator / GM instruction — how the model should tell the scene.
 * Distinct from ground story (what the world is).
 */
export const VoiceStateSchema = z.object({
  title: z.string().default(""),
  instruction: z.string().min(1)
});
export type VoiceState = z.infer<typeof VoiceStateSchema>;

/**
 * One field in a campaign rule-set (strength, jealousy, hull integrity…).
 * The set lives on the campaign; values live on character instances.
 * High/low/mid meanings are what the live number does — assembled into Pass 1 as fact.
 * `description` is a fallback for older cards that only had one meaning field.
 */
export const AttributeDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["number", "text"]).default("number"),
  min: z.number().optional(),
  max: z.number().optional(),
  /** Fallback meaning when high/low are empty. Sent to the model. */
  description: z.string().default(""),
  /** What's true in the fiction when this reads high (~top 30% of the field's scale). */
  highMeaning: z.string().default(""),
  /** What's true when this reads low (~bottom 30%). */
  lowMeaning: z.string().default(""),
  /** Optional distinct mid-band behavior. Otherwise both sides, framed as neither extreme. */
  midMeaning: z.string().default(""),
  /**
   * Allowed values for a text field. Adventure shows these as picks.
   * Empty = free text.
   */
  options: z.array(z.string().min(1)).default(() => []),
  /**
   * How far Pass 2 may move this number per beat. 0 = stays put
   * (strength, orientation). 15 ≈ a kiss raising arousal. 3 = a nudge.
   */
  maxShift: z.number().min(0).max(100).default(0),
  /**
   * At most one number field per rule-set. Its live band feeds the warm beat
   * (kiss/hug when asked). Unset = gate on trust alone.
   */
  role: z.enum(["desire"]).optional()
});
export type AttributeDef = z.infer<typeof AttributeDefSchema>;

export const RulesetStateSchema = z.object({
  name: z.string().min(1),
  attributes: z.array(AttributeDefSchema).default(() => [])
});
export type RulesetState = z.infer<typeof RulesetStateSchema>;

export const StatValueSchema = z.union([z.number(), z.string()]);

export const CharacterPronounSchema = z.string().trim().min(1).max(32);
export type CharacterPronoun = z.infer<typeof CharacterPronounSchema>;

/** Years. Empty / junk from older cards is unspecified. */
export const ApproximateAgeSchema = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return undefined;
  const n = typeof val === "number" ? val : Number(String(val).trim());
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n);
}, z.number().int().min(1).max(130).optional());

// ---------------------------------------------------------------------------
// Character State — §5.1
// ---------------------------------------------------------------------------

export const CharacterStateSchema = z.object({
  sourceLibraryId: z.string().min(1).optional(),
  /** Optional reference to a reusable anatomical template. */
  anatomyTemplateId: z.string().min(1).max(100).optional(),
  /** Per-character parts added to or removed from the selected template. */
  anatomyOverrides: z.object({ addedParts: z.array(z.string().min(1).max(80)).max(64).default([]), removedParts: z.array(z.string().min(1).max(80)).max(64).default([]) }).optional(),
  /** Given name; the record key is a slug. Falls back to a title-cased id in the UI. */
  name: z.string().min(1).optional(),
  /**
   * Leftover on old sessions. Unused — narration uses pronoun until the given name is heard.
   */
  knownAs: z.string().optional(),
  /** Years. Unspecified if omitted. */
  approximateAge: ApproximateAgeSchema,
  /** Surname. Narration uses `name` unless formality needs this. */
  familyName: z.string().optional(),
  /** Middle name(s). Narration still uses `name`. */
  middleName: z.string().optional(),
  /**
   * Grammatical person for narration. Archive identity, not a scene variable.
   * Unset cards stay valid; Pass 1 then falls back to she/he/it as fits the name.
   */
  pronoun: CharacterPronounSchema.optional(),
  /**
   * Body and face. Not clothes — those change with the scene.
   */
  appearance: z.string().optional(),
  position: lockable(z.string()),
  pose: lockable(z.string()).optional(),
  mood: lockable(z.string()),
  /** What they are wearing in this scene. Not archive identity. */
  clothing: lockable(z.string()).optional(),
  /** What is in their hands right now. Empty string = empty hands. */
  holding: lockable(z.string()).optional(),
  energy: lockable(z.number().min(0).max(100)).optional(),
  /** Values for the campaign rule-set; keys match AttributeDef.id. */
  stats: z.record(z.string(), lockable(StatValueSchema)).optional(),
  /** UI portrait; never sent to the model. */
  portraitDataUrl: z.string().optional()
});
export type CharacterState = z.infer<typeof CharacterStateSchema>;

const MeterSchema = lockable(z.number().min(0).max(100));

function asLockableMeter(val: unknown): unknown {
  if (typeof val === "number") return { value: val, lock: "unlocked" };
  return val;
}

// ---------------------------------------------------------------------------
// Relationship State — §5.1
// ---------------------------------------------------------------------------

export const RelationshipStateSchema = z.object({
  trust: z.preprocess(asLockableMeter, MeterSchema),
  familiarity: z.preprocess(asLockableMeter, MeterSchema),
  tension: z.preprocess(asLockableMeter, MeterSchema)
});
export type RelationshipState = z.infer<typeof RelationshipStateSchema>;

// ---------------------------------------------------------------------------
// Layers — §12-14 (full activation/priority logic lands in Phase 4;
// this is the minimal shape needed so Session can reference layers now)
// ---------------------------------------------------------------------------

export const LayerTypeSchema = z.enum(["core", "relationship", "environment", "state_trigger"]);
export type LayerType = z.infer<typeof LayerTypeSchema>;

export const LayerSchema = z.object({
  loreSource: z.object({ bookId: z.string(), entryId: z.string(), bookName: z.string() }).optional(),
  id: z.string(),
  type: LayerTypeSchema,
  priority: z.number().int(),
  /** The actual behavioral instruction text this layer contributes to context. */
  content: z.string().default(""),
  /**
   * Auto-activation condition. `dot.path==value` (string comparison), or a
   * named beat such as `return_to_bar`. Evaluated live by LayerEngine —
   * not persisted as a computed result.
   */
  trigger: z.string().optional(),
  /**
   * When non-empty, this layer is in context only if `active` (player
   * approved) AND at least one keyword hits recent conversation.
   * Lore stays on disk without paying tokens every turn.
   * On an `once` layer, keywords mean the thing is already in play
   * (ever said in chat, or in someone's hands) — not a last-8 wake.
   */
  keywords: z.array(z.string().min(1)).optional(),
  /** Fire at most one turn, then `spent`. Player-approved (`active`) still required. */
  once: z.boolean().optional(),
  /** A spent once-layer never returns. */
  spent: z.boolean().optional(),
  /**
   * Story flags this layer requires to be effectively active, on top of
   * its own trigger/keyword gate. AND'd together; empty/missing = no
   * requirement. Same story-flag pool as scene links (Storyboard).
   */
  requiresFlags: z.array(z.string().min(1)).optional(),
  /**
   * Story flags that must be ABSENT — the case a plain `trigger` cannot
   * express. A dream about a brooch never fires once it was given away:
   * `requiresAbsentFlags: ["brosch_given"]`.
   */
  requiresAbsentFlags: z.array(z.string().min(1)).optional(),
  /** Story flags this layer sets the turn it fires (paired with `once`). */
  setsFlags: z.array(z.string().min(1)).optional(),
  active: z.boolean().default(false),
  aiGenerated: z.boolean().default(false)
});
export type Layer = z.infer<typeof LayerSchema>;

// ---------------------------------------------------------------------------
// Memory — §16-19 (full retrieval/ranking lands in Phase 4)
// ---------------------------------------------------------------------------

export const MemoryEntrySchema = z.object({
  id: z.string(),
  createdAtTurn: z.number().int().nonnegative(),
  importance: z.number().min(0).max(1),
  content: z.string()
});
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export const MemoryTypeSchema = z.enum(["episodic", "semantic", "relational"]);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const MemorySchema = z.object({
  episodic: z.array(MemoryEntrySchema).default([]),
  semantic: z.array(MemoryEntrySchema).default([]),
  relational: z.array(MemoryEntrySchema).default([])
});

// ---------------------------------------------------------------------------
// Conversation — one entry in the turn-by-turn dialogue history.
// Stored loosely as z.unknown() on Session itself (see below) so old/
// malformed entries don't block loading the rest of the session; callers
// that need typed turns (ContextEngine, SessionEngine) parse against this
// schema explicitly and skip entries that don't match.
// ---------------------------------------------------------------------------

export const ConversationTurnSchema = z.object({
  turn: z.number().int().nonnegative(),
  role: z.enum(["player", "character", "system"]),
  speaker: z.string().optional(),
  /** Leftover NPC: the card is Narrator, not their portrait. */
  toldBy: z.enum(["narrator"]).optional(),
  content: z.string()
});
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

// ---------------------------------------------------------------------------
// Events — §9 (full EventLog implementation lives in src/events/)
// ---------------------------------------------------------------------------

export const StateEventSchema = z.object({
  id: z.string(),
  turn: z.number().int().nonnegative(),
  timestamp: z.string(), // ISO 8601
  type: z.string(),
  payload: z.unknown()
});

// ---------------------------------------------------------------------------
// Session Runtime — §54
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_REPLY_TOKENS = 128;

/** Status-bar presets for Pass 1 `num_predict`. ~4 characters per token. */
export const REPLY_LENGTH_PRESETS = [
  { id: "short", tokens: 96, label: "short" },
  { id: "beat", tokens: 128, label: "beat" },
  { id: "long", tokens: 160, label: "long" }
] as const;

/** Old status-bar caps (when beat was ~900 characters). 160 was old short — it is now long. */
const LEGACY_REPLY_TOKEN_CAPS: Record<number, number> = {
  240: 128,
  400: 160
};

export function effectiveMaxReplyTokens(stored?: number): number {
  const n = stored ?? DEFAULT_MAX_REPLY_TOKENS;
  return LEGACY_REPLY_TOKEN_CAPS[n] ?? n;
}

/** Extra num_predict so Ollama does not clip the last sentence. The model is told to stop itself. */
export const REPLY_TOKEN_HEADROOM = 64;

export function pass1PredictTokens(stored?: number): number {
  return Math.min(1024, effectiveMaxReplyTokens(stored) + REPLY_TOKEN_HEADROOM);
}

export const RuntimeConfigSchema = z.object({
  model: z.string(),
  modelVersion: z.string().optional(),
  temperature: z.number().min(0).max(2),
  seed: z.number().int().nullable().default(null),
  provider: z.string(),
  /** Pass 1 only — Ollama `num_predict`. Pass 2 is uncapped. */
  maxReplyTokens: z.number().int().min(64).max(1024).optional()
});

export const PlayerStateSchema = z.object({
  position: lockable(z.string()),
  status: lockable(z.string()),
  name: z.string().optional(),
  appearance: z.string().optional(),
  personality: z.string().optional(),
  pronoun: CharacterPronounSchema.optional(),
  portraitDataUrl: z.string().optional(),
  stats: z.record(z.string(), z.string()).optional()
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;

/** A library object placed in this scene — canon for what exists here. */
export const SceneObjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  note: z.string().default(""),
  tags: z.array(z.string()).default([]),
  weight: z.number().nonnegative().optional(),
  difficulty: z.number().nonnegative().optional(),
  checkAttribute: z.string().min(1).optional()
});
export type SceneObject = z.infer<typeof SceneObjectSchema>;

// ---------------------------------------------------------------------------
// Session — the root of the Canonical Data Model
// ---------------------------------------------------------------------------

/**
 * Persistent physical facts. These are observations, not executable instructions.
 * All references use canonical actor/object IDs; unknown relationships must not
 * be inferred from prose. Changes require explicit state updates.
 */
export const PhysicalRelationSchema = z.object({
  id: z.string().min(1).max(100),
  subject: z.string().min(1).max(100),
  relation: z.enum(["behind", "in_front_of", "beside", "facing", "holding", "touching", "blocking", "restraining", "on", "inside"]),
  target: z.string().min(1).max(100),
  subjectPart: z.string().max(80).optional(),
  targetPart: z.string().max(80).optional(),
  /** Only explicit exclusive grips reserve a body part; legacy relations remain nonexclusive. */
  exclusive: z.boolean().optional(),
  note: z.string().max(300).optional()
});
export type PhysicalRelation = z.infer<typeof PhysicalRelationSchema>;

export const PhysicalStateSchema = z.object({
  stances: z.record(z.string(), z.enum(["standing", "sitting", "lying", "kneeling", "crouching", "all_fours", "moving"])).default({}),
  relations: z.array(PhysicalRelationSchema).max(100).default([])
});
export type PhysicalState = z.infer<typeof PhysicalStateSchema>;

/** Reusable, versioned body plans. Part IDs are arbitrary, not human-specific. */
export const AnatomyTemplateSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(120),
  imageDataUrl: z.string().max(6_000_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).optional(),
  version: z.number().int().positive(),
  parts: z.array(z.object({
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(120),
    group: z.string().max(80).optional(),
    description: z.string().max(1000).optional(),
    capabilities: z.array(z.enum(["grasp", "support", "locomote", "sense", "manipulate"])).max(5).default([])
  })).min(1).max(128)
}).refine((template) => new Set(template.parts.map((part) => part.id)).size === template.parts.length, {
  message: "Anatomy part IDs must be unique."
});
export type AnatomyTemplate = z.infer<typeof AnatomyTemplateSchema>;

export const SessionSchema = z.object({
  schemaVersion: z.number().int().positive(),
  id: z.string(),
  runtime: RuntimeConfigSchema,
  stateVersion: z.number().int().nonnegative(),

  characters: z.record(z.string(), CharacterStateSchema).default({}),
  /** Session-pinned template snapshots: updates to a library template cannot alter active play. */
  anatomyTemplates: z.record(z.string(), AnatomyTemplateSchema).optional(),
  /** Canonical physical continuity, independent of chat history. */
  physical: PhysicalStateSchema.optional(),
  scene: WorldStateSchema.optional(),
  /**
   * Buttons showing now. Empty until a Pre-defined Replies trigger opens.
   * `room` is a listed room, the floor, or this beat (no move).
   */
  whatNow: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        room: z.string().min(1)
      })
    )
    .max(3)
    .optional(),
  /** Authored trigger groups. One may open at a time. */
  whatNowSets: z
    .array(
      z.object({
        id: z.string().min(1),
        keywords: z.array(z.string().min(1)).default([]),
        choices: z
          .array(
            z.object({
              id: z.string().min(1),
              label: z.string().min(1),
              room: z.string().min(1)
            })
          )
          .max(3)
      })
    )
    .optional(),
  /** Look-for tokens for the open group. Leftover on old sessions. */
  whatNowKeywords: z.array(z.string().min(1)).optional(),
  whatNowActiveSetId: z.string().min(1).optional(),
  /** True once this opening is over — chips only, until a listed button is picked. */
  whatNowOpen: z.boolean().optional(),
  /** Focal ids whose locked/hidden gate has lifted this play. */
  openedRoomIds: z.array(z.string().min(1)).default([]),
  /**
   * Freeform narrative facts a scene, once-beat, or Pre-defined Reply can
   * set — "the player gave Emma the brooch". A trigger or layer can then
   * require one present or, just as often, require one absent (the dream
   * about the brooch never fires once it was given away). Player/system
   * only, same as party and room state — never a direct AI write.
   */
  storyFlags: z.array(z.string().min(1)).default([]),
  /** Character ids the player accepted into the traveling party. Max 3. */
  partyIds: z.array(z.string().min(1)).max(3).default([]),
  /** Party members who stay put until Come. Still in the party. */
  partyHoldIds: z.array(z.string().min(1)).max(3).default([]),
  /** Asked to come along later — grey waitlist, not traveling. Max 2 in play. */
  partyPendingIds: z.array(z.string().min(1)).max(3).default([]),
  story: StoryStateSchema.optional(),
  voice: VoiceStateSchema.optional(),
  ruleset: RulesetStateSchema.optional(),
  /** Player-facing campaign pitch. UI only — never sent to the model. */
  campaignIntro: z.string().optional(),
  /**
   * Why they arrived — the agreement from the last scene, not the transcript.
   * Trusted Pass 1 fact. Empty = a fresh meeting.
   */
  handoff: z.string().optional(),
  /** What to carry to the next Start. Empty = seed from the last player line. */
  outgoingHandoff: z.string().optional(),
  /** Library campaign this play came from. Missing = a one-off scene. */
  campaignId: z.string().min(1).optional(),
  /** Authored scene that was Started. Studio uses this to land after new scene. */
  sceneId: z.string().min(1).optional(),
  player: PlayerStateSchema.optional(),
  objects: z.array(SceneObjectSchema).optional(),
  relationships: z.record(z.string(), RelationshipStateSchema).default({}),
  layers: z.array(LayerSchema).default([]),

  memory: MemorySchema.default({ episodic: [], semantic: [], relational: [] }),
  conversation: z.array(z.unknown()).default([]),
  events: z.array(StateEventSchema).default([]),
  snapshots: z.array(z.unknown()).default([]),
  diagnostics: z.array(z.unknown()).default([])
});

export type Session = z.infer<typeof SessionSchema>;

/** Validate an unknown value as a Session. Throws a ZodError on failure. */
export function parseSession(input: unknown): Session {
  return withDefaultPlayer(SessionSchema.parse(input));
}

/** Safe variant for validation pipelines that need to report errors, not throw. */
export function safeParseSession(input: unknown) {
  const parsed = SessionSchema.safeParse(input);
  if (!parsed.success) return parsed;
  return { ...parsed, data: withDefaultPlayer(parsed.data) };
}

function withDefaultPlayer(session: Session): Session {
  if (session.player) return session;
  return {
    ...session,
    player: {
      position: { value: session.scene?.location ?? "here", lock: "unlocked" },
      status: { value: "awake", lock: "unlocked" }
    }
  };
}

