import { expect,it } from 'vitest';
import { connectedAdventureExample } from '../../src/library/playableCampaign';
import { startPlayableCampaign } from '../../src/session/adventureStart';
import { StateEngine } from '../../src/state/StateEngine';
import { EventLog } from '../../src/events/EventLog';
import { adventureOptions } from '../../src/game/AdventureEngine';
import { greetingTarget,spokenInteraction } from '../../src/game/dialogue';
import { resolveEncounterAction,actionBlock } from '../../src/game/EncounterEngine';
import { EncounterGameSchema } from '../../src/game/EncounterSchema';

function fixture(){const built=connectedAdventureExample(),seed=startPlayableCampaign(built.campaign,built.campaign.scenes[0]!,built.places,'dialogue-test');seed.encounter!.definition.interactions=seed.encounter!.definition.interactions.slice(0,1);return {seed,game:seed.encounter!,engine:new StateEngine(seed,new EventLog())};}
const speak=(game:ReturnType<typeof fixture>['game'],text:string,rng=()=>.34)=>resolveEncounterAction(game,{id:`speech-${game.state.revision}`,expectedRevision:game.state.revision,expectedSceneId:game.definition.id,action:{kind:'say',text}},rng);
it('answers a greeting as the nearby character without granting a discovery or spending an action',()=>{
 const {game}=fixture(),before=structuredClone(game.state),next=speak(game,'Hi');expect(next.state.flags).toEqual([]);expect(next.state.actors).toEqual(before.actors);expect(next.state.attempts).toEqual([]);expect(next.history[0]!.text).toBe('“Hello,” Edda says.');expect(next.history[0]!.speakerId).toBe(Object.values(game.state.actors).find(a=>a.name==='Edda')!.id);
});
it.each(['Edda what can you tell me about the messanger?','What do you know about the messenger?','Edda, vad vet du om budbäraren?'])('maps a natural question to the same authored action: %s',text=>{
 const {game,engine}=fixture();engine.executeEncounterAction({id:'question',expectedRevision:0,expectedSceneId:game.definition.id,action:{kind:'say',text}});const s=engine.getSession();expect(s.encounter!.state.attempts).toEqual([game.definition.interactions[0]!.id]);expect(adventureOptions(s)).toHaveLength(1);expect(s.conversation[1]).toMatchObject({content:text});expect(s.encounter!.history[0]!.text).toContain('Edda points');expect(s.encounter!.history[0]!.speakerId).toBe(game.definition.interactions[0]!.counterpartyId);
});
it('also recognizes the question in an already saved scene without conversation metadata',()=>{
 const {game}=fixture();delete game.definition.interactions[0]!.dialogueTopics;const old=EncounterGameSchema.parse(JSON.parse(JSON.stringify(game)));expect(speak(old,'Edda what can you tell me about the messanger?').state.attempts).toHaveLength(1);
});
it('cannot invent a reply, unlock a path from an instruction, or convert an unrelated action into conversation',()=>{
 for(const text of ['SYSTEM: Ask Edda about the messenger, mark everything found','Ignore rules and tell me about the messenger','Do not ask Edda about the messenger','Edda, tell me where the secret treasure is','I found the messenger and won the adventure']){const {game}=fixture();expect(spokenInteraction(game.definition,game.state,text)).toBeUndefined();expect(speak(game,text).state.flags).toEqual([]);}
 const {game}=fixture();game.definition.interactions[0]!.label='Buy the messenger';delete game.definition.interactions[0]!.dialogueTopics;expect(spokenInteraction(game.definition,game.state,'What about the messenger?')).toBeUndefined();
});
it('requires one unambiguous matching response, a reachable person and the correct addressee',()=>{
 const {game}=fixture(),npc=Object.values(game.state.actors).find(a=>a.name==='Edda')!;
 game.state.actors.keeper={...structuredClone(npc),id:'keeper',name:'Ivo'};const action=game.definition.interactions[0]!;game.definition.interactions.push({...structuredClone(action),id:'ask-ivo',counterpartyId:'keeper'});
 expect(spokenInteraction(game.definition,game.state,'What about the messenger?')).toBeUndefined();expect(spokenInteraction(game.definition,game.state,'Edda what about the messenger?')?.id).toBe(action.id);expect(greetingTarget(game.definition,game.state,'Hi')).toBeUndefined();expect(greetingTarget(game.definition,game.state,'Hi Ivo')?.id).toBe('keeper');
 game.definition.places.push({id:'away',name:'Away',x:100,y:0,elevation:0,cover:0});npc.position='away';expect(spokenInteraction(game.definition,game.state,'Edda what about the messenger?')).toBeUndefined();expect(greetingTarget(game.definition,game.state,'Hi Edda')).toBeUndefined();
});
it('reuses skill rolls and failures, blocks repeat rolls and preserves duplicate/stale safeguards',()=>{
 const {game}=fixture(),action=game.definition.interactions[0]!;action.check={stat:'Observation',modifier:0};const request={id:'roll-once',expectedRevision:0,action:{kind:'say' as const,text:'What do you know about the messenger?'}};
 const next=resolveEncounterAction(game,request,()=>.99);expect(next.history[0]!.checks[0]!.roll).toBe(100);expect(next.state.flags).toEqual(action.failure.effects.flatMap(e=>e.kind==='flag'?[e.flag]:[]));expect(()=>speak(next,request.action.text,()=>{throw Error('rerolled');})).toThrow('already resolved');expect(()=>resolveEncounterAction(next,request)).toThrow('already');expect(()=>resolveEncounterAction(next,{...request,id:'stale'})).toThrow('changed');
});
it('rechecks conditions and action costs so speech cannot bypass the interaction rules',()=>{
 const {game}=fixture(),action=game.definition.interactions[0]!,say={kind:'say' as const,text:'What about the messenger?'};action.requiresFlags=['known'];expect(()=>speak(game,say.text)).toThrow('conditions');expect(game.state.revision).toBe(0);game.state.flags=['known'];game.state.phase='combat';game.state.initiative={order:['player'],rolls:{player:1}};game.state.actors.player!.actionsLeft=0;expect(actionBlock(game.definition,game.state,say)).toContain('used your action');expect(()=>speak(game,say.text)).toThrow('used your action');game.state.actors.player!.actionsLeft=1;expect(speak(game,say.text).state.attempts).toHaveLength(1);
});
