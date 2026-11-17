import {
  emptyCampaignScene,
  type CampaignScene,
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
