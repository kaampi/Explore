import { encounterDescription } from './sceneDescription';
import type { EncounterAction, EncounterEvent, EncounterDefinition, EncounterState } from './EncounterSchema';
export function actionLabel(d: EncounterDefinition, s: EncounterState, action: EncounterAction) {
  if (action.kind === 'attack') return `${d.weapons.find(w => w.id === action.weaponId)?.name ?? action.weaponId} · ${s.actors[action.targetId]?.name ?? action.targetId}`;
  if (action.kind === 'move') return `Move · ${d.places.find(p => p.id === action.to)?.name ?? action.to}`;
  if (action.kind === 'interact') return `${action.operation === 'unlock' ? 'Unlock' : 'Open'} · ${s.barriers[action.barrierId]?.name ?? action.barrierId}`;
  if (action.kind === 'interaction') return d.interactions.find(i => i.id === action.interactionId)?.label ?? action.interactionId;
  if (action.kind === 'say') return action.text;
  return { defend: 'Defend', 'end-turn': 'End turn', look: 'Look around' }[action.kind];
}
/** Rendering describes committed facts; it has no path back into the simulation. */
export function describeEvents(d: EncounterDefinition, s: EncounterState, events: EncounterEvent[]): string {
  const who = (id: string) => s.actors[id]?.name ?? id;
  const where = (id: string) => (d.places.find(p => p.id === id)?.name ?? id).toLowerCase();
  return events.map(event => {
    switch (event.kind) {
      case 'initiative': return `Initiative: ${event.order.map(id => `${who(id)} ${event.rolls[id]}`).join(' → ')}.`;
      case 'move': return `${who(event.actorId)} ${event.reason === 'retreat' ? 'withdraws' : event.reason === 'disengage' ? 'backs away' : event.reason === 'advance' ? 'advances' : 'moves'} to ${where(event.to)}${event.reason === 'advance' ? ' to close the distance' : event.reason === 'vantage' ? ' for a clear shot' : ''}.`;
      case 'attack': return event.check.damage ? `${who(event.actorId)} hits ${who(event.targetId)} with ${d.weapons.find(w => w.id === event.weaponId)?.name.toLowerCase() ?? event.weaponId} for ${event.check.damage} damage.` : `${who(event.actorId)}'s attack misses.`;
      case 'hold-fire': return `${who(event.actorId)} holds fire to avoid hitting ${who(event.allyId)} and guards the firing position.`;
      case 'defend': return `${who(event.actorId)} takes a defensive stance.`;
      case 'surrender': return `${who(event.actorId)}, badly wounded with no safe escape, drops their weapon and surrenders.`;
      case 'surrender-broken': return `${who(event.actorId)} attacks despite ${who(event.targetId)}’s surrender. The surrender is broken; hostilities resume.`;
      case 'rearm': return `${who(event.actorId)} readies a weapon, using their action. They cannot attack this turn.`;
      case 'flee': return `${who(event.actorId)} leaves the fight through ${where(s.actors[event.actorId]!.position)}.`;
      case 'unlock': case 'open': return `${who(event.actorId)} ${event.kind === 'unlock' ? 'unlocks' : 'opens'} ${s.barriers[event.barrierId]!.name.toLowerCase()}, using their action.`;
      case 'turn-ready': return 'Your turn. You have your action and movement available.';
      case 'combat-ended': return 'No opponents are still fighting. Combat ends.';
      case 'defeated': return 'You are incapacitated before you can take further action. Your progress is saved.';
      case 'blocked': return `Your intended action is no longer possible: ${event.reason} Choose a different action.`;
      case 'say': return `${who(event.actorId)} says: “${event.text}”`;
      case 'speech-reply': return event.text;
      case 'interaction': return event.text;
      case 'look': return `${encounterDescription(d,s)} ${Object.values(s.actors).map(a => `${a.name}: ${where(a.position)}, ${a.hp}/${a.maxHp} health${a.disposition !== 'active' ? ', ' + a.disposition : ''}.`).join(' ')}`;
    }
  }).join(' ');
}
