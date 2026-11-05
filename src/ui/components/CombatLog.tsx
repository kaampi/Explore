import type { GateEncounter } from '../../checks/gateEncounter';
import type { EncounterGame } from '../../game/EncounterSchema';
import { POSITION_NAMES } from '../../scenarios/gateWorld';

type HistoryItem = { combat?: boolean | undefined; action?: string | undefined; label?: string | undefined; events?: { kind: string }[] | undefined };
/** Old saves have no category; recognise their attack/turn records without altering saved outcomes. */
export function isCombatRecord(entry?: HistoryItem): boolean {
  if (!entry) return false;
  if (entry.combat !== undefined) return entry.combat;
  return /^(?:Sword|Bow) · |^(?:End turn|Defend)$/.test(entry.action ?? entry.label ?? '') || !!entry.events?.some(event => event.kind === 'attack' || event.kind === 'initiative');
}
type LogCheck = { actor: string; stat: string; roll: number; target: number; degree: string; damage?: number | undefined };
export type CombatLogItem = { id: string; title: string; checks: LogCheck[]; notes: string[] };
type Turn = { actorId: string; from: string; to: string; action: string };
function turnNotes(turns: Turn[], who: (id: string) => string, where: (id: string) => string) {
  return turns.flatMap(turn => [
    ...(turn.from !== turn.to ? [`${who(turn.actorId)} ${turn.action === 'retreat' ? 'withdraws' : 'advances'} to ${where(turn.to).toLowerCase()}.`] : []),
    ...(turn.action==='rearm'?[`${who(turn.actorId)} readies a weapon; no attack this turn.`]:turn.action === 'surrender' ? [`${who(turn.actorId)} surrenders.`] : turn.action === 'defend' ? [`${who(turn.actorId)} defends.`] : turn.action === 'unlock' || turn.action === 'open' ? [`${who(turn.actorId)} ${turn.action === 'unlock' ? 'unlocks' : 'opens'} a passage.`] : [])
  ]);
}
export function gateCombatLog(s: GateEncounter): CombatLogItem[] {
  return s.history.filter(isCombatRecord).map(entry => ({
    id: entry.id, title: entry.action === 'End turn' ? 'Opponents’ turn' : entry.action,
    checks: entry.checks,
    notes: [
      ...(entry.renewedSurrender?[`You attacked after ${entry.renewedSurrender==='mona'?'Mona':'Archer'} surrendered. Hostilities resume.`]:[]),
      ...turnNotes((entry.enemyTurns ?? []).map(turn => ({ ...turn, actorId: turn.actor })), id => id === 'mona' ? 'Mona' : 'Archer', id => POSITION_NAMES[id as keyof typeof POSITION_NAMES]),
      ...(!entry.checks.some(check => check.actor === 'Traveller') && /^(Sword|Bow) · /.test(entry.action) ? ['Your planned attack was interrupted.'] : [])
    ]
  }));
}
export function encounterCombatLog(game: EncounterGame): CombatLogItem[] {
  const who = (id: string) => game.state.actors[id]?.name ?? id, where = (id: string) => game.definition.places.find(place => place.id === id)?.name ?? id;
  return game.history.filter(isCombatRecord).map(entry => ({
    id: entry.id, title: entry.label === 'End turn' ? 'Opponents’ turn' : entry.label,
    checks: entry.checks.map(check => ({ ...check, actor: who(check.actorId) })),
    notes: [...turnNotes(entry.turns, who, where),...entry.events.filter(event=>event.kind==='surrender-broken').map(event=>`${who(event.actorId)} attacks despite ${who(event.targetId)}’s surrender.`), ...entry.events.filter(event => event.kind === 'blocked').map(event => event.reason)]
  }));
}
export function CombatLog({ entries, active }: { entries: CombatLogItem[]; active: boolean }) {
  if (!entries.length) return null;
  return <section className="combat-log" aria-label="Combat log"><details open={active}><summary>Combat log</summary><ol>
    {entries.slice(-6).reverse().map(entry => <li key={entry.id}><strong>{entry.title}</strong>
      {entry.checks.map((check, index) => <div className="combat-log__check" key={index}>{check.actor} · {check.stat} <b>{check.degree === 'success' || check.degree === 'exceptional' ? 'Success' : 'Miss'}</b><span>{check.roll}/{check.target}{check.damage ? ` · ${check.damage} damage` : ''}</span></div>)}
      {entry.notes.map((note, index) => <small key={index}>{note}</small>)}
    </li>)}
  </ol></details></section>;
}
