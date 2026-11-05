import { describe,it,expect } from 'vitest';
import { newGateEncounter,resolveGateAction,gateActionBlock,gateActionPreview,GateEncounterSchema,type GateAction,type GateEncounter } from '../../src/checks/gateEncounter';
import { canTraverse,GATE_POSITIONS } from '../../src/checks/gateGeometry';
import { localGatePlan } from '../../src/checks/gateIntent';
function step(s:GateEncounter,action:GateAction,rng:()=>number=()=>.99){return resolveGateAction(s,{id:`t${s.revision}`,expectedRevision:s.revision,action},rng);}
function sequence(...values:number[]){let index=0;return ()=>values[index++]??.99;}
function combat(){const s=newGateEncounter();s.phase='combat';s.round=1;return s;}
describe('initiative and enemy tactics',()=>{
 it('Mona closes the distance instead of remaining a passive target at the gate',()=>{
  let s=combat();s.position='cover';s=step(s,{kind:'end-turn'});
  expect(s.monaPosition).toBe('cover');expect(s.history[0]?.enemyTurns?.[0]).toMatchObject({actor:'mona',from:'gate',to:'cover',action:'attack',weapon:'sword'});
  expect(s.history[0]?.checks[0]?.actor).toBe('Mona');expect(s.history[0]?.text).toContain('advances');
  expect(gateActionBlock(s,{kind:'attack',target:'mona',weapon:'bow'})).toContain('Too close');
 });
 it('rolls initiative once and rechecks a planned bow attack after a faster guard approaches',()=>{
  const s=newGateEncounter();s.position='cover';const n=step(s,{kind:'attack',target:'mona',weapon:'bow'},sequence(.89,.09,.49,.99));
  expect(n.initiative?.order).toEqual(['mona','archer','player']);expect(n.monaPosition).toBe('cover');expect(n.arrows).toBe(4);expect(n.actionUsed).toBe(false);expect(n.history[0]?.text).toContain('no longer possible');
  const initiative=n.initiative;let rolls=0;const after=step(n,{kind:'attack',target:'mona',weapon:'sword'},()=>{rolls++;return .5;});
  expect(rolls).toBe(1);expect(after.initiative).toEqual(initiative);expect(after.monaHp).toBe(10);
 });
 it('runs NPCs before and after the player in the same stored cyclic order, once per round',()=>{
  let s=step(newGateEncounter(),{kind:'attack',target:'archer',weapon:'bow'},sequence(.49,.09,.89,.99,.99));
  expect(s.initiative?.order).toEqual(['mona','player','archer']);expect(s.history[0]?.enemyTurns?.map(t=>[t.actor,t.round])).toEqual([['mona',1]]);
  s=step(s,{kind:'end-turn'});expect(s.history[1]?.enemyTurns?.map(t=>[t.actor,t.round])).toEqual([['archer',1],['mona',2]]);
  const turns=s.history.flatMap(h=>h.enemyTurns??[]);expect(new Set(turns.map(t=>`${t.actor}:${t.round}`)).size).toBe(turns.length);
 });
 it('resumes old combat saves with a stable order and does not roll initiative retroactively',()=>{
  const old=JSON.parse(JSON.stringify(combat()));delete old.monaPosition;delete old.archerArrows;
  let s=GateEncounterSchema.parse(old);expect(s.monaPosition).toBe('gate');expect(s.archerArrows).toBe(6);
  s=step(s,{kind:'end-turn'});expect(s.initiative).toBeUndefined();expect(s.history[0]?.enemyTurns?.map(t=>t.actor)).toEqual(['mona','archer']);expect(s.round).toBe(2);
 });
 it('does not teleport through the gate, and unlocking/opening consume the guard’s action',()=>{
  let s=combat();s.position='courtyard';s.archerHp=0;
  s=step(s,{kind:'end-turn'});expect(s.gateLocked).toBe(false);expect(s.gateOpen).toBe(false);expect(s.monaPosition).toBe('gate');expect(s.history.at(-1)?.checks).toHaveLength(0);
  s=step(s,{kind:'end-turn'});expect(s.gateOpen).toBe(true);expect(s.monaPosition).toBe('courtyard');expect(s.history.at(-1)?.checks).toHaveLength(0);
  expect(s.history.at(-1)?.enemyTurns?.[0]?.action).toBe('open');
  s=step(s,{kind:'end-turn'});expect(s.history.at(-1)?.checks[0]?.actor).toBe('Mona');
 });
 it('a barricade blocks the same crossing for player and guard',()=>{
  const s=combat();s.position='courtyard';s.gateOpen=true;s.gateLocked=false;s.wagonTipped=true;
  const n=step(s,{kind:'end-turn'});expect(n.monaPosition).toBe('gate');expect(n.history[0]?.checks.some(c=>c.actor==='Mona')).toBe(false);
  expect(gateActionBlock(n,{kind:'move',to:'gate'})).toContain('wagon');
 });
 it('the archer disengages from melee one step at a time and cannot shoot through the stairs',()=>{
  let s=combat();s.position='wall';s.monaHp=0;
  s=step(s,{kind:'end-turn'});expect(s.archerPosition).toBe('stairs');expect(s.archerDefending).toBe(true);expect(s.history[0]?.checks).toHaveLength(0);
  expect(gateActionBlock(s,{kind:'attack',target:'archer',weapon:'bow'})).toContain('stonework');
 });
 it('the archer finds a real firing angle after disengaging instead of shooting through the stairs',()=>{
  let s=combat();s.position='wall';s.monaHp=0;s=step(s,{kind:'end-turn'});s=step(s,{kind:'end-turn'});
  expect(s.archerPosition).toBe('courtyard');expect(s.history.at(-1)?.checks[0]?.stat).toBe('Archery');expect(s.archerArrows).toBe(5);
 });
 it('does not restart combat or narrate resisting guards after they are out of the fight',()=>{
  const s=newGateEncounter();s.monaHp=0;s.archerHp=0;let rolls=0;
  const n=step(s,{kind:'force'},()=>{rolls++;return .5;});expect(n.phase).toBe('exploration');expect(n.initiative).toBeUndefined();expect(rolls).toBe(1);
  expect(n.history[0]?.text).toContain('does not start another fight');
 });
 it('an archer with no arrows seeks melee without moving twice in one turn',()=>{
  const s=combat();s.position='cover';s.monaHp=0;s.archerArrows=0;
  const n=step(s,{kind:'end-turn'});expect(n.archerPosition).toBe('stairs');expect(n.history[0]?.checks).toHaveLength(0);
  for(const t of n.history[0]?.enemyTurns??[])expect(t.from===t.to||canTraverse(s,t.from,t.to)).toBe(true);
 });
 it('avoids shooting into melee with Mona and consumes ammunition for actual shots only',()=>{
  let s=combat();s.position='cover';s=step(s,{kind:'end-turn'});expect(s.monaPosition).toBe('cover');expect(s.archerArrows).toBe(6);expect(s.history[0]?.text).toContain('avoid hitting Mona');
  s.monaHp=0;s=step(s,{kind:'end-turn'});expect(s.archerArrows).toBe(5);expect(s.history[1]?.checks[0]?.actor).toBe('Archer');
 });
 it('a wounded guard retreats along real connections, defending rather than attacking',()=>{
  let s=combat();s.position='cover';s.monaPosition='cover';s.monaHp=4;s.archerHp=0;s.gateOpen=true;s.gateLocked=false;
  s=step(s,{kind:'end-turn'});expect(s.monaPosition).toBe('gate');expect(s.monaDefending).toBe(true);expect(s.history[0]?.checks).toHaveLength(0);
  s=step(s,{kind:'end-turn'});expect(s.monaPosition).toBe('courtyard');expect(s.monaDisposition).toBe('fled');expect(s.phase).toBe('exploration');
  expect(gateActionBlock(s,{kind:'take-key'})).toContain('left');
 });
 it('a trapped wounded guard surrenders; her key can then be obtained without knocking her out',()=>{
  let s=combat();s.monaHp=4;s.archerHp=0;s=step(s,{kind:'end-turn'});
  expect(s.monaDisposition).toBe('surrendered');expect(s.monaHp).toBe(4);expect(s.phase).toBe('exploration');
  expect(gateActionBlock(s,{kind:'attack',target:'mona',weapon:'sword'})).toBeUndefined();expect(s.monaWeaponReady).toBe(false);
  s=step(s,{kind:'take-key'});expect(s.keyOwner).toBe('player');expect(s.history.at(-1)?.text).toContain('hands over');
 });
 it('bow hit chances account for target cover and defending, including a moving guard',()=>{
  const s=combat();s.position='gate';s.monaPosition='cover';s.monaDefending=true;
  expect(gateActionPreview(s,{kind:'attack',target:'mona',weapon:'bow'}).target).toBe(5);
  expect(localGatePlan('Jag går fram till Mona',s)).toEqual([{kind:'move',to:'cover'}]);
 });
 it('incapacitation before the player acts prevents the pending attack and spends no arrow',()=>{
  const s=newGateEncounter();s.hp=1;const n=step(s,{kind:'attack',target:'archer',weapon:'bow'},sequence(.99,.01,.49,.01));
  expect(n.phase).toBe('defeated');expect(n.arrows).toBe(4);expect(n.archerHp).toBe(10);expect(n.history[0]?.text).toContain('before');
 });
 it('saved initiative and NPC positions survive a reload without rerolling or duplicating enemy actions',()=>{
  let s=step(newGateEncounter(),{kind:'attack',target:'archer',weapon:'bow'},()=>.5);
  const copy=GateEncounterSchema.parse(JSON.parse(JSON.stringify(s)));expect(copy.initiative).toEqual(s.initiative);
  s=step(copy,{kind:'end-turn'});expect(s.initiative).toEqual(copy.initiative);expect(s.round).toBe(2);
  expect(()=>resolveGateAction(s,{id:'t1',expectedRevision:1,action:{kind:'end-turn'}})).toThrow('already');
 });
 it('keeps every NPC within one legal movement edge and one action across combinations of geometry and morale',()=>{
  for(const position of GATE_POSITIONS)for(const gateOpen of [false,true])for(const wagonTipped of [false,true])for(const arrows of [0,6])for(const wounded of [false,true]){
    let s=combat();Object.assign(s,{position,gateOpen,wagonTipped,archerArrows:arrows,monaHp:wounded?4:16,archerHp:wounded?3:10});
    for(let i=0;i<3&&s.phase==='combat';i++){
      s=step(s,{kind:'end-turn'});
      const turns=s.history.at(-1)?.enemyTurns??[];
      expect(new Set(turns.map(t=>`${t.actor}:${t.round}`)).size).toBe(turns.length);
      for(const t of turns)expect(t.from===t.to||canTraverse(s,t.from,t.to)).toBe(true);
      expect(s.archerArrows).toBeGreaterThanOrEqual(0);
    }
  }
 });
});
