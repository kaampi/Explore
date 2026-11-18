import type {
  CharacterTemplate,
  ObjectTemplate,
  PlaceTemplate,
  RealmTemplate,
} from "@library/LibrarySchema";
import type { Faction } from "@library/factions";
import { copyCoreCharacter } from "./coreBible";
import type { CoreBibleSection } from "./coreBibleSchema";
import { sameCoreCharacter } from "./coreCharacterUpdates";
import {
  copyCoreEntity,
  manuscriptWorld,
  sameCoreEntity,
  type CoreEntityKind,
} from "./coreEntities";

/** The Story Bible sections that can be copied, in the order they are shown. */
export const IMPORTABLE_KINDS = ["characters", "locations", "objects", "groups"] as const;
export type ImportableKind = (typeof IMPORTABLE_KINDS)[number];

export type BatchLibrary = {
  realms: readonly RealmTemplate[];
  characters: readonly CharacterTemplate[];
  places: readonly PlaceTemplate[];
  objects: readonly ObjectTemplate[];
  factions: readonly Faction[];
};

export type BatchResult = {
  /** The world to save: new, or the one an earlier import made, unchanged. */
  realm: RealmTemplate;
  realmIsNew: boolean;
  characters: CharacterTemplate[];
  places: PlaceTemplate[];
  objects: ObjectTemplate[];
  factions: Faction[];
  /** Chosen entries that were already copied, by name. They are left alone: update them one at a time. */
  alreadyThere: string[];
  /** Chosen entries that could not be copied, with the reason. */
  failed: { name: string; reason: string }[];
};

/** Every entry that can be copied, by section, with the key that picks it. */
export function importableEntries(bible: readonly CoreBibleSection[]) {
  return bible
    .filter((section) => (IMPORTABLE_KINDS as readonly string[]).includes(section.kind))
    .flatMap((section) =>
      section.entities.map((entity) => ({
        key: `${section.kind}:${entity.entity_ref}`,
        kind: section.kind as ImportableKind,
        entity,
      })),
    );
}

/**
 * Copy the chosen characters, places, things and factions of a manuscript in one go, into a world
 * made from it. Nothing is saved here. Entries copied before are not copied twice, and one that
 * cannot be copied does not stop the rest.
 */
export function importManuscriptBatch(args: {
  title: string;
  bible: readonly CoreBibleSection[];
  source: { workspaceId: string; projectId: string; revision: number };
  chosen: ReadonlySet<string>;
  library: BatchLibrary;
}): BatchResult {
  const { source, library } = args;
  const { realm, created } = manuscriptWorld(library.realms, source, args.title);
  const result: BatchResult = {
    realm,
    realmIsNew: created,
    characters: [],
    places: [],
    objects: [],
    factions: [],
    alreadyThere: [],
    failed: [],
  };
  for (const { key, kind, entity } of importableEntries(args.bible)) {
    if (!args.chosen.has(key)) continue;
    const here = { ...source, entityRef: entity.entity_ref };
    const known =
      kind === "characters"
        ? library.characters.some((card) => sameCoreCharacter(card, here))
        : kind === "locations"
          ? library.places.some((card) => sameCoreEntity(card, here))
          : kind === "objects"
            ? library.objects.some((card) => sameCoreEntity(card, here))
            : library.factions.some((card) => sameCoreEntity(card, here));
    if (known) {
      result.alreadyThere.push(entity.name.trim() || entity.entity_ref);
      continue;
    }
    try {
      if (kind === "characters") result.characters.push(copyCoreCharacter(entity, source));
      else if (kind === "locations")
        result.places.push(copyCoreEntity("locations", entity, source, { realmId: realm.id }));
      else if (kind === "objects") result.objects.push(copyCoreEntity("objects", entity, source));
      else result.factions.push(copyCoreEntity("groups" satisfies CoreEntityKind, entity, source));
    } catch (reason) {
      result.failed.push({
        name: entity.name.trim() || entity.entity_ref,
        reason: reason instanceof Error ? reason.message : "Could not copy this.",
      });
    }
  }
  return result;
}
