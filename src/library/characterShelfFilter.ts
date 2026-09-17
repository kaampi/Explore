import { IMPORTED_TAG } from "./LibrarySchema";

export type CharacterShelfFilters = {
  male: boolean;
  female: boolean;
  imported: boolean;
};

export const EMPTY_CHARACTER_SHELF_FILTERS: CharacterShelfFilters = {
  male: false,
  female: false,
  imported: false
};

export function isImportedCard(item: { tags?: string[]; source?: string }): boolean {
  if (item.source === "sillytavern") return true;
  return (item.tags ?? []).some((tag) => tag.toLowerCase() === IMPORTED_TAG.toLowerCase());
}

/** Male / Female constrain pronoun. Imported constrains source. Unchecked = no constraint. */
export function matchesCharacterShelf(
  item: { pronoun?: string; tags?: string[]; source?: string },
  filters: CharacterShelfFilters
): boolean {
  if (filters.male || filters.female) {
    const key = item.pronoun?.trim().toLowerCase() ?? "";
    const hit = (filters.male && key === "he") || (filters.female && key === "she");
    if (!hit) return false;
  }
  if (filters.imported && !isImportedCard(item)) return false;
  return true;
}
