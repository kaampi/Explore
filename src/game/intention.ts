import type { EncounterAction, EncounterGame } from './EncounterSchema';
import { actionBlock, hostile } from './EncounterEngine';
import { actionLabel } from './narration';
import { spokenInteraction } from './dialogue';

export function encounterCommands(game: EncounterGame): EncounterAction[] {
  const { definition: d, state: s } = game, player = s.actors[d.playerId]!;
  return [
    { kind: 'look' }, ...d.interactions.map(i => ({ kind: 'interaction' as const, interactionId: i.id })),
    ...d.places.filter(p => p.id !== player.position).map(p => ({ kind: 'move' as const, to: p.id })),
    ...Object.keys(s.barriers).flatMap(barrierId => (['unlock', 'open'] as const).map(operation => ({ kind: 'interact' as const, barrierId, operation }))),
    ...Object.values(s.actors).filter(a => hostile(d, player, a)).flatMap(target => player.weapons.map(weaponId => ({ kind: 'attack' as const, targetId: target.id, weaponId }))),
    ...(s.phase === 'combat' ? [{ kind: 'defend' as const }, { kind: 'end-turn' as const }] : [])
  ];
}
const normalize = (text: string) => text.toLocaleLowerCase().replace(/[.!?]$/g, '').replace(/\s+/g, ' ').trim();
/** Only a proposal. Execution always rechecks the authoritative scene revision and rules. */
export function proposeEncounterText(game: EncounterGame, text: string): EncounterAction | null {
  if (!text.trim() || text.length > 1000 || /\b(?:ignore|ignorera|system|prompt|override|inte|not|never)\b/i.test(text)) return null;
  const t = normalize(text), commands = encounterCommands(game), { definition: d, state: s } = game;
  const exact = commands.filter(action => normalize(actionLabel(d, s, action)) === t);
  if (exact.length === 1) return exact[0]!;
  const spoken=spokenInteraction(d,s,text);if(spoken)return {kind:'interaction',interactionId:spoken.id};
  if (/^(?:look around|se mig omkring|ser mig omkring)$/.test(t)) return { kind: 'look' };
  if (/^(?:defend|försvara mig|försvarar mig)$/.test(t)) return { kind: 'defend' };
  if (/^(?:end turn|avsluta turen|avslutar turen)$/.test(t)) return { kind: 'end-turn' };
  const attack = /\b(?:attack|shoot|strike|skjuter|skjuta|hugger|hugga|attackerar)\b/.test(t);
  if (attack) {
    const targets = Object.values(s.actors).filter(a => t.includes(normalize(a.name)) || t.includes(a.id));
    const weapons = d.weapons.filter(w => s.actors[d.playerId]!.weapons.includes(w.id) && (t.includes(normalize(w.name)) || t.includes(w.id)));
    if (targets.length === 1 && weapons.length === 1) return { kind: 'attack', targetId: targets[0]!.id, weaponId: weapons[0]!.id };
  }
  // A short purchase label can select the one currently valid authored offer; it cannot change the price.
  const offer = commands.filter(a => a.kind === 'interaction' && normalize(actionLabel(d, s, a).split('·')[0]!) === t && !actionBlock(d, s, a));
  return offer.length === 1 ? offer[0]! : null;
}
