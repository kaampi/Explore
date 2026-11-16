import type { Actor, ActionCheck, EncounterDefinition, Weapon } from "./EncounterSchema";
export interface RulesAdapter {
  id: string;
  initiative(rng: () => number): number;
  compareInitiative(a: number, b: number): number;
  attackTarget(
    actor: Actor,
    target: Actor,
    weapon: Weapon,
    cover: number,
    definition: EncounterDefinition,
  ): number;
  skillTarget(
    actor: Actor,
    stat: string,
    modifier: number,
    definition: EncounterDefinition,
  ): number;
  check(
    actorId: string,
    stat: string,
    target: number,
    round: number,
    rng: () => number,
  ): ActionCheck;
  damage(check: ActionCheck, weapon: Weapon, definition: EncounterDefinition): number;
}
/** Difficulty levels shared by object cards and the storyboard: percentage points on the chance. */
export const CHECK_LEVELS = [
  { id: "easy", label: "Easy", modifier: 20 },
  { id: "standard", label: "Standard", modifier: 0 },
  { id: "hard", label: "Hard", modifier: -20 },
  { id: "veryHard", label: "Very hard", modifier: -40 },
] as const;
export type CheckLevel = (typeof CHECK_LEVELS)[number]["id"];

export const levelModifier = (level: CheckLevel): number =>
  CHECK_LEVELS.find((l) => l.id === level)!.modifier;

export const levelLabelForModifier = (modifier: number): string | undefined =>
  CHECK_LEVELS.find((l) => l.modifier === modifier)?.label;

/** Suggests a level from an older d20-style difficulty number. */
export function suggestLevel(difficulty: number): CheckLevel {
  if (difficulty <= 8) return "easy";
  if (difficulty <= 13) return "standard";
  if (difficulty <= 17) return "hard";
  return "veryHard";
}

/**
 * The chance, 0 to 100, that a value on a scale stands for: the middle of the scale is 50, the
 * ends are 0 and 100, and a value outside the scale counts as its nearest end. A scale that
 * is not a range, or a value that is not a number, gives 50.
 * The chat's checks and the engine both use this one conversion.
 */
export function chanceFromValue(value: number, min: number, max: number): number {
  if (![value, min, max].every(Number.isFinite) || max <= min) return 50;
  const percent = Math.round(((value - min) / (max - min)) * 100);
  return Math.max(0, Math.min(100, percent));
}

/**
 * A person's chance, before cover, defence and difficulty, for a skill. A skill the scene
 * describes with a scale is read from that scale. Any other skill is read as it stands, a
 * value already out of 100, which is how scenes without scales have always worked.
 */
function skillChance(actor: Actor, skill: string, d: EncounterDefinition): number {
  const scale = d.rules.attributes.find((attribute) => attribute.id === skill);
  if (!scale) return actor.stats[skill] ?? 0;
  const value = actor.stats[skill] ?? (scale.min + scale.max) / 2;
  return chanceFromValue(value, scale.min, scale.max);
}

function d100(rng: () => number) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("Invalid dice sample.");
  return Math.floor(value * 100) + 1;
}
export const percentileRules: RulesAdapter = {
  id: "d100",
  initiative: d100,
  compareInitiative: (a, b) => a - b,
  skillTarget: (actor, stat, modifier, d) =>
    Math.max(0, Math.min(100, skillChance(actor, stat, d) + modifier)),
  attackTarget: (actor, target, weapon, cover, d) =>
    Math.max(
      5,
      Math.min(
        100,
        skillChance(actor, weapon.skill, d) +
          (target.weaponReady === false || target.disposition === "surrendered"
            ? d.rules.unreadyTargetBonus
            : 0) -
          (weapon.kind === "ranged" ? cover : 0) -
          (target.defending && target.weaponReady !== false && target.disposition !== "surrendered"
            ? d.rules.defensePenalty
            : 0),
      ),
    ),
  check(actorId, stat, target, round, rng) {
    const roll = d100(rng);
    return {
      actorId,
      stat,
      roll,
      target,
      round,
      degree:
        roll <= target
          ? roll <= 5
            ? "exceptional"
            : "success"
          : roll >= 96
            ? "severe"
            : "failure",
    };
  },
  damage: (check, weapon, d) =>
    check.degree === "exceptional"
      ? weapon.damage + d.rules.exceptionalDamage
      : check.degree === "success"
        ? weapon.damage
        : 0,
};
export function encounterRules(
  d: EncounterDefinition,
  adapters: readonly RulesAdapter[] = [percentileRules],
) {
  const adapter = adapters.find((rules) => rules.id === d.rules.id);
  if (!adapter) throw new Error(`Unsupported ruleset: ${d.rules.id}`);
  return adapter;
}
