import type { GateEncounter, GateCheck } from './gateEncounter';
import { startEncounterCombat, finishEncounterTurn, output, performAttack, attackTarget, recordCombatBeat, breakSurrender } from '../game/EncounterEngine';
import { describeEvents } from '../game/narration';
import type { EncounterOutput, CombatBeat } from '../game/EncounterSchema';
import { gateDefinition, gateCombatState, applyGateCombatState, type GatePosition } from '../scenarios/gateWorld';
export type CombatActor = 'player' | 'mona' | 'archer';
export type Enemy = 'mona' | 'archer';
export type EnemyTurn = { actor: Enemy; round: number; from: GatePosition; to: GatePosition; action: 'attack' | 'defend' | 'retreat' | 'surrender' | 'open' | 'unlock' | 'rearm'; weapon?: 'sword' | 'bow' | 'dagger' };
export const ACTOR_NAMES = { player: 'You', mona: 'Mona', archer: 'Archer' };
export function enemyState(s: GateEncounter, id: Enemy) { return id === 'mona' ? { hp: s.monaHp, position: s.monaPosition, defending: s.monaDefending, disposition: s.monaDisposition } : { hp: s.archerHp, position: s.archerPosition, defending: s.archerDefending, disposition: s.archerDisposition }; }
export function enemyActive(s: GateEncounter, id: Enemy) { const actor = enemyState(s, id); return actor.hp > 0 && actor.disposition === 'active'; }
export function combatOrder(s: GateEncounter): CombatActor[] { return s.initiative?.order ?? ['player', 'mona', 'archer']; }
export function combatFinished(s: GateEncounter) { return !enemyActive(s, 'mona') && !enemyActive(s, 'archer'); }
function gateChecks(out: EncounterOutput): GateCheck[] { return out.checks.map(({ actorId, targetId: _targetId, ...check }) => ({ ...check, actor: actorId === 'player' ? 'Traveller' : ACTOR_NAMES[actorId as Enemy] })); }
function transfer(out: EncounterOutput, checks: GateCheck[], turns: EnemyTurn[], presentation: CombatBeat[]) {
  presentation.push(...out.presentation);
  checks.push(...gateChecks(out));
  turns.push(...out.turns.map(turn => ({ actor: turn.actorId as Enemy, round: turn.round, from: turn.from as GatePosition, to: turn.to as GatePosition, action: turn.action, ...(turn.weaponId ? { weapon: turn.weaponId as 'sword' | 'bow' | 'dagger' } : {}) })));
}
export function startGateCombat(s: GateEncounter, checks: GateCheck[], turns: EnemyTurn[], rng: () => number, presentation:CombatBeat[]=[]): string {
  const d = gateDefinition(s.wagonTipped), state = gateCombatState(s), out = output();
  startEncounterCombat(d, state, out, rng); applyGateCombatState(s, state); transfer(out, checks, turns, presentation);
  s.suspicious = 3; s.admitted = false;
  return describeEvents(d, state, out.events);
}
export function finishGatePlayerTurn(s: GateEncounter, checks: GateCheck[], turns: EnemyTurn[], rng: () => number, presentation:CombatBeat[]=[]): string {
  const d = gateDefinition(s.wagonTipped), state = gateCombatState(s), out = output(), legacy = !s.initiative;
  finishEncounterTurn(d, state, out, rng); applyGateCombatState(s, state, legacy); transfer(out, checks, turns, presentation);
  s.actionUsed = false; s.moveUsed = false; s.defending = false;
  return describeEvents(d, state, out.events);
}
export function gateAttackTarget(s: GateEncounter, target: Enemy, weapon: 'sword' | 'bow') {
  return attackTarget(gateDefinition(s.wagonTipped), gateCombatState(s), 'player', target, `player-${weapon}`);
}
export function gateAttack(s: GateEncounter, target: Enemy, weapon: 'sword' | 'bow', rng: () => number, presentation:CombatBeat[]=[]): GateCheck {
  const d = gateDefinition(s.wagonTipped), state = gateCombatState(s), out = output();
  performAttack(d, state, 'player', target, `player-${weapon}`, out, rng); recordCombatBeat(state,out,'player',weapon==='sword'?'Sword':'Bow',out.checks[0]); presentation.push(...out.presentation); applyGateCombatState(s, state, !s.initiative);
  return gateChecks(out)[0]!;
}

export function breakGateSurrender(s:GateEncounter,target:Enemy,rng:()=>number):string{
 const d=gateDefinition(s.wagonTipped),state=gateCombatState(s),out=output();
 breakSurrender(d,state,'player',target,out,rng);applyGateCombatState(s,state,!s.initiative);
 return describeEvents(d,state,out.events);
}
