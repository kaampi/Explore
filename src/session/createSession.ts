import { type PlayMode } from "../state/playMode";
import { formatPersonName } from "@library/personName";
import { DEFAULT_OLLAMA_MODEL } from "@llm/providers/OllamaProvider";
import {
  CURRENT_SCHEMA_VERSION,
  parseSession,
  type AttributeDef,
  type CharacterPronoun,
  type Session
} from "@state/StateSchema";
import { copyPictureFields } from "@state/placePictures";
import { copyAudioFields } from "@state/placeAudio";
import { copyWhatNowSets } from "@state/whatNowGate";

export interface CharacterDraft {
  name: string;
  familyName?: string;
  middleName?: string;
  approximateAge?: number;
  personality: string;
  mood: string;
  position: string;
  pronoun?: CharacterPronoun;
  appearance?: string;
  clothing?: string;
  holding?: string;
  portraitDataUrl?: string;
  lore?: Array<{ id?: string; title?: string; content: string; keywords?: string[]; purpose?: "world" | "storyline" | "rules" | undefined }>;
  libraryId?: string;
  saveToLibrary?: boolean;
  source?: "player" | "sillytavern" | "example";
  scenario?: string;
  createdAt?: string;
  /** String form values keyed by AttributeDef.id; parsed when the session is built. */
  stats?: Record<string, string>;
  /** Starting relationship meters 0–100. Omitted = engine defaults. */
  trust?: string;
  familiarity?: string;
  tension?: string;
}

export interface SceneSetup {
  playMode?: PlayMode;
  storyline?: string;
  location: string;
  /** Atlas parent. Not Here. */
  realm?: string;
  realmNote?: string;
  realmBrief?: string;
  realmVisual?: {
    thumbDataUrl?: string | undefined;
    imageDataUrl?: string | undefined;
    gallery?: Array<{ thumbDataUrl: string; imageDataUrl: string }> | undefined;
    picturePlay?: "fade" | "random" | undefined;
    audioDataUrl?: string | undefined;
    audioGallery?: string[] | undefined;
    audioPlay?: "fade" | "random" | undefined;
  };
  /** Library landmark this night is on. */
  placeId?: string;
  lighting: string;
  noise: string;
  music: boolean;
  /** Venue intro — typed over the picture. Player-facing. */
  placeNote: string;
  /** Compact Here text for Pass 1. Empty = fall back to `placeNote`. */
  placeBrief?: string;
  /**
   * Extra place lore, typically keyword-gated. Independent of the venue
   * intro and the compact prompt.
   */
  placeLore?: Array<{ content: string; keywords?: string[]; purpose?: "world" | "storyline" | "rules" | undefined }>;
  storyTitle?: string;
  storyPremise?: string;
  voiceTitle?: string;
  voiceInstruction?: string;
  model?: string;
  /** Player-facing campaign pitch. UI only — never assembled into the prompt. */
  campaignIntro?: string;
  /** Library campaign this play came from. Missing = a one-off scene. */
  campaignId?: string;
  /** Authored scene that was Started. */
  sceneId?: string;
  /** Why they arrived — from the last scene. Trusted Pass 1. */
  /** Who you play tonight. Not an NPC. */
  playerIdentity?: {
    name?: string;
    appearance?: string;
    personality?: string;
    pronoun?: CharacterPronoun;
    portraitDataUrl?: string;
    stats?: Record<string, string>;
  };
  ruleset?: { name: string; attributes: AttributeDef[]; actions?: import("../checks/ActionDefinitions").ActionDefinition[] | undefined };
  characters: CharacterDraft[];
  objects?: Array<{
    id: string;
    name: string;
    note?: string;
    tags?: string[];
    weight?: number;
    difficulty?: number;
    checkAttribute?: string;
  }>;
  /** Venue intro + room pictures/audio. Pictures and sound are UI only — never assembled into the prompt. */
  placeVisual?: {
    thumbDataUrl?: string | undefined;
    imageDataUrl?: string | undefined;
    gallery?: Array<{ thumbDataUrl: string; imageDataUrl: string }> | undefined;
    picturePlay?: "fade" | "random" | undefined;
    audioDataUrl?: string | undefined;
    audioGallery?: string[] | undefined;
    audioPlay?: "fade" | "random" | undefined;
    rooms?: Array<{
      id: string;
      label: string;
      description?: string | undefined;
      brief?: string | undefined;
      keywords?: string[] | undefined;
      fromRoomIds?: string[] | undefined;
      gate?: "open" | "locked" | "hidden" | undefined;
      thumbDataUrl?: string | undefined;
      imageDataUrl?: string | undefined;
      gallery?: Array<{ thumbDataUrl: string; imageDataUrl: string }> | undefined;
      picturePlay?: "fade" | "random" | undefined;
      audioDataUrl?: string | undefined;
      audioGallery?: string[] | undefined;
      audioPlay?: "fade" | "random" | undefined;
    }> | undefined;
  };
  /** Authored Triggers. Copied onto the session as once-beats. */
  onceBeats?: Array<{
    content: string;
    keywords: string[];
    trigger?: string;
  }>;
  /** Pre-defined Replies groups. Each has Triggered by + buttons. */
  whatNowSets?: Array<{
    id: string;
    keywords?: string[];
    choices?: Array<{ id: string; label: string; room: string }>;
  }>;
  /** Leftover single list — wrapped into one group at Start. */
  whatNow?: Array<{ id: string; label: string; room: string }>;
  whatNowKeywords?: string[];
  /** Player start. Empty = the landmark (floor). A named room label = that focal. */
  playerPosition?: string;
}

export function slugifyCharacterId(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "character";
}

export function displayCharacterName(
  id: string,
  storedName?: string,
  familyName?: string,
  middleName?: string
): string {
  if (storedName?.trim()) return formatPersonName(storedName, familyName, middleName);
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function primaryCharacter(session: Session): { id: string; name: string } | null {
  const id = Object.keys(session.characters)[0];
  if (!id) return null;
  const stored = session.characters[id];
  return {
    id,
    name:
      stored?.name !== undefined
        ? displayCharacterName(id, stored.name, stored.familyName, stored.middleName)
        : displayCharacterName(id)
  };
}

/** Short label for GM/narrator mode, or null when the model writes as a character. */
export function narratorLabel(session: Session): string | null {
  const voice = session.voice;
  if (!voice?.instruction.trim()) return null;
  return voice.title.trim() || "narrator";
}

function meterFromDraft(text: string | undefined, fallback: number): number {
  const n = Number((text ?? "").trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function statsFromDraft(
  draft: CharacterDraft,
  ruleset: SceneSetup["ruleset"]
): Record<string, { value: string | number; lock: "unlocked" }> | undefined {
  const defs = ruleset?.attributes ?? [];
  if (defs.length === 0) return undefined;

  const entries: Record<string, { value: string | number; lock: "unlocked" }> = {};
  const raw = draft.stats ?? {};
  for (const def of defs) {
    const text = (raw[def.id] ?? "").trim();
    if (!text) continue;
    if (def.kind === "number") {
      const n = Number(text);
      if (!Number.isFinite(n)) continue;
      entries[def.id] = { value: n, lock: "unlocked" };
    } else {
      entries[def.id] = { value: text, lock: "unlocked" };
    }
  }
  return Object.keys(entries).length > 0 ? entries : undefined;
}

function uniqueSlug(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Builds a canonical session from the pre-play setup form.
 * Does not invent a demo character — empty drafts are skipped.
 */
export function createSessionFromSetup(setup: SceneSetup, sessionId: string): Session {
  const usedIds = new Set<string>();
  const characters: Session["characters"] = {};
  const relationships: Session["relationships"] = {};
  const layers: Session["layers"] = [];

  for (const draft of setup.characters) {
    const name = draft.name.trim();
    if (!name) continue;

    const familyName = (draft.familyName ?? "").trim();
    const middleName = (draft.middleName ?? "").trim();
    const id = uniqueSlug(slugifyCharacterId(formatPersonName(name, familyName, middleName)), usedIds);
    usedIds.add(id);

    const stats = statsFromDraft(draft, setup.ruleset);
    characters[id] = {
      name,
      position: {
        value: !draft.position.trim() || draft.position.trim().toLowerCase() === "here"
          ? (setup.playerPosition?.trim() || setup.location.trim() || "Somewhere")
          : draft.position.trim(),
        lock: "unlocked"
      },
      mood: { value: draft.mood.trim() || "neutral", lock: "unlocked" },
      ...(familyName ? { familyName } : {}),
      ...(middleName ? { middleName } : {}),
      ...(typeof draft.approximateAge === "number" ? { approximateAge: draft.approximateAge } : {}),
      ...(draft.pronoun ? { pronoun: draft.pronoun } : {}),
      ...(draft.appearance?.trim() ? { appearance: draft.appearance.trim() } : {}),
      clothing: { value: (draft.clothing ?? "").trim(), lock: "unlocked" },
      holding: { value: (draft.holding ?? "").trim(), lock: "unlocked" },
      ...(draft.portraitDataUrl ? { portraitDataUrl: draft.portraitDataUrl } : {}),
      ...(stats ? { stats } : {})
    };
    relationships[id] = {
      trust: { value: meterFromDraft(draft.trust, 20), lock: "unlocked" },
      familiarity: { value: meterFromDraft(draft.familiarity, 10), lock: "unlocked" },
      tension: { value: meterFromDraft(draft.tension, 5), lock: "unlocked" }
    };

    const personality = draft.personality.trim();
    if (personality) {
      layers.push({
        id: `layer-core-${id}`,
        type: "core",
        priority: 0,
        content: personality,
        active: true,
        aiGenerated: false
      });
    }

    (draft.lore ?? []).forEach((entry, index) => {
      const body = entry.content.trim();
      if (!body) return;
      const title = (entry.title ?? "").trim();
      const keywords = (entry.keywords ?? []).map((word) => word.trim()).filter(Boolean);
      layers.push({
        id: `layer-lore-${id}-${entry.id ?? index + 1}`,
        ...(entry.purpose ? { purpose: entry.purpose } : {}),
        type: "core",
        priority: 8 + index,
        content: title ? `${title}\n\n${body}` : body,
        ...(keywords.length > 0 ? { keywords } : {}),
        active: true,
        aiGenerated: false
      });
    });
  }

  const placeNote = setup.placeNote.trim();
  const placeBrief = (setup.placeBrief ?? "").trim();
  const placeForModel = placeBrief || placeNote;
  if (placeForModel) {
    layers.push({
      id: "layer-place",
      type: "environment",
      priority: 10,
      content: placeForModel,
      active: true,
      aiGenerated: false
    });
  }

  (setup.placeLore ?? []).forEach((item, index) => {
    const content = item.content.trim();
    if (!content) return;
    const keywords = (item.keywords ?? []).map((word) => word.trim()).filter(Boolean);
    layers.push({
      id: `layer-place-lore-${index + 1}`,
      ...(item.purpose ? { purpose: item.purpose } : {}),
      type: "environment",
      priority: 20 + index,
      content,
      ...(keywords.length > 0 ? { keywords } : {}),
      active: true,
      aiGenerated: false
    });
  });

  (setup.onceBeats ?? []).forEach((item, index) => {
    const content = item.content.trim();
    const keywords = (item.keywords ?? []).map((word) => word.trim()).filter(Boolean);
    if (!content || keywords.length === 0) return;
    layers.push({
      id: `layer-once-${index + 1}`,
      purpose: "storyline",
      type: "state_trigger",
      priority: 4 + index,
      content,
      keywords,
      trigger: item.trigger?.trim() || "return_to_bar",
      once: true,
      active: true,
      aiGenerated: false
    });
  });

  const lighting = setup.lighting.trim();
  const noise = setup.noise.trim();
  const storyPremise = setup.storyPremise?.trim() ?? "";
  const storyTitle = setup.storyTitle?.trim() ?? "";
  const voiceInstruction = setup.voiceInstruction?.trim() ?? "";
  const voiceTitle = setup.voiceTitle?.trim() ?? "";
  const model = setup.model?.trim() || DEFAULT_OLLAMA_MODEL;

  const rooms = (setup.placeVisual?.rooms ?? [])
    .map((room) => {
      const description = (room.description ?? "").trim();
      const brief = (room.brief ?? "").trim();
      return {
        id: room.id,
        label: room.label.trim(),
        keywords: (room.keywords ?? []).map((word) => word.trim()).filter(Boolean),
        ...(() => {
          const fromRoomIds = (room.fromRoomIds ?? []).map((id) => id.trim()).filter(Boolean);
          return fromRoomIds.length > 0 ? { fromRoomIds } : {};
        })(),
        ...(room.gate && room.gate !== "open" ? { gate: room.gate } : {}),
        ...(description ? { description } : {}),
        ...(brief ? { brief } : {}),
        ...copyPictureFields(room),
        ...copyAudioFields(room),
      };
    })
    .filter((room) => room.label);

  return parseSession({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: sessionId,
    runtime: { model, temperature: 0.8, seed: null, provider: "ollama" },
    stateVersion: 0,
    characters,
    scene: {
      location: setup.location.trim() || "Somewhere",
      ...(setup.placeId?.trim() ? { placeId: setup.placeId.trim() } : {}),
      ...(setup.realm?.trim() ? { realm: setup.realm.trim() } : {}),
      ...(setup.realmNote?.trim() ? { realmNote: setup.realmNote.trim() } : {}),
      ...(setup.realmBrief?.trim() ? { realmBrief: setup.realmBrief.trim() } : {}),
      ...(setup.realmVisual
        ? {
            realmVisual: {
              ...copyPictureFields(setup.realmVisual),
              ...copyAudioFields(setup.realmVisual)
            }
          }
        : {}),
      environment: {
        ...(lighting ? { lighting } : {}),
        ...(noise ? { noise } : {}),
        music: setup.music
      },
      ...(placeNote ? { note: placeNote } : {}),
      ...(placeBrief ? { brief: placeBrief } : {}),
      ...copyPictureFields(setup.placeVisual),
      ...copyAudioFields(setup.placeVisual),
      ...(rooms.length > 0 ? { rooms } : {})
    },
    player: {
      position: { value: (setup.playerPosition?.trim() || setup.location.trim() || "Somewhere"), lock: "unlocked" },
      status: { value: "awake", lock: "unlocked" },
      ...(setup.playerIdentity?.name?.trim() ? { name: setup.playerIdentity.name.trim() } : {}),
      ...(setup.playerIdentity?.appearance?.trim() ? { appearance: setup.playerIdentity.appearance.trim() } : {}),
      ...(setup.playerIdentity?.personality?.trim() ? { personality: setup.playerIdentity.personality.trim() } : {}),
      ...(setup.playerIdentity?.pronoun ? { pronoun: setup.playerIdentity.pronoun } : {}),
      ...(setup.playerIdentity?.portraitDataUrl?.trim()
        ? { portraitDataUrl: setup.playerIdentity.portraitDataUrl.trim() }
        : {}),
      ...(setup.playerIdentity?.stats && Object.keys(setup.playerIdentity.stats).length > 0
        ? { stats: setup.playerIdentity.stats }
        : {})
    },
    ...(storyPremise
      ? {
          story: {
            title: storyTitle,
            premise: storyPremise,
            scope: "world"
          }
        }
      : {}),
    ...(voiceInstruction
      ? {
          voice: {
            title: voiceTitle,
            instruction: voiceInstruction
          }
        }
      : {}),
    ...(setup.ruleset?.name.trim()
      ? {
          ruleset: {
            name: setup.ruleset.name.trim(),
            attributes: setup.ruleset.attributes,
            ...(setup.ruleset.actions ? { actions: setup.ruleset.actions } : {})
          }
        }
      : {}),
    ...(setup.campaignIntro?.trim() ? { campaignIntro: setup.campaignIntro.trim() } : {}),
    ...(setup.campaignId?.trim() ? { campaignId: setup.campaignId.trim() } : {}),
    ...(setup.sceneId?.trim() ? { sceneId: setup.sceneId.trim() } : {}),
    ...(setup.handoff?.trim() ? { handoff: setup.handoff.trim() } : {}),
    ...(() => {
      const fromSets = copyWhatNowSets(setup.whatNowSets);
      const whatNowSets =
        fromSets.length > 0
          ? fromSets
          : copyWhatNowSets(
              setup.whatNow?.length
                ? [{ id: "replies", keywords: setup.whatNowKeywords ?? [], choices: setup.whatNow }]
                : []
            );
      return whatNowSets.length > 0 ? { whatNowSets, whatNowOpen: false } : {};
    })(),
    objects: (setup.objects ?? [])
      .filter((item) => item.name.trim())
      .map((item) => ({
        id: item.id,
        name: item.name.trim(),
        note: item.note?.trim() ?? "",
        tags: item.tags ?? [],
        ...(item.weight !== undefined ? { weight: item.weight } : {}),
        ...(item.difficulty !== undefined ? { difficulty: item.difficulty } : {}),
        ...(item.checkAttribute?.trim() ? { checkAttribute: item.checkAttribute.trim() } : {})
      })),
    relationships,
    ...(setup.playMode ? { playMode: setup.playMode } : {}),
    ...(setup.storyline?.trim() ? { storyline: { title: storyTitle, premise: setup.storyline.trim() } } : {}),
    layers,
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: []
  });
}
