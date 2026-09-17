import type { ObjectTemplate } from "./LibrarySchema";
import { IMPORTED_TAG } from "./LibrarySchema";

export const TAG_FILTER_ALL = null;
export const TAG_FILTER_UNSORTED = "__unsorted__";
export type TagFilter = string | null;

export const OBJECT_FILTER_ALL = TAG_FILTER_ALL;
export const OBJECT_FILTER_UNSORTED = TAG_FILTER_UNSORTED;
export const OBJECT_FILTER_STORY = "__story__";
export const OBJECT_FILTER_PLACE = "__place__";

export type ObjectFilter = string | null;

function effectiveTags(item: { tags?: string[]; source?: string }): string[] {
  const tags = item.tags ?? [];
  if (item.source === "sillytavern" && !tags.some((tag) => tag.toLowerCase() === IMPORTED_TAG.toLowerCase())) {
    return [...tags, IMPORTED_TAG];
  }
  return tags;
}

export function uniqueTags(items: Array<{ tags?: string[]; source?: string }>): string[] {
  const seen = new Map<string, string>();
  for (const item of items) {
    for (const tag of effectiveTags(item)) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) seen.set(key, tag);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function matchesTagFilter(item: { tags?: string[]; source?: string }, filter: TagFilter): boolean {
  const tags = effectiveTags(item);
  if (filter === TAG_FILTER_ALL) return true;
  if (filter === TAG_FILTER_UNSORTED) return tags.length === 0;
  const key = filter.toLowerCase();
  return tags.some((tag) => tag.toLowerCase() === key);
}

export function uniqueObjectTags(items: Array<{ tags: string[] }>): string[] {
  return uniqueTags(items);
}

export function objectMatchesFilter(
  item: Pick<ObjectTemplate, "tags" | "storyId" | "placeId">,
  filter: ObjectFilter,
  context: { storyId?: string | null; placeId?: string | null } = {}
): boolean {
  if (filter === OBJECT_FILTER_STORY) return Boolean(context.storyId && item.storyId === context.storyId);
  if (filter === OBJECT_FILTER_PLACE) return Boolean(context.placeId && item.placeId === context.placeId);
  return matchesTagFilter(item, filter);
}

export function lensFromFilter(filter: TagFilter): string | undefined {
  return filter ?? undefined;
}

export function filterFromLens(lens: string | undefined): TagFilter {
  if (!lens) return TAG_FILTER_ALL;
  return lens;
}
