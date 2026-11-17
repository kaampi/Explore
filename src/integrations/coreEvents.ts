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

export type DraftImport = {
  campaign: CampaignTemplate;
  /** Drafts added, in the order the events stand in the manuscript. */
  added: number;
  /** Events that already have a draft in this adventure, by name. */
  alreadyThere: string[];
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
  const fresh = taken.filter((event) => {
    if (!campaign.scenes.some((scene) => sameEvent(scene, source, event.entity_ref))) return true;
    alreadyThere.push(event.name.trim() || event.entity_ref);
    return false;
  });
  const result: DraftImport = {
    campaign,
    added: 0,
    alreadyThere,
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
