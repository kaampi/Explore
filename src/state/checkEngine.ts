import { attributeRange } from "./traitBands";

/**
 * Check Engine — object-interaction checks (project_spec.md "CheckEngine
 * (later)"). Pure code, no LLM: the engine owns the outcome, Pass 1 only
 * narrates it. Player-initiated only — never Pass 2 deciding to roll.
 * Generalizes the Favor pattern (roll in code, band-normalized against
 * the field's own min–max) rather than importing a D&D ruleset. First
 * and only check type: object interaction.
 */

export type CheckCritical = "success" | "failure";

export type CheckResult = {
  /** The die face, 1–20. What the 3D dice box lands on — not a second RNG. */
  roll: number;
  /** Derived from the live attribute value, roughly -5..+5. */
  modifier: number;
  total: number;
  difficulty: number;
  success: boolean;
  /** A natural 1 or 20 always decides the outcome, regardless of modifier/difficulty. */
  critical: CheckCritical | undefined;
};

/** 1d20. */
export function rollD20(rng: () => number = Math.random): number {
  return Math.floor(rng() * 20) + 1;
}

/**
 * Normalizes a live value onto 0–100 using this field's own min–max —
 * same method trait bands already use. Never hardcode a 0–100 threshold
 * (that was the warm-beat bug): a 1–18 fantasy stat and a 0–100 meter
 * both land on the same scale here.
 */
export function normalizedAttributeValue(value: number, def: { min?: number | undefined; max?: number | undefined }): number {
  const { min, max } = attributeRange(def);
  if (max <= min) return 50;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

/** 0–100 → roughly -5..+5, centered on 0 at the midpoint (50). */
export function attributeModifier(normalizedValue: number): number {
  return Math.round(((normalizedValue - 50) / 100) * 10);
}

/**
 * Resolves one player-initiated check: 1d20 + a modifier derived from
 * the live attribute vs the object's authored difficulty (DC-style, the
 * same scale a difficulty like 14 already implies). A natural 20 always
 * succeeds; a natural 1 always fails, whatever the modifier says.
 */
export function checkAttempt(params: {
  attributeValue: number;
  attributeDef: { min?: number | undefined; max?: number | undefined };
  difficulty: number;
  roll?: number;
  rng?: () => number;
}): CheckResult {
  const roll = params.roll ?? rollD20(params.rng);
  const normalized = normalizedAttributeValue(params.attributeValue, params.attributeDef);
  const modifier = attributeModifier(normalized);
  const total = roll + modifier;
  const critical: CheckCritical | undefined = roll === 20 ? "success" : roll === 1 ? "failure" : undefined;
  const success = critical ? critical === "success" : total >= params.difficulty;
  return { roll, modifier, total, difficulty: params.difficulty, success, critical };
}
