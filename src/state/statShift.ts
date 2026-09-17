import type { AttributeDef, Session } from "./StateSchema";
import { attributeRange } from "./traitBands";

export type MovableStat = {
  id: string;
  label: string;
  value: number;
  maxShift: number;
  min: number;
  max: number;
};

export function parseStatPath(path: string): { characterId: string; statId: string } | undefined {
  const parts = path.split(".");
  if (parts.length !== 4 || parts[0] !== "characters" || parts[2] !== "stats") return undefined;
  const characterId = parts[1];
  const statId = parts[3];
  if (!characterId || !statId) return undefined;
  return { characterId, statId };
}

export function movableStatsForCharacter(session: Session, characterId: string): MovableStat[] {
  const character = session.characters[characterId];
  const defs = session.ruleset?.attributes ?? [];
  if (!character?.stats) return [];
  const out: MovableStat[] = [];
  for (const def of defs) {
    if (def.kind !== "number") continue;
    const maxShift = def.maxShift ?? 0;
    if (maxShift <= 0) continue;
    const field = character.stats[def.id];
    const n = typeof field?.value === "number" ? field.value : Number(field?.value);
    if (!Number.isFinite(n)) continue;
    const { min, max } = attributeRange(def);
    out.push({ id: def.id, label: def.name, value: n, maxShift, min, max });
  }
  return out;
}

export function clampAiStatValue(
  current: number,
  proposed: number,
  def: Pick<AttributeDef, "min" | "max" | "maxShift">
): number {
  const { min, max } = attributeRange(def);
  const cap = Math.max(0, def.maxShift ?? 0);
  const lo = Math.max(min, current - cap);
  const hi = Math.min(max, current + cap);
  const n = Math.round(proposed);
  return Math.max(lo, Math.min(hi, n));
}
