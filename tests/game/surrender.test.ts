import { expect,it } from 'vitest';
import { loadingBayGame } from '../../src/scenarios/loadingBay';
import { EncounterGameSchema,type EncounterGame,type EncounterAction } from '../../src/game/EncounterSchema';
import { actionBlock,attackTarget,resolveEncounterAction } from '../../src/game/EncounterEngine';
import { newGateEncounter,resolveGateAction,gateActionPreview,gateActionBlock,GateEncounterSchema } from '../../src/checks/gateEncounter';
import { localGatePlan } from '../../src/checks/gateIntent';
const attack={kind:'attack',targetId:'officer',weaponId:'shock-baton'} as const;
function scene(){const game=loadingBayGame();game.state.actors.courier!.position='cargo';game.state.actors.officer!.disposition='surrendered';game.state.actors.drone!.disposition='fled';game.state.actors.sentry!.disposition='fled';return game;}
const step=(g:EncounterGame,action:EncounterAction,rng=()=>.34)=>resolveEncounterAction(g,{id:`step-${g.state.revision}`,expectedRevision:g.state.revision,action},rng);
function rolls(...values:number[]){let index=0;return()=>values[index++]??.34;}
it('an explicit attack ends surrender, includes the opponent in combat and improves the unready target chance',()=>{
 const initial=scene();expect(actionBlock(initial.definition,initial.state,attack)).toBeUndefined();expect(attackTarget(initial.definition,initial.state,'courier','officer','shock-baton')).toBe(85);
 const next=step(initial,attack,rolls(.01,.99,.69));expect(next.state.phase).toBe('combat');expect(next.state.initiative!.order).toEqual(['courier','officer']);expect(next.state.actors.officer!.hp).toBe(9);expect(next.state.actors.officer!.disposition).toBe('active');expect(next.state.actors.officer!.weaponReady).toBe(false);expect(next.history[0]!.checks[0]!.target).toBe(85);expect(next.history[0]!.events[0]!.kind).toBe('surrender-broken');expect(initial.state.actors.officer!.disposition).toBe('surrendered');
});
it('a reactivated opponent spends an action readying a weapon and only attacks on a later turn',()=>{
 let game=step(scene(),attack,rolls(.01,.99,.69));game=step(game,{kind:'end-turn'});expect(game.state.actors.officer!.weaponReady).toBe(true);expect(game.history.at(-1)!.turns[0]!.action).toBe('rearm');expect(game.history.at(-1)!.checks).toHaveLength(0);expect(game.state.actors.courier!.hp).toBe(24);
 game=step(game,{kind:'end-turn'});expect(game.history.at(-1)!.checks.some(check=>check.actorId==='officer')).toBe(true);expect(game.state.actors.courier!.hp).toBeLessThan(24);
});
it('a miss still resumes hostilities and cannot manufacture damage, extra actions or repeated execution',()=>{
 const current=scene(),request={id:'once',expectedRevision:0,action:attack};const next=resolveEncounterAction(current,request,rolls(.01,.99,.99));expect(next.state.actors.officer!.hp).toBe(14);expect(next.history[0]!.checks[0]!.damage).toBe(0);expect(next.state.actors.officer!.disposition).toBe('active');expect(next.state.actors.courier!.actionsLeft).toBe(0);expect(()=>resolveEncounterAction(next,request,()=>{throw Error('reroll');})).toThrow('already');
});
it('does not revive fleeing or incapacitated targets, or break surrender for an impossible attack',()=>{
 for(const problem of ['dead','fled','reach','dice']){const game=scene();if(problem==='dead')game.state.actors.officer!.hp=0;if(problem==='fled')game.state.actors.officer!.disposition='fled';if(problem==='reach')game.state.actors.courier!.position='dock';const before=JSON.stringify(game);expect(()=>step(game,attack,()=>NaN)).toThrow();expect(JSON.stringify(game)).toBe(before);}
});
it('adds a surrendered late entrant once without resetting the current combat or other actors',()=>{
 const game=scene(),s=game.state;s.phase='combat';s.round=3;s.initiative={order:['courier','drone'],rolls:{courier:1,drone:50}};s.actors.drone!.disposition='active';
 const next=step(game,attack,rolls(.49,.69));expect(next.state.initiative!.order).toEqual(['courier','drone','officer']);expect(next.state.round).toBe(3);expect(next.state.cursor).toBe(0);expect(next.state.actors.drone).toEqual(game.state.actors.drone);expect(EncounterGameSchema.parse(JSON.parse(JSON.stringify(next))).state.actors.officer!.weaponReady).toBe(false);
});
it('the gate compatibility scene allows a final attack after every opponent stopped fighting',()=>{
 const initial=newGateEncounter();initial.monaDisposition='surrendered';initial.monaHp=4;initial.archerHp=0;
 expect(gateActionBlock(initial,{kind:'attack',target:'mona',weapon:'sword'})).toBeUndefined();expect(gateActionPreview(initial,{kind:'attack',target:'mona',weapon:'sword'}).target).toBe(85);expect(localGatePlan('Jag vill avsluta Mona',initial)).toEqual([{kind:'attack',target:'mona',weapon:'sword'}]);
 const next=resolveGateAction(initial,{id:'attack-surrendered',expectedRevision:0,action:{kind:'attack',target:'mona',weapon:'sword'}},rolls(.01,.99,.69));expect(next.monaHp).toBe(0);expect(next.phase).toBe('exploration');expect(next.history[0]!.renewedSurrender).toBe('mona');expect(next.history[0]!.checks[0]!.target).toBe(85);expect(GateEncounterSchema.parse(JSON.parse(JSON.stringify(next))).monaWeaponReady).toBe(false);expect(initial.monaHp).toBe(4);
});
it('renewed surrender before the player’s initiative cannot erase a subsequent actual attack',()=>{
 const game=scene();game.state.actors.officer!.hp=3;game.state.barriers.shutter!.open=false;game.state.actors.officer!.tactics!.escapeTo='dock';
 const next=step(game,attack,rolls(.99,.01,.99));expect(next.history[0]!.turns[0]!.action).toBe('surrender');expect(next.history[0]!.checks[0]!.degree).toBe('severe');expect(next.state.actors.officer!.disposition).toBe('active');expect(next.state.phase).toBe('combat');expect(next.state.initiative!.order[next.state.cursor]).toBe('courier');expect(next.history[0]!.events.filter(e=>e.kind==='surrender-broken')).toHaveLength(1);
});
