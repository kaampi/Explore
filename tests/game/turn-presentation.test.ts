import { expect,it } from 'vitest';
import { loadingBayGame } from '../../src/scenarios/loadingBay';
import { resolveEncounterAction } from '../../src/game/EncounterEngine';
import { EncounterGameSchema } from '../../src/game/EncounterSchema';
import { newGateEncounter,resolveGateAction,GateEncounterSchema } from '../../src/checks/gateEncounter';
it('journals distinct, detached snapshots in the actual initiative order',()=>{
 const before=loadingBayGame();before.state.actors.courier!.position='cargo';before.state.barriers.shutter!.open=true;before.state.barriers.shutter!.locked=false;
 const values=[.8,.1,.9,.95,.99,.34];let i=0;
 const game=resolveEncounterAction(before,{id:'attack',expectedRevision:0,action:{kind:'attack',targetId:'drone',weaponId:'pulse-pistol'}},()=>values[i++]??.99),beats=game.history[0]!.presentation!;
 expect(beats.map(beat=>beat.actorId)).toEqual(['officer','courier']);expect(beats.map(beat=>beat.check?.roll)).toEqual([100,35]);expect(beats[0]!.actors.drone!.hp).toBe(10);expect(beats[1]!.actors.drone!.hp).toBeLessThan(10);
 const copy=EncounterGameSchema.parse(JSON.parse(JSON.stringify(game)));expect(copy.history[0]!.presentation).toEqual(beats);copy.state.actors.drone!.hp=0;expect(copy.history[0]!.presentation![0]!.actors.drone!.hp).toBe(10);expect(before.state.actors.drone!.hp).toBe(10);
});
it('the compatibility scene retains each opponent’s real check and skips dice for holding fire',()=>{
 const seed=newGateEncounter();seed.phase='combat';seed.round=1;
 const attack=resolveGateAction(seed,{id:'sword',expectedRevision:0,action:{kind:'attack',target:'mona',weapon:'sword'}},()=>.34);
 expect(attack.history[0]!.presentation![0]!.actors.mona!.hp).toBe(10);
 const ended=resolveGateAction(attack,{id:'pass',expectedRevision:1,action:{kind:'end-turn'}},()=>.34),beats=ended.history[1]!.presentation!;
 expect(beats.map(beat=>beat.actorId)).toEqual(['mona','archer']);expect(beats[0]!.check?.roll).toBe(35);expect(beats[0]!.check?.targetId).toBe('player');expect(beats[0]!.actors.player!.hp).toBe(16);expect(beats[1]!.check).toBeUndefined();expect(GateEncounterSchema.parse(JSON.parse(JSON.stringify(ended))).history[1]!.presentation).toEqual(beats);
});
