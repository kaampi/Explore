/** Drop library/session pictures that would freeze the UI if kept in memory. */
export const MAX_LIBRARY_PORTRAIT_CHARS = 800_000;

export function portraitIsOversized(url: unknown): boolean {
  return typeof url === "string" && url.length > MAX_LIBRARY_PORTRAIT_CHARS;
}

export function dropOversizedPortraitFromRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const row = raw as Record<string, unknown>;
  if (!portraitIsOversized(row.portraitDataUrl)) return raw;
  const { portraitDataUrl: _dropped, ...rest } = row;
  return rest;
}

export function dropOversizedPortrait<T extends { portraitDataUrl?: string | undefined }>(row: T): T {
  if (!portraitIsOversized(row.portraitDataUrl)) return row;
  const { portraitDataUrl: _dropped, ...rest } = row;
  return rest as T;
}

