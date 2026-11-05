import { expect,it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { connectedAdventureExample } from '../../src/library/playableCampaign';
import { startPlayableCampaign } from '../../src/session/adventureStart';
import { StateEngine } from '../../src/state/StateEngine';
import { EventLog } from '../../src/events/EventLog';
import { adventureCompleted,adventureOptions } from '../../src/game/AdventureEngine';
import { IndexedDBRepository } from '../../src/persistence/IndexedDBRepository';
import { parseCampaignTemplate } from '../../src/library/LibrarySchema';
import { upgradeMissingMessengerCampaign,upgradeMissingMessengerSession } from '../../src/scenarios/missingMessenger';
import type { Session } from '../../src/state/StateSchema';

function fixture(){const built=connectedAdventureExample(),seed=startPlayableCampaign(built.campaign,built.campaign.scenes[0]!,built.places,'messenger-ending');return {built,engine:new StateEngine(seed,new EventLog())};}
function act(engine:StateEngine,index:number){const s=engine.getSession();engine.executeEncounterAction({id:`action-${s.stateVersion}`,expectedSceneId:s.sceneId!,expectedRevision:s.encounter!.state.revision,action:{kind:'interaction',interactionId:s.encounter!.definition.interactions[index]!.id}});}
function travel(engine:StateEngine){const s=engine.getSession();engine.transitionAdventure({id:`travel-${s.stateVersion}`,linkId:adventureOptions(s)[0]!.id,expectedStateVersion:s.stateVersion});}
function returnWithNews(engine:StateEngine){act(engine,0);travel(engine);act(engine,0);travel(engine);}
function report(engine:StateEngine,text='Edda, I found the note. The messenger will return at dawn.'){
 const s=engine.getSession();engine.executeEncounterAction({id:`report-${s.stateVersion}`,expectedSceneId:s.sceneId!,expectedRevision:s.encounter!.state.revision,action:{kind:'say',text}});
}
function legacy(original:Session){
 const s=structuredClone(original),run=s.adventure!;delete run.exampleId;delete run.exampleVersion;delete run.goal;
 for(const game of [...run.scenes.map(scene=>scene.game),...Object.values(run.savedScenes),s.encounter!]){game.definition.interactions=game.definition.interactions.filter(action=>!action.id.startsWith('report:'));for(const action of game.definition.interactions)action.excludesFlags=[];}
 return s;
}
it('requires the actual note discovery before reporting; speech cannot forge completion',()=>{
 const {engine}=fixture(),before=engine.getSession();expect(()=>act(engine,1)).toThrow('conditions');expect(()=>report(engine)).toThrow('conditions');expect(adventureCompleted(engine.getSession())).toBe(false);expect(engine.getSession()).toEqual(before);
});
it('completes the quest only after returning with the news and saves that completion',async()=>{
 const {engine,built}=fixture();returnWithNews(engine);expect(adventureCompleted(engine.getSession())).toBe(false);report(engine);const s=engine.getSession();expect(adventureCompleted(s)).toBe(true);expect(s.encounter!.history.at(-1)!.text).toContain('Thank you for finding out');expect(s.encounter!.history.at(-1)!.speakerId).toBe(built.campaign.scenes[0]!.encounter!.definition.interactions[0]!.counterpartyId);expect(s.encounter!.state.actors.player!.inventory).toContain(built.objects[0]!.id);expect(()=>act(engine,1)).toThrow('already resolved');const repo=new IndexedDBRepository(new IDBFactory(),'completed-adventure');await repo.saveSession(s);expect(adventureCompleted(await repo.loadSession(s.id))).toBe(true);
});
it('adds the ending to an old saved return visit without resetting health, inventory, history or discoveries',async()=>{
 const {engine}=fixture();returnWithNews(engine);const old=legacy(engine.getSession()),before=structuredClone(old);old.encounter!.state.actors.player!.hp=11;const repo=new IndexedDBRepository(new IDBFactory(),'legacy-adventure-ending');await repo.saveSession(old);const restored=new StateEngine(await repo.loadSession(old.id),new EventLog()),upgraded=restored.getSession();expect(upgraded.stateVersion).toBe(before.stateVersion);expect(upgraded.conversation).toEqual(before.conversation);expect(upgraded.storyFlags).toEqual(before.storyFlags);expect(upgraded.encounter!.state.attempts).toEqual(before.encounter!.state.attempts);expect(upgraded.encounter!.state.actors.player!.hp).toBe(11);expect(upgraded.encounter!.state.actors.player!.inventory).toEqual(before.encounter!.state.actors.player!.inventory);expect(upgraded.adventure!.exampleVersion).toBe(2);expect(upgraded.encounter!.definition.interactions).toHaveLength(2);expect(upgradeMissingMessengerSession(upgraded)).toBe(upgraded);report(restored);expect(adventureCompleted(restored.getSession())).toBe(true);expect(old.adventure!.goal).toBeUndefined();
});
it('upgrades the old library example once and leaves unrelated or deliberately edited new adventures alone',()=>{
 const built=connectedAdventureExample(),old=structuredClone(built.campaign);delete old.goal;delete old.exampleId;delete old.exampleVersion;old.scenes[0]!.encounter!.definition.interactions.pop();old.scenes[0]!.encounter!.definition.interactions[0]!.excludesFlags=[];
 const upgraded=parseCampaignTemplate(old);expect(upgraded.goal).toBeDefined();expect(upgraded.scenes[0]!.encounter!.definition.interactions).toHaveLength(2);expect(old.scenes[0]!.encounter!.definition.interactions).toHaveLength(1);delete upgraded.goal;expect(upgradeMissingMessengerCampaign(upgraded)).toBe(upgraded);expect(upgraded.goal).toBeUndefined();old.scenes[0]!.encounter!.definition.title='My own story';expect(upgradeMissingMessengerCampaign(old)).toBe(old);
});
it('evaluates generic completion from every required discovery, independently of names and scene visits',()=>{
 const {engine}=fixture(),s:Session=structuredClone(engine.getSession());s.adventure!.goal={title:'Deliver the cargo',requiresFlags:['payment','delivery']};s.storyFlags=['payment'];expect(adventureCompleted(s)).toBe(false);s.encounter!.state.flags=['delivery'];expect(adventureCompleted(s)).toBe(true);delete s.adventure!.goal;expect(adventureCompleted(s)).toBe(false);
});
