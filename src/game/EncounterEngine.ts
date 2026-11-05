import {
  EncounterGameSchema, EncounterRequestSchema, type Actor, type EncounterAction, type EncounterOutput,
  type EncounterRequest, type EncounterDefinition, type EncounterGame, type EncounterState, type ActionCheck
} from './EncounterSchema';
import { canMove, connected, distance, findPath, lineOfSight } from './geometry';
import { encounterRules, type RulesAdapter } from './rules';
import { describeEvents, actionLabel } from './narration';
import { interactionBlock as opportunityBlock, performInteraction } from './interactions';
import { greetingTarget,spokenInteraction } from './dialogue';

export const weaponReady=(actor:Actor)=>actor.weaponReady??actor.disposition!=='surrendered';
export const active = (actor: Actor) => actor.hp > 0 && actor.disposition === 'active';
export const output = (): EncounterOutput => ({ events: [], checks: [], turns: [], presentation: [] });
export function hostile(d: EncounterDefinition, a: Actor, b: Actor) {
  return d.hostilities.some(([x, y]) => (x === a.team && y === b.team) || (y === a.team && x === b.team));
}
export function opponents(d: EncounterDefinition, s: EncounterState, actor: Actor) {
  return Object.values(s.actors).filter(other => active(other) && hostile(d, actor, other));
}
export function combatOver(d: EncounterDefinition, s: EncounterState) {
  return opponents(d, s, s.actors[d.playerId]!).length === 0;
}
/** Validate authored references on load as well as before a command; no model output becomes scene data. */
export function validateEncounter(game: EncounterGame) {
  const { definition: d, state: s } = game;
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (s.sceneId !== d.id || !unique(d.places.map(p => p.id)) || !unique(d.weapons.map(w => w.id))) throw new Error('Invalid encounter definition.');
  const placeIds = new Set(d.places.map(p => p.id)), weaponIds = new Set(d.weapons.map(w => w.id));
  if (!unique(d.items.map(item => item.id)) || !unique(Object.values(s.actors).flatMap(actor => actor.inventory))) throw new Error('Item instances must have one owner.');
  const player = s.actors[d.playerId];
  if (!player || player.control !== 'player' || Object.values(s.actors).filter(a => a.control === 'player').length !== 1) throw new Error('An encounter needs one player-controlled actor.');
  for (const [key, actor] of Object.entries(s.actors)) {
    if (key !== actor.id || actor.hp > actor.maxHp || !placeIds.has(actor.position) || actor.weapons.some(id => !weaponIds.has(id))) throw new Error('Invalid actor reference.');
    if (actor.tactics && (!actor.weapons.includes(actor.tactics.preferredWeapon) || (actor.tactics.fallbackWeapon && !actor.weapons.includes(actor.tactics.fallbackWeapon)) || (actor.tactics.escapeTo && !placeIds.has(actor.tactics.escapeTo)) || actor.tactics.repositionTo.some(id => !placeIds.has(id)))) throw new Error('Invalid tactics reference.');
  }
  for (const [key, barrier] of Object.entries(s.barriers)) if (barrier.id !== key) throw new Error('Invalid barrier reference.');
  for (const link of [...d.connections, ...d.sightLines]) if (!placeIds.has(link.from) || !placeIds.has(link.to) || (link.barrierId && !s.barriers[link.barrierId])) throw new Error('Invalid place connection.');
  if (!unique(d.interactions.map(i => i.id))) throw new Error('Duplicate interaction IDs.');
  for (const interaction of d.interactions) {
    if ((interaction.counterpartyId && !s.actors[interaction.counterpartyId]) || (interaction.position && !placeIds.has(interaction.position))) throw new Error('Invalid interaction reference.');
    for (const effect of [...interaction.success.effects, ...interaction.failure.effects]) if (effect.kind !== 'flag' && (!s.actors[effect.from] || !s.actors[effect.to] || effect.from === effect.to)) throw new Error('Invalid exchange reference.');
  }
  if (s.initiative && (!unique(s.initiative.order) || !s.initiative.order.includes(d.playerId) || s.initiative.order.some(id => !s.actors[id]) || s.cursor >= s.initiative.order.length)) throw new Error('Invalid turn order.');
  return game;
}
export function recordCombatBeat(s: EncounterState, out: EncounterOutput, actorId: string, text: string, check?:ActionCheck) {
  out.presentation.push({actorId,round:s.round,text,actors:Object.fromEntries(Object.values(s.actors).map(a=>[a.id,{hp:a.hp,position:a.position,defending:a.defending,disposition:a.disposition,...(a.weaponReady!==undefined?{weaponReady:a.weaponReady}:{})}])),...(check?{check:structuredClone(check)}:{})});
}
export function attackBlock(d: EncounterDefinition, s: EncounterState, actorId: string, targetId: string, weaponId: string): string | undefined {
  const actor = s.actors[actorId], target = s.actors[targetId], weapon = d.weapons.find(w => w.id === weaponId);
  if (!actor || !target || !weapon || !actor.weapons.includes(weaponId)) return 'Unknown actor, target or weapon.';
  if (!active(actor)) return 'That actor cannot act.';
  if (!weaponReady(actor)) return 'That actor must ready a weapon before attacking.';
  if (!hostile(d, actor, target)) return 'That character is not a hostile target.';
  if (target.hp === 0) return 'That opponent is already incapacitated.';
  if (target.disposition === 'fled') return 'That opponent has left the fight.';
  if (weapon.kind === 'melee' && actor.position !== target.position) return 'Out of weapon reach. Reach the same position first.';
  if (weapon.kind === 'ranged') {
    if (weapon.usesAmmunition && !(actor.ammunition[weaponId]! > 0)) return 'You have no ammunition left.';
    if (actor.position === target.position) return 'Too close to use a ranged weapon.';
    if (!lineOfSight(d, s, actor.position, target.position)) return 'An obstacle blocks your line of sight.';
    if (weapon.range !== undefined && distance(d, actor.position, target.position) > weapon.range) return 'Out of weapon range.';
  }
}
export function attackTarget(d: EncounterDefinition, s: EncounterState, actorId: string, targetId: string, weaponId: string, adapters?: readonly RulesAdapter[]) {
  const actor = s.actors[actorId], target = s.actors[targetId], weapon = d.weapons.find(w => w.id === weaponId);
  if (!actor || !target || !weapon) throw new Error('Unknown attack.');
  return encounterRules(d, adapters).attackTarget(actor, target, weapon, d.places.find(p => p.id === target.position)?.cover ?? 0, d);
}
/** An explicit attack ends the surrender; a late entrant joins after the current turn. */
export function breakSurrender(d:EncounterDefinition,s:EncounterState,actorId:string,targetId:string,out:EncounterOutput,rng:()=>number,adapters?:readonly RulesAdapter[]){
 const target=s.actors[targetId]!;if(target.disposition!=='surrendered')return;
 target.disposition='active';target.weaponReady=false;target.defending=false;
 if(s.phase==='combat'&&s.initiative&&!s.initiative.order.includes(targetId)){s.initiative.order.push(targetId);s.initiative.rolls[targetId]=encounterRules(d,adapters).initiative(rng);}
 if(!out.events.some(event=>event.kind==='surrender-broken'&&event.actorId===actorId&&event.targetId===targetId))out.events.push({kind:'surrender-broken',actorId,targetId});
}
export function performAttack(d: EncounterDefinition, s: EncounterState, actorId: string, targetId: string, weaponId: string, out: EncounterOutput, rng: () => number, adapters?: readonly RulesAdapter[]) {
  const blocked = attackBlock(d, s, actorId, targetId, weaponId);
  if (blocked) throw new Error(blocked);
  const actor = s.actors[actorId]!, target = s.actors[targetId]!, weapon = d.weapons.find(w => w.id === weaponId)!, rules = encounterRules(d, adapters);
  if (actor.actionsLeft <= 0) throw new Error('No actions remain.');
  const check = rules.check(actorId, weapon.skill, attackTarget(d, s, actorId, targetId, weaponId, adapters), s.round, rng);
  check.targetId = targetId; check.damage = rules.damage(check, weapon, d);
  target.hp = Math.max(0, target.hp - check.damage);
  if (weapon.usesAmmunition) actor.ammunition[weaponId]!--;
  actor.actionsLeft--;
  out.checks.push(check); out.events.push({ kind: 'attack', actorId, targetId, weaponId, check });
  return check;
}
function moveActor(d: EncounterDefinition, s: EncounterState, actor: Actor, to: string, reason: 'advance' | 'retreat' | 'disengage' | 'vantage' | 'move', out: EncounterOutput) {
  if (actor.movesLeft <= 0 || !canMove(d, s, actor.position, to)) throw new Error('No legal movement remains.');
  const from = actor.position; actor.position = to; actor.movesLeft--;
  out.events.push({ kind: 'move', actorId: actor.id, from, to, reason });
}
function adjacentBarrier(d: EncounterDefinition, actor: Actor, barrierId: string) {
  return d.connections.some(link => link.barrierId === barrierId && (link.from === actor.position || link.to === actor.position));
}
function interactionBlock(d: EncounterDefinition, s: EncounterState, actor: Actor, id: string, operation: 'unlock' | 'open') {
  const barrier = s.barriers[id];
  if (!barrier || !adjacentBarrier(d, actor, id)) return 'Move to that barrier first.';
  if (barrier.blocked) return 'That passage is barricaded.';
  if (operation === 'unlock') return !barrier.locked ? 'Already unlocked.' : !barrier.keyId || !actor.inventory.includes(barrier.keyId) ? 'You need the matching key.' : undefined;
  return barrier.locked ? 'It is locked.' : barrier.open ? 'Already open.' : undefined;
}
function interact(d: EncounterDefinition, s: EncounterState, actor: Actor, id: string, operation: 'unlock' | 'open', out: EncounterOutput) {
  const blocked = interactionBlock(d, s, actor, id, operation); if (blocked) throw new Error(blocked);
  if (operation === 'unlock') s.barriers[id]!.locked = false; else s.barriers[id]!.open = true;
  actor.actionsLeft--; out.events.push({ kind: operation, actorId: actor.id, barrierId: id });
}
/** NPC planning uses the same attack, path, door and action checks as the controlled actor. */
function npcTurn(d: EncounterDefinition, s: EncounterState, actor: Actor, out: EncounterOutput, rng: () => number, adapters?: readonly RulesAdapter[]) {
  if (!active(actor)) return;
  const from = actor.position, tactics = actor.tactics;
  const target = opponents(d, s, actor).sort((a, b) => distance(d, actor.position, a.position) - distance(d, actor.position, b.position) || a.id.localeCompare(b.id))[0];
  const record = (action: EncounterOutput['turns'][number]['action'], weaponId?: string) => out.turns.push({ actorId: actor.id, round: s.round, from, to: actor.position, action, ...(weaponId ? { weaponId } : {}) });
  const defend = () => { actor.defending = true; actor.actionsLeft--; out.events.push({ kind: 'defend', actorId: actor.id }); record('defend'); };
  if (!target || !tactics) { defend(); return; }
  if (actor.hp <= tactics.retreatAt) {
    const route = tactics.escapeTo ? findPath(d, s, actor.position, tactics.escapeTo) : [], next = route[1];
    if (actor.position === tactics.escapeTo || (next && next !== target.position)) {
      if (next) moveActor(d, s, actor, next, 'retreat', out);
      if (actor.position === tactics.escapeTo) { actor.disposition = 'fled'; out.events.push({ kind: 'flee', actorId: actor.id }); }
      else actor.defending = true;
      actor.actionsLeft--; record('retreat'); return;
    }
    actor.disposition = 'surrendered'; actor.weaponReady=false; actor.defending=false; actor.actionsLeft--; out.events.push({ kind: 'surrender', actorId: actor.id }); record('surrender'); return;
  }
  if(!weaponReady(actor)&&actor.weapons.length){actor.weaponReady=true;actor.actionsLeft--;out.events.push({kind:'rearm',actorId:actor.id});record('rearm');return;}
  const preferred = d.weapons.find(w => w.id === tactics.preferredWeapon)!;
  const ranged = preferred.kind === 'ranged' && (!preferred.usesAmmunition || (actor.ammunition[preferred.id] ?? 0) > 0);
  if (ranged && actor.position === target.position) {
    const destination = tactics.repositionTo.find(id => id !== actor.position);
    const next = destination ? findPath(d, s, actor.position, destination)[1] : undefined;
    if (next && next !== target.position) moveActor(d, s, actor, next, 'disengage', out);
  }
  if (ranged && actor.position === from && attackBlock(d, s, actor.id, target.id, preferred.id)) {
    const vantage = d.places.find(p => p.id !== target.position && canMove(d, s, actor.position, p.id) && lineOfSight(d, s, p.id, target.position) && (preferred.range === undefined || distance(d, p.id, target.position) <= preferred.range));
    if (vantage) moveActor(d, s, actor, vantage.id, 'vantage', out);
  }
  const wantsMelee = !ranged || !lineOfSight(d, s, actor.position, target.position) || (preferred.range !== undefined && distance(d, actor.position, target.position) > preferred.range);
  if (wantsMelee && actor.position !== target.position && actor.position === from) {
    const route = findPath(d, s, actor.position, target.position), next = route[1];
    if (next) moveActor(d, s, actor, next, 'advance', out);
    else {
      const planned = findPath(d, s, actor.position, target.position, true), step = planned[1];
      if (step && canMove(d, s, actor.position, step)) moveActor(d, s, actor, step, 'advance', out);
      else if (step) {
        const doorId = connected(d, actor.position, step)?.barrierId, door = doorId ? s.barriers[doorId] : undefined;
        if (door && doorId) {
          const operation = door.locked ? 'unlock' : 'open';
          if (!interactionBlock(d, s, actor, doorId, operation)) {
            interact(d, s, actor, doorId, operation, out);
            if (operation === 'open' && canMove(d, s, actor.position, step)) moveActor(d, s, actor, step, 'advance', out);
            record(operation); return;
          }
        }
      }
    }
  }
  const weaponId = actor.position === target.position && tactics.fallbackWeapon ? tactics.fallbackWeapon : tactics.preferredWeapon;
  const weapon = d.weapons.find(w => w.id === weaponId)!;
  const blocked = attackBlock(d, s, actor.id, target.id, weaponId);
  if (!blocked && weapon.kind === 'ranged') {
    const ally = Object.values(s.actors).find(other => other.id !== actor.id && active(other) && other.team === actor.team && other.position === target.position);
    if (ally) { actor.defending = true; actor.actionsLeft--; out.events.push({ kind: 'hold-fire', actorId: actor.id, allyId: ally.id }); record('defend'); return; }
  }
  if (!blocked) { performAttack(d, s, actor.id, target.id, weaponId, out, rng, adapters); record('attack', weaponId); }
  else defend();
}
function resetActor(d: EncounterDefinition, actor: Actor) {
  actor.actionsLeft = d.rules.actionsPerTurn; actor.movesLeft = d.rules.movesPerTurn; actor.defending = false;
}
function finishIfNeeded(d: EncounterDefinition, s: EncounterState, out: EncounterOutput) {
  if (s.actors[d.playerId]!.hp === 0) { s.phase = 'defeated'; out.events.push({ kind: 'defeated' }); return true; }
  if (combatOver(d, s)) { s.phase = 'exploration'; out.events.push({ kind: 'combat-ended' }); return true; }
  return false;
}
function advanceCursor(d: EncounterDefinition, s: EncounterState) {
  s.cursor++;
  if (s.cursor >= s.initiative!.order.length) { s.cursor = 0; s.round++; }
  resetActor(d, s.actors[s.initiative!.order[s.cursor]!]!);
}
function automaticTurns(d: EncounterDefinition, s: EncounterState, out: EncounterOutput, rng: () => number, adapters?: readonly RulesAdapter[]) {
  while (s.phase === 'combat' && s.initiative!.order[s.cursor] !== d.playerId) {
    const actor = s.actors[s.initiative!.order[s.cursor]!]!;
    if (active(actor)) {
      const start=out.events.length,checkCount=out.checks.length;
      npcTurn(d, s, actor, out, rng, adapters);
      recordCombatBeat(s,out,actor.id,describeEvents(d,s,out.events.slice(start)),out.checks.length>checkCount?out.checks.at(-1):undefined);
    }
    if (finishIfNeeded(d, s, out)) return;
    advanceCursor(d, s);
  }
}
export function startEncounterCombat(d: EncounterDefinition, s: EncounterState, out: EncounterOutput, rng: () => number, adapters?: readonly RulesAdapter[]) {
  if (s.phase === 'combat') return;
  const rules = encounterRules(d, adapters), actors = Object.values(s.actors).filter(a => active(a) && (a.id === d.playerId || Object.values(s.actors).some(b => active(b) && hostile(d, a, b))));
  // Ties are stable and favour the player; all other actors keep their authored order.
  actors.sort((a, b) => Number(b.id === d.playerId) - Number(a.id === d.playerId));
  const rolls = Object.fromEntries(actors.map(actor => [actor.id, rules.initiative(rng)]));
  const order = actors.map(a => a.id).sort((a, b) => rules.compareInitiative(rolls[a]!, rolls[b]!));
  s.initiative = { rolls, order }; s.round = 1; s.cursor = 0; s.phase = 'combat';
  for (const actor of actors) resetActor(d, actor);
  out.events.push({ kind: 'initiative', order, rolls });
  if (finishIfNeeded(d, s, out)) return;
  automaticTurns(d, s, out, rng, adapters);
}
export function finishEncounterTurn(d: EncounterDefinition, s: EncounterState, out: EncounterOutput, rng: () => number, adapters?: readonly RulesAdapter[]) {
  if (s.phase !== 'combat' || s.initiative?.order[s.cursor] !== d.playerId) throw new Error('It is not your turn.');
  if (!finishIfNeeded(d, s, out)) {
    advanceCursor(d, s); automaticTurns(d, s, out, rng, adapters);
    if (s.phase === 'combat') out.events.push({ kind: 'turn-ready' });
  }
}
export function actionBlock(d: EncounterDefinition, s: EncounterState, action: EncounterAction): string | undefined {
  const spoken=action.kind==='say'?spokenInteraction(d,s,action.text):undefined;
  if(spoken)return actionBlock(d,s,{kind:'interaction',interactionId:spoken.id});
  const actor = s.actors[d.playerId]!;
  if (s.phase === 'complete' || s.phase === 'defeated') return 'This encounter has ended.';
  if (s.phase === 'combat' && s.initiative?.order[s.cursor] !== d.playerId) return 'It is not your turn.';
  if (action.kind === 'say' || action.kind === 'look') return;
  if (action.kind === 'end-turn') return s.phase === 'combat' ? undefined : 'There is no combat turn to end.';
  if (action.kind === 'move') return s.phase === 'combat' && actor.movesLeft <= 0 ? 'You have used your movement this turn.' : canMove(d, s, actor.position, action.to) ? undefined : 'There is no open route to that position.';
  if (action.kind === 'interaction' && !d.interactions.find(i => i.id === action.interactionId)?.costsAction) return opportunityBlock(d, s, action.interactionId);
  if (s.phase === 'combat' && actor.actionsLeft <= 0) return 'You have used your action. Move or end your turn.';
  if (action.kind === 'attack') return attackBlock(d, s, actor.id, action.targetId, action.weaponId);
  if (action.kind === 'defend') return s.phase === 'combat' ? undefined : 'Defending is available during combat.';
  if (action.kind === 'interact') return interactionBlock(d, s, actor, action.barrierId, action.operation);
  if (action.kind === 'interaction') return opportunityBlock(d, s, action.interactionId);
}
export function turnExhausted(d: EncounterDefinition, s: EncounterState) {
  return s.phase === 'combat' && s.actors[d.playerId]!.actionsLeft === 0 && !d.places.some(p => !actionBlock(d, s, { kind: 'move', to: p.id }));
}
/** Atomic command boundary. Text, extra properties, duplicate IDs and stale proposals cannot set world state. */
export function resolveEncounterAction(current: EncounterGame, rawRequest: EncounterRequest, rng: () => number = Math.random, adapters?: readonly RulesAdapter[]): EncounterGame {
  const request = EncounterRequestSchema.parse(rawRequest);
  const game = validateEncounter(EncounterGameSchema.parse(structuredClone(current))), { definition: d, state: s } = game;
  encounterRules(d, adapters);
  if (game.history.some(entry => entry.id === request.id)) throw new Error('This action has already been resolved.');
  if(request.expectedSceneId&&request.expectedSceneId!==d.id)throw Error('The scene changed. Review your action again.');
  if (request.expectedRevision !== s.revision) throw new Error('The scene changed. Review your action again.');
  const blocked = actionBlock(d, s, request.action); if (blocked) throw new Error(blocked);
  const spoken=request.action.kind==='say'?spokenInteraction(d,s,request.action.text):undefined;
  const out = output(), action:EncounterAction = spoken?{kind:'interaction',interactionId:spoken.id}:request.action, actor = s.actors[d.playerId]!;
  if(action.kind==='attack')breakSurrender(d,s,actor.id,action.targetId,out,rng,adapters);
  if (action.kind === 'attack' && s.phase !== 'combat') startEncounterCombat(d, s, out, rng, adapters);
  const changed = actionBlock(d, s, action);
  if (changed) out.events.push({ kind: 'blocked', reason: changed });
  else {
    const actionCheckStart=out.checks.length;
    if(action.kind==='attack'&&s.actors[action.targetId]!.disposition==='surrendered'){
      breakSurrender(d,s,actor.id,action.targetId,out,rng,adapters);
      if(s.initiative){s.phase='combat';s.cursor=s.initiative.order.indexOf(d.playerId);}
    }
    if (action.kind === 'attack') performAttack(d, s, actor.id, action.targetId, action.weaponId, out, rng, adapters);
    if (action.kind === 'move') {
      if (s.phase !== 'combat') actor.movesLeft = d.rules.movesPerTurn;
      moveActor(d, s, actor, action.to, 'move', out);
    }
    if (action.kind === 'defend') { actor.defending = true; actor.actionsLeft--; out.events.push({ kind: 'defend', actorId: actor.id }); }
    if (action.kind === 'interact') { if (s.phase !== 'combat') actor.actionsLeft = d.rules.actionsPerTurn; interact(d, s, actor, action.barrierId, action.operation, out); }
    if (action.kind === 'say') {
      const npc=greetingTarget(d,s,action.text);
      out.events.push(npc?{kind:'speech-reply',actorId:npc.id,text:`“Hello,” ${npc.name} says.`}:{ kind: 'say', actorId: actor.id, text: action.text });
    }
    if (action.kind === 'interaction') performInteraction(d, s, action.interactionId, out, rng, adapters);
    if (action.kind === 'look') out.events.push({ kind: 'look', actorId: actor.id });
    if (action.kind !== 'end-turn' && action.kind !== 'say' && action.kind !== 'look' && (s.phase === 'combat' || out.checks.length)) recordCombatBeat(s,out,actor.id,actionLabel(d,s,action),out.checks.length>actionCheckStart?out.checks.at(-1):undefined);
    if (action.kind === 'end-turn') finishEncounterTurn(d, s, out, rng, adapters);
    else if (s.phase === 'combat') {
      if (!finishIfNeeded(d, s, out) && turnExhausted(d, s)) finishEncounterTurn(d, s, out, rng, adapters);
    }
  }
  s.revision++;
  const combat = (current.state.phase === 'combat' || out.events.some(event => event.kind === 'initiative')) && ['attack', 'move', 'defend', 'end-turn'].includes(action.kind);
  const onlyEvent=out.events.length===1?out.events[0]:undefined;
  const speakerId=onlyEvent?.kind==='speech-reply'?onlyEvent.actorId:onlyEvent?.kind==='interaction'?d.interactions.find(i=>i.id===onlyEvent.interactionId)?.counterpartyId:undefined;
  game.history.push({ id: request.id, revision: s.revision, label: actionLabel(d, s, request.action), text: describeEvents(d, s, out.events), ...(speakerId?{speakerId}:{}), combat, checks: out.checks, presentation:out.presentation, events: out.events, turns: out.turns });
  return validateEncounter(EncounterGameSchema.parse(game));
}
