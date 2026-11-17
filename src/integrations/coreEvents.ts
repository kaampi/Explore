import {
  emptyCampaignScene,
  type CampaignScene,
  type CampaignTemplate,
  type CharacterTemplate,
  type ObjectTemplate,
  type PlaceTemplate,
} from "@library/LibrarySchema";
import type { SceneDraft } from "@library/coreOrigin";
import type { CoreBibleEntity } from "./coreBibleSchema";

export const MAX_EVENTS_PER_IMPORT = 100;
export const MAX_DRAFT_FACTS = 40;

export type DraftSource = { workspaceId: string; projectId: string; revision: number };
export type DraftLibrary = {
  characters: readonly CharacterTemplate[];
  places: readonly PlaceTemplate[];
  objects: readonly ObjectTemplate[];
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether `name` stands in `text` as whole words, in any capitals. */
export function mentions(text: string, name: string): boolean {
  const clean = name.trim();
  if (!clean) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(clean)}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

const fromThisManuscript = (
  card: { coreOrigin?: { workspaceId: string; projectId: string } | undefined },
  source: DraftSource,
) =>
  card.coreOrigin?.workspaceId === source.workspaceId &&
  card.coreOrigin?.projectId === source.projectId;

/**
 * A scene draft from a manuscript event: its name, what it says, and a suggestion of who, where
 * and what it mentions, found by matching the names of cards copied from the same manuscript.
 * Nothing is written into the scene beyond its name and these notes. No AI is involved.
 */
export function draftFromEvent(
  event: CoreBibleEntity,
  source: DraftSource,
  library: DraftLibrary,
): CampaignScene {
  const facts = event.facts
    .map((fact) => ({
      label: fact.label.trim().slice(0, 120),
      value: fact.value.trim().slice(0, 2000),
    }))
    .filter((fact) => fact.value)
    .slice(0, MAX_DRAFT_FACTS);
  const haystack = [event.name, ...facts.map((fact) => fact.value)].join("\n");

  const people = library.characters.filter((card) => fromThisManuscript(card, source));
  const firstName = (card: CharacterTemplate) => card.name.trim().split(/\s+/)[0] ?? "";
  const suggestedCharacterIds = people
    .filter((card) => {
      if (mentions(haystack, card.name)) return true;
      const first = firstName(card);
      const unique =
        people.filter((other) => firstName(other).toLowerCase() === first.toLowerCase()).length ===
        1;
      return first.length >= 3 && unique && mentions(haystack, first);
    })
    .map((card) => card.id);

  const placesFound = library.places
    .filter((card) => fromThisManuscript(card, source) && mentions(haystack, card.name))
    .map((card) => card.id);
  const suggestedObjectIds = library.objects
    .filter((card) => fromThisManuscript(card, source) && mentions(haystack, card.name))
    .map((card) => card.id);

  const draft: SceneDraft = {
    origin: { ...source, entityRef: event.entity_ref },
    facts,
    suggestedCharacterIds,
    ...(placesFound.length === 1 ? { suggestedPlaceId: placesFound[0]! } : {}),
    otherPlaceIds: placesFound.length > 1 ? placesFound : [],
    suggestedObjectIds,
  };
  return { ...emptyCampaignScene(), name: event.name.trim() || "Untitled event", draft };
}

/** A draft the manuscript has newer words for: what it said, and what it says now. */
export type DraftChange = {
  sceneId: string;
  name: string;
  before: SceneDraft["facts"];
  after: SceneDraft["facts"];
  event: CoreBibleEntity;
};

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What a newer manuscript changes in a draft, if anything: its facts or what it seems to mention.
 * Undefined when the draft is not from this event, the version is not newer, or nothing differs.
 */
export function reviewEventDraft(
  scene: CampaignScene,
  event: CoreBibleEntity,
  source: DraftSource,
  library: DraftLibrary,
): DraftChange | undefined {
  const draft = scene.draft;
  if (!draft || !sameEvent(scene, source, event.entity_ref)) return undefined;
  if (source.revision <= draft.origin.revision) return undefined;
  const next = draftFromEvent(event, source, library).draft!;
  const unchanged =
    sameJson(draft.facts, next.facts) &&
    sameJson(draft.suggestedCharacterIds, next.suggestedCharacterIds) &&
    draft.suggestedPlaceId === next.suggestedPlaceId &&
    sameJson(draft.otherPlaceIds, next.otherPlaceIds) &&
    sameJson(draft.suggestedObjectIds, next.suggestedObjectIds);
  if (unchanged) return undefined;
  return { sceneId: scene.id, name: scene.name, before: draft.facts, after: next.facts, event };
}

/**
 * Bring a draft's notes up to date. Only its facts, its version and its suggestions change:
 * the scene's name, actions, people, things and doors, which the author wrote, are left alone.
 */
export function updateEventDraft(
  scene: CampaignScene,
  event: CoreBibleEntity,
  source: DraftSource,
  library: DraftLibrary,
): CampaignScene {
  if (!scene.draft || !sameEvent(scene, source, event.entity_ref))
    throw new Error("This scene was not made from that event.");
  if (source.revision < scene.draft.origin.revision)
    throw new Error("This manuscript version is older than the notes.");
  return { ...scene, draft: draftFromEvent(event, source, library).draft! };
}

export type DraftImport = {
  campaign: CampaignTemplate;
  /** Drafts added, in the order the events stand in the manuscript. */
  added: number;
  /** Events that already have a draft in this adventure, by name. */
  alreadyThere: string[];
  /** Drafts the manuscript now says something different about, to review before they are updated. */
  changed: DraftChange[];
  /** Chosen events beyond the limit of one import, which were left out. */
  clipped: number;
};

const sameEvent = (scene: CampaignScene, source: DraftSource, entityRef: string) =>
  scene.draft?.origin.workspaceId === source.workspaceId &&
  scene.draft.origin.projectId === source.projectId &&
  scene.draft.origin.entityRef === entityRef;

/**
 * Add drafts for the chosen events last in an adventure, in manuscript order, grouped in an act
 * named after the manuscript. An event that already has a draft here is skipped and reported, and
 * nothing already in the adventure is changed. At most 100 events are taken at a time.
 */
export function addEventDrafts(args: {
  campaign: CampaignTemplate;
  title: string;
  events: readonly CoreBibleEntity[];
  chosen: ReadonlySet<string>;
  source: DraftSource;
  library: DraftLibrary;
}): DraftImport {
  const { campaign, source } = args;
  const picked = args.events.filter((event) => args.chosen.has(event.entity_ref));
  const taken = picked.slice(0, MAX_EVENTS_PER_IMPORT);
  const alreadyThere: string[] = [];
  const changed: DraftChange[] = [];
  const fresh = taken.filter((event) => {
    const old = campaign.scenes.find((scene) => sameEvent(scene, source, event.entity_ref));
    if (!old) return true;
    const change = reviewEventDraft(old, event, source, args.library);
    if (change) changed.push(change);
    else alreadyThere.push(event.name.trim() || event.entity_ref);
    return false;
  });
  const result: DraftImport = {
    campaign,
    added: 0,
    alreadyThere,
    changed,
    clipped: picked.length - taken.length,
  };
  if (fresh.length === 0) return result;
  const title = args.title.trim() || "Manuscript";
  const sections = campaign.storyboardSections ?? [];
  const act = sections.find((section) => section.kind === "act" && section.title === title);
  const section = act ?? { id: crypto.randomUUID(), title, kind: "act" as const };
  const lowest = campaign.scenes.reduce(
    (most, scene) => Math.max(most, scene.position?.y ?? 0),
    -220,
  );
  const scenes = fresh.map((event, index) => ({
    ...draftFromEvent(event, source, args.library),
    storyboardSectionId: section.id,
    position: { x: (index % 6) * 300, y: lowest + 220 + Math.floor(index / 6) * 220 },
  }));
  return {
    ...result,
    added: scenes.length,
    campaign: {
      ...campaign,
      ...(act ? {} : { storyboardSections: [...sections, section] }),
      scenes: [...campaign.scenes, ...scenes],
    },
  };
}
