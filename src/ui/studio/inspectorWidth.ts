/** The details panel in Storyboard Editor can be made wider for long action texts. */
export const INSPECTOR_MIN = 330;
export const INSPECTOR_MAX = 760;
export const INSPECTOR_DEFAULT = INSPECTOR_MIN;
const STEP = 24;
const STORAGE_KEY = "kaampi-storyboard-inspector-width";
/** Room kept for the outline and the board beside the panel. */
const OTHER_COLUMNS = 200 + 230 + 36;

/**
 * Keep a width within the allowed range. `available` is the width of the whole layout, when
 * known, so the panel never squeezes the board below a usable size.
 */
export function clampInspectorWidth(value: number, available?: number): number {
  const roomy = available && available > 0 ? available - OTHER_COLUMNS : INSPECTOR_MAX;
  const max = Math.max(INSPECTOR_MIN, Math.min(INSPECTOR_MAX, roomy));
  if (!Number.isFinite(value)) return INSPECTOR_DEFAULT;
  return Math.round(Math.min(max, Math.max(INSPECTOR_MIN, value)));
}

/** The new width for a key press on the resize handle, or undefined for other keys. */
export function widthForKey(key: string, width: number, available?: number): number | undefined {
  if (key === "ArrowLeft") return clampInspectorWidth(width + STEP, available);
  if (key === "ArrowRight") return clampInspectorWidth(width - STEP, available);
  if (key === "Home") return INSPECTOR_DEFAULT;
  if (key === "End") return clampInspectorWidth(INSPECTOR_MAX, available);
  return undefined;
}

/** A remembered width is only a convenience. Any problem reading it gives the default. */
export function loadInspectorWidth(): number {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? INSPECTOR_DEFAULT : clampInspectorWidth(Number(stored));
  } catch {
    return INSPECTOR_DEFAULT;
  }
}

export function saveInspectorWidth(width: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // Not remembering the width is fine.
  }
}
