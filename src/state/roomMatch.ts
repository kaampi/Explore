/**
 * Match a live location or a player sentence to a named room slot.
 */

/** Fold apostrophes so "Emmas room" and "Emma's room" are the same place. */
export function foldPlace(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\s+/g, " ");
}

export function roomTokens(room: { label: string; keywords?: string[] }): string[] {
  return [room.label, ...(room.keywords ?? [])]
    .map((token) => foldPlace(token))
    .filter(Boolean);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Phrase = substring. Single token = whole word, so "loo" does not match "looking". */
export function hayContainsRoomKey(hay: string, key: string): boolean {
  if (!key || key.length < 2) return false;
  if (/\s/.test(key)) return hay.includes(key);
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(key)}(?![\\p{L}\\p{N}_])`, "u").test(hay);
}

export function roomMatchScore(here: string, room: { label: string; keywords?: string[] }): number {
  const needle = foldPlace(here);
  if (!needle) return 0;
  const keys = roomTokens(room);
  if (keys.some((key) => key === needle)) return 3;
  if (keys.some((key) => hayContainsRoomKey(needle, key))) return 2;
  return 0;
}

export function matchSceneRoom<T extends { label: string; keywords?: string[] }>(
  here: string,
  rooms: T[]
): T | undefined {
  let best: { room: T; score: number } | undefined;
  for (const room of rooms) {
    const score = roomMatchScore(here, room);
    if (score === 0) continue;
    if (!best || score > best.score) best = { room, score };
  }
  return best?.room;
}
