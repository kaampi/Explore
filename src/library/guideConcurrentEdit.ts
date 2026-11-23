export type EditDecision = "latest" | "local";

export type EditConflict = {
  key: string;
  path: string[];
  latest: unknown;
  local: unknown;
};

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((value, index) => same(value, b[index]));
  if (record(a) && record(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) => same(a[key], b[key]));
  }
  return false;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function rowId(value: unknown): string | undefined {
  return record(value) && typeof value.id === "string" ? value.id : undefined;
}

/** Replay independent edits. Structural edits to the same list require a choice. */
export function mergeGuideEdits<T>(
  base: T,
  latest: T,
  local: T,
  decisions: Record<string, EditDecision> = {},
): { value: T; conflicts: EditConflict[] } {
  const conflicts: EditConflict[] = [];
  function merge(before: unknown, saved: unknown, edited: unknown, path: string[]): unknown {
    if (same(edited, before) || same(edited, saved)) return saved;
    if (same(saved, before)) return edited;
    if (record(before) && record(saved) && record(edited)) {
      const keys = new Set([...Object.keys(before), ...Object.keys(saved), ...Object.keys(edited)]);
      return Object.fromEntries(
        [...keys].flatMap((key) => {
          const value = merge(before[key], saved[key], edited[key], [...path, key]);
          return value === undefined ? [] : [[key, value]];
        }),
      );
    }
    if (Array.isArray(before) && Array.isArray(saved) && Array.isArray(edited)) {
      const ids = before.map(rowId);
      if (
        ids.every(Boolean) &&
        new Set(ids).size === ids.length &&
        same(ids, saved.map(rowId)) &&
        same(ids, edited.map(rowId))
      ) {
        return before.map((row, index) =>
          merge(row, saved[index], edited[index], [...path, ids[index]!]),
        );
      }
    }
    const key = JSON.stringify(path);
    if (decisions[key] === "local") return edited;
    if (decisions[key] === "latest") return saved;
    conflicts.push({ key, path, latest: saved, local: edited });
    return saved;
  }
  return { value: merge(base, latest, local, []) as T, conflicts };
}
