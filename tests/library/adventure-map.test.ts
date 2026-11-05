import { expect,it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { connectedAdventureExample } from '../../src/library/playableCampaign';
import { newPlaceTemplate,parseCampaignTemplate } from '../../src/library/LibrarySchema';
import { adventureMapPlaces,bindSceneMapPlace,chooseAdventureMap } from '../../src/library/adventureMap';
import { startPlayableCampaign } from '../../src/session/adventureStart';
import { StateEngine } from '../../src/state/StateEngine';
import { EventLog } from '../../src/events/EventLog';
import { adventureOptions,validateAdventure } from '../../src/game/AdventureEngine';
import { IndexedDBRepository } from '../../src/persistence/IndexedDBRepository';

export function mappedFixture(){
 const built=connectedAdventureExample(),[square,tower]=built.places;
 built.realm.worldMap={distanceScale:{value:2,unit:'km',kmPerUnit:1},mapType:'world',nodes:[
  {id:'square-node',placeId:square!.id,name:square!.name,kind:'Square',x:20,y:30,intro:square!.note,description:'Village square.',population:'',characterIds:[]},
  {id:'tower-node',placeId:tower!.id,name:tower!.name,kind:'Building',x:60,y:20,intro:tower!.note,description:'Old tower.',population:'',characterIds:[]},
  {id:'forest-node',placeId:'forest-place',name:'Pine forest',kind:'Forest',x:75,y:60,description:'Pines.',population:'',characterIds:[]},
  {id:'cabin-node',placeId:'cabin-place',parentId:'forest-node',name:'Hunter’s cabin',kind:'Cottage',x:35,y:45,intro:'Smoke rises from the hunter’s chimney.',description:'A small timber cabin.',population:'',characterIds:[]},
  {id:'junction',name:'Crossroads',isJunction:true,kind:'Junction',x:40,y:25,description:'',population:'',characterIds:[]}
 ],routes:[{id:'road',from:'square-node',to:'tower-node',type:'road',mode:'Walk',duration:'2 hours',access:'open',bothWays:true}]};
 return {...built,campaign:chooseAdventureMap(built.campaign,built.realm,built.places)};
}
it('projects actual map entities, including nested places, without introducing library copies or junction choices',()=>{
 const built=mappedFixture(),unmapped=newPlaceTemplate({id:'unmapped',realmId:built.realm.id,name:'Unmapped library place'}),before=JSON.stringify(built.realm);
 const entries=adventureMapPlaces(built.realm,[...built.places,unmapped]);expect(entries).toHaveLength(4);expect(entries.map(e=>e.place.id)).not.toContain('unmapped');expect(entries.map(e=>e.node.id)).not.toContain('junction');expect(entries.find(e=>e.node.id==='cabin-node')).toMatchObject({path:'Pine forest / Hunter’s cabin',place:{id:'cabin-place',name:'Hunter’s cabin',note:'Smoke rises from the hunter’s chimney.'}});expect(JSON.stringify(built.realm)).toBe(before);
});
it('keeps actions and equipment when binding a new place; changed map names never replace authored scene names',()=>{
 const built=mappedFixture(),scene=built.campaign.scenes[0]!,before=structuredClone(scene.encounter!),cabin=adventureMapPlaces(built.realm,built.places).find(e=>e.node.id==='cabin-node')!;
 const next=bindSceneMapPlace(scene,cabin);expect(next.name).toBe(scene.name);expect(next.mapNodeId).toBe('cabin-node');expect(next.placeId).toBe('cabin-place');expect(next.encounter!.definition.interactions).toEqual(before.definition.interactions);expect(next.encounter!.state.actors).toEqual(before.state.actors);expect(next.encounter!.definition.description).toBe(cabin.place.note);expect(next.encounter!.definition.places[0]!.name).toBe('Hunter’s cabin');
});
it('pins the canonical map at start and updates geographic position when entering the next scene',()=>{
 const built=mappedFixture(),seed=startPlayableCampaign(built.campaign,built.campaign.scenes[0]!,built.places,'mapped-run',[built.realm]),engine=new StateEngine(seed,new EventLog()),s=engine.getSession();expect(s.adventure!.geography!.map.routes[0]!.duration).toBe('2 hours');expect(s.adventure!.scenes[0]!.mapNodeId).toBe('square-node');expect(s.player!.locationRef!.placeId).toBe(built.places[0]!.id);
 engine.executeEncounterAction({id:'ask',expectedSceneId:s.sceneId!,expectedRevision:0,action:{kind:'interaction',interactionId:s.encounter!.definition.interactions[0]!.id}});const ready=engine.getSession();engine.transitionAdventure({id:'travel',linkId:adventureOptions(ready)[0]!.id,expectedStateVersion:ready.stateVersion});expect(engine.getSession().player!.locationRef!.placeId).toBe(built.places[1]!.id);expect(engine.getSession().scene!.location).toBe(built.places[1]!.name);
 built.realm.worldMap!.nodes[1]!.name='Renamed watchtower';built.realm.worldMap!.routes[0]!.duration='8 hours';expect(engine.getSession().adventure!.geography!.map.nodes[1]!.name).not.toBe('Renamed watchtower');const fresh=startPlayableCampaign(built.campaign,built.campaign.scenes[1]!,built.places,'fresh',[built.realm]);expect(fresh.scene!.location).toBe('Renamed watchtower');expect(fresh.encounter!.definition.places[0]!.name).toBe('Renamed watchtower');
});
it('refreshes a map introduction while preserving scene-specific arrival text',()=>{
 const built=mappedFixture();built.realm.worldMap!.nodes[0]!.intro='A market has opened at the well.';const make=()=>startPlayableCampaign(built.campaign,built.campaign.scenes[0]!,built.places,'intro',[built.realm]);expect(make().encounter!.definition.description).toBe('A market has opened at the well.');built.campaign.scenes[0]!.usePlaceIntro=false;built.campaign.scenes[0]!.encounter!.definition.description='A scene-specific night watch.';expect(make().encounter!.definition.description).toBe('A scene-specific night watch.');
});
it('rejects removed and cross-world map references rather than falling back to stale library places',()=>{
 const built=mappedFixture();built.realm.worldMap!.nodes=built.realm.worldMap!.nodes.filter(n=>n.id!=='tower-node');built.realm.worldMap!.routes=[];expect(()=>startPlayableCampaign(built.campaign,built.campaign.scenes[0]!,built.places,'removed',[built.realm])).toThrow('existing map place');expect(()=>startPlayableCampaign(built.campaign,built.campaign.scenes[0]!,built.places,'missing',[])).toThrow('world map is unavailable');
 const other={...built.realm,id:'other-world',worldMap:{nodes:[],routes:[]}},changed=chooseAdventureMap(built.campaign,other,built.places);expect(changed.scenes.every(s=>!s.placeId&&!s.mapNodeId)).toBe(true);expect(changed.scenes[0]!.encounter!.definition.interactions).toEqual(built.campaign.scenes[0]!.encounter!.definition.interactions);
});
it('persists map and node identity with the pinned geography, and validates against forged scene bindings',async()=>{
 const built=mappedFixture(),repo=new IndexedDBRepository(new IDBFactory(),'mapped-adventure');await repo.saveCampaign(built.campaign);await repo.saveRealm(built.realm);const campaign=await repo.loadCampaign(built.campaign.id);expect(parseCampaignTemplate(JSON.parse(JSON.stringify(campaign))).mapWorldId).toBe(built.realm.id);const seed=startPlayableCampaign(campaign,campaign.scenes[0]!,built.places,'map-persist',[built.realm]);await repo.saveSession(seed);const loaded=await repo.loadSession(seed.id);expect(loaded.adventure!.geography!.worldId).toBe(built.realm.id);expect(loaded.adventure!.scenes[1]!.mapNodeId).toBe('tower-node');loaded.adventure!.scenes[0]!.mapNodeId='cabin-node';expect(()=>validateAdventure(loaded.adventure!)).toThrow('pinned map place');
});
