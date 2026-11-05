import type { EncounterOutput, EncounterDefinition, EncounterState, Interaction } from './EncounterSchema';
import { encounterRules, type RulesAdapter } from './rules';

function applyEffects(s: EncounterState, effects: Interaction['success']['effects']) {
  for (const effect of effects) {
    if (effect.kind === 'flag') { if (!s.flags.includes(effect.flag)) s.flags.push(effect.flag); continue; }
    const from = s.actors[effect.from], to = s.actors[effect.to];
    if (!from || !to) throw new Error('Unknown party in this exchange.');
    if (effect.kind === 'transfer-item') {
      if (!from.inventory.includes(effect.itemId)) throw new Error(`${from.name} no longer has the offered item.`);
      from.inventory.splice(from.inventory.indexOf(effect.itemId), 1); to.inventory.push(effect.itemId);
    } else {
      if ((from.resources[effect.resource] ?? 0) < effect.amount) throw new Error(`${from.name} does not have enough ${effect.resource}.`);
      from.resources[effect.resource] = (from.resources[effect.resource] ?? 0) - effect.amount;
      to.resources[effect.resource] = (to.resources[effect.resource] ?? 0) + effect.amount;
    }
  }
}
export function interactionBlock(d: EncounterDefinition, s: EncounterState, id: string): string | undefined {
  const interaction = d.interactions.find(i => i.id === id), player = s.actors[d.playerId]!;
  if (!interaction) return 'Unknown interaction.';
  if (interaction.once && s.attempts.includes(id)) return 'That attempt is already resolved. Changed circumstances need a new opportunity.';
  if (interaction.position && player.position !== interaction.position) return 'Move to the right position first.';
  if (interaction.counterpartyId) {
    const other = s.actors[interaction.counterpartyId];
    if (!other || other.hp === 0 || other.disposition === 'fled') return 'That person is unavailable.';
    if (other.position !== player.position) return `Move within speaking distance of ${other.name}.`;
    if (d.hostilities.some(([a, b]) => (a === player.team && b === other.team) || (b === player.team && a === other.team)) && s.phase === 'combat' && other.disposition === 'active') return 'That person is fighting you. This opportunity is unavailable during combat.';
  }
  if (interaction.requiresFlags.some(flag => !s.flags.includes(flag)) || interaction.excludesFlags.some(flag => s.flags.includes(flag))) return 'The conditions for this opportunity are not met.';
  if (interaction.check && player.stats[interaction.check.stat] === undefined) return 'The required skill is missing.';
  // Check BOTH branches before rolling, including cumulative transfers. Invalid offers never consume a roll.
  try { applyEffects(structuredClone(s), interaction.success.effects); applyEffects(structuredClone(s), interaction.failure.effects); }
  catch (error) { return error instanceof Error ? error.message : 'This exchange is unavailable.'; }
}
export function performInteraction(d: EncounterDefinition, s: EncounterState, id: string, out: EncounterOutput, rng: () => number, adapters?: readonly RulesAdapter[]) {
  const reason = interactionBlock(d, s, id); if (reason) throw new Error(reason);
  const interaction = d.interactions.find(i => i.id === id)!, player = s.actors[d.playerId]!, rules = encounterRules(d, adapters);
  let success = true;
  if (interaction.check) {
    const check = rules.check(player.id, interaction.check.stat, rules.skillTarget(player, interaction.check.stat, interaction.check.modifier), s.round, rng);
    out.checks.push(check); success = check.degree === 'success' || check.degree === 'exceptional';
  }
  const outcome = success ? interaction.success : interaction.failure;
  applyEffects(s, outcome.effects); s.attempts.push(id);
  if (s.phase === 'combat' && interaction.costsAction) player.actionsLeft--;
  out.events.push({ kind: 'interaction', actorId: player.id, interactionId: id, text: outcome.text });
}
