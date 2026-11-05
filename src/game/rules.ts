import type { Actor, ActionCheck, EncounterDefinition, Weapon } from './EncounterSchema';
export interface RulesAdapter {
  id: string;
  initiative(rng: () => number): number;
  compareInitiative(a: number, b: number): number;
  attackTarget(actor: Actor, target: Actor, weapon: Weapon, cover: number, definition: EncounterDefinition): number;
  skillTarget(actor: Actor, stat: string, modifier: number): number;
  check(actorId: string, stat: string, target: number, round: number, rng: () => number): ActionCheck;
  damage(check: ActionCheck, weapon: Weapon, definition: EncounterDefinition): number;
}
function d100(rng: () => number) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Invalid dice sample.');
  return Math.floor(value * 100) + 1;
}
export const percentileRules: RulesAdapter = {
  id: 'd100', initiative: d100, compareInitiative: (a, b) => a - b,
  skillTarget: (actor, stat, modifier) => Math.max(0, Math.min(100, (actor.stats[stat] ?? 0) + modifier)),
  attackTarget: (actor, target, weapon, cover, d) => Math.max(5, Math.min(100, (actor.stats[weapon.skill] ?? 0) + (target.weaponReady===false||target.disposition==='surrendered'?d.rules.unreadyTargetBonus:0) - (weapon.kind === 'ranged' ? cover : 0) - (target.defending&&target.weaponReady!==false&&target.disposition!=='surrendered' ? d.rules.defensePenalty : 0))),
  check(actorId, stat, target, round, rng) {
    const roll = d100(rng);
    return { actorId, stat, roll, target, round, degree: roll <= target ? roll <= 5 ? 'exceptional' : 'success' : roll >= 96 ? 'severe' : 'failure' };
  },
  damage: (check, weapon, d) => check.degree === 'exceptional' ? weapon.damage + d.rules.exceptionalDamage : check.degree === 'success' ? weapon.damage : 0
};
export function encounterRules(d: EncounterDefinition, adapters: readonly RulesAdapter[] = [percentileRules]) {
  const adapter = adapters.find(rules => rules.id === d.rules.id);
  if (!adapter) throw new Error(`Unsupported ruleset: ${d.rules.id}`);
  return adapter;
}
