import { expect,it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { playerInventory,inventoryActions } from '../../src/session/playerInventory';
import { innVisitExample } from '../../src/scenarios/innVisit';
import { startPlayableCampaign } from '../../src/session/adventureStart';
import { StateEngine } from '../../src/state/StateEngine';
import { EventLog } from '../../src/events/EventLog';
import { adventureOptions } from '../../src/game/AdventureEngine';
import { IndexedDBRepository } from '../../src/persistence/IndexedDBRepository';
import { loadingBayScenario } from '../../src/ui/home/encounterScenario';
import { parseSession } from '../../src/state/StateSchema';
function inn(){const built=innVisitExample(),engine=new StateEngine(startPlayableCampaign(built.campaign,built.campaign.scenes[0]!,built.places,'inventory-inn',[built.realm]),new EventLog());const s=engine.getSession();engine.transitionAdventure({id:'enter',linkId:adventureOptions(s)[0]!.id,expectedStateVersion:s.stateVersion});return {built,engine};}
function take(engine:StateEngine){const s=engine.getSession();engine.executeEncounterAction({id:'key',expectedRevision:s.encounter!.state.revision,expectedSceneId:s.sceneId!,action:{kind:'interaction',interactionId:'take-key'}});}
it('shows only owned objects, including details, without copying floor items or changing ownership',()=>{
 const {built,engine}=inn(),before=structuredClone(engine.getSession());expect(playerInventory(engine.getSession())).toEqual([]);expect(engine.getSession()).toEqual(before);take(engine);
 const inventory=playerInventory(engine.getSession());expect(inventory).toHaveLength(1);expect(inventory[0]).toMatchObject({id:built.keyId,name:'Brass key',description:expect.stringContaining('store room door')});expect(inventory.some(i=>i.id===built.ledgerId)).toBe(false);
 expect(inventoryActions(engine.getSession(),inventory[0]!)).toMatchObject([{label:'Unlock · Store room door',blocked:undefined}]);
 expect(inventoryActions(before,inventory[0]!)).toEqual([]);
});
it('persists item descriptions and authorised use across save/load and keeps a single owner',async()=>{
 const {built,engine}=inn();take(engine);const repo=new IndexedDBRepository(new IDBFactory(),'inventory-save');await repo.saveSession(engine.getSession());const loaded=await repo.loadSession('inventory-inn');const inventory=playerInventory(loaded);expect(inventory[0]!.description).toContain('“Store”');expect(loaded.encounter!.state.itemLocations[built.keyId]).toBeUndefined();
 const restored=new StateEngine(loaded,new EventLog()),choice=inventoryActions(loaded,inventory[0]!)[0]!;restored.executeEncounterAction({id:'unlock',expectedRevision:loaded.encounter!.state.revision,expectedSceneId:loaded.sceneId!,action:choice.action});expect(restored.getSession().encounter!.state.barriers[built.storeDoorId]!.locked).toBe(false);expect(playerInventory(restored.getSession()).filter(i=>i.id===built.keyId)).toHaveLength(1);expect(inventoryActions(restored.getSession(),inventory[0]!)).toEqual([]);
});
it('keeps zero ammunition visible and updates money and bought possessions from real game state',()=>{
 const session=loadingBayScenario('inventory-depot'),actor=session.encounter!.state.actors.courier!;actor.ammunition.pistol=0;const before=playerInventory(session);expect(before.some(i=>i.kind==='ammunition'&&i.quantity===0)).toBe(true);expect(before.find(i=>i.kind==='resource'&&i.id==='credits')!.quantity).toBe(30);
 const engine=new StateEngine(session,new EventLog()),interaction=session.encounter!.definition.interactions.find(i=>i.label==='Buy medical kit · 10 credits')!;expect(interaction).toBeDefined();engine.executeEncounterAction({id:'buy',expectedRevision:0,action:{kind:'interaction',interactionId:interaction.id}});const after=playerInventory(engine.getSession());expect(after.find(i=>i.id==='credits')!.quantity).toBe(20);expect(after.some(i=>i.name==='Sealed medical kit')).toBe(true);
});
it('does not expose other people’s possessions, hidden container contents or circular nesting in normal rules games',()=>{
 const template=loadingBayScenario('inventory-objects');delete template.encounter;template.objects=[
  {id:'bag',name:'Satchel',note:'Your bag',tags:[],startingLocation:{kind:'player'},openable:true,isOpen:false},
  {id:'note',name:'Hidden letter',note:'Private',tags:[],startingLocation:{kind:'object',objectId:'bag'},readableContent:'A secret'},
  {id:'npc-key',name:'Guard key',note:'',tags:[],startingLocation:{kind:'character',characterId:'guard'}},
  {id:'loop',name:'Invalid loop',note:'',tags:[],startingLocation:{kind:'object',objectId:'loop'}}
 ];expect(playerInventory(template).map(i=>i.name)).toEqual(['Satchel']);template.objects[0]!.isOpen=true;expect(playerInventory(parseSession(template)).map(i=>i.name)).toEqual(['Satchel','Hidden letter']);
});
it('retains richer carried-item metadata when the next scene declares only its name',()=>{
 const built=innVisitExample(),first=built.campaign.scenes[1]!.encounter!,key=first.definition.items[0]!;key.description='A marked key.';for(const scene of built.campaign.scenes.filter(s=>s.encounter!==first))scene.encounter!.definition.items=scene.encounter!.definition.items.map(i=>({id:i.id,name:i.name}));
 const session=startPlayableCampaign(built.campaign,built.campaign.scenes[1]!,built.places,'merged-items',[built.realm]);expect(session.encounter!.definition.items.find(i=>i.id===key.id)!.description).toBe('A marked key.');
});
