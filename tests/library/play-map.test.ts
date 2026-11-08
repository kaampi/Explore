import { expect,it } from 'vitest';
import { playMapModel } from '../../src/library/playMap';
import { playMapFixture } from '../fixtures/play-map';
import { StateEngine } from '../../src/state/StateEngine';
import { EventLog } from '../../src/events/EventLog';
import { landmarkTravelPatch } from '../../src/session/landmarkTravel';
import { parseSession } from '../../src/state/StateSchema';
import { connectedAdventureExample } from '../../src/library/playableCampaign';
import { chooseAdventureMap } from '../../src/library/adventureMap';
import { startPlayableCampaign } from '../../src/session/adventureStart';

it('shows the containing village from a house or room without exposing private interiors or undiscovered places',()=>{
 const f=playMapFixture(),before=JSON.stringify(f.world);f.session.scene!.placeId=f.room.placeId;f.session.scene!.location=f.room.name;
 const model=playMapModel(f.session,[f.world])!;expect(model.level).toBe('town');expect(model.name).toBe('Riverside');expect(model.current.id).toBe('room');expect(model.anchor?.id).toBe('home');expect(model.nodes.map(n=>n.id)).toEqual(['home','hall']);expect(model.routes.map(r=>r.id)).toEqual(['street']);expect(model.map.nodes.some(n=>n.id==='secret'||n.id==='well')).toBe(false);expect(JSON.stringify(f.world)).toBe(before);
 f.session.scene!.placeId=f.town.placeId;expect(playMapModel(f.session,[f.world])!.anchor).toBeNull();expect(playMapModel({...f.session,scene:{...f.session.scene!,placeId:'unmapped'}},[f.world])).toBeNull();
});

it('remembers legitimate arrival discoveries after leaving and save/load without revealing other hidden places',()=>{
 const f=playMapFixture(),engine=new StateEngine(f.session,new EventLog());engine.travelToLandmark(landmarkTravelPatch(f.places.find(p=>p.id===f.well.placeId)!));engine.travelToLandmark(landmarkTravelPatch(f.places[0]!));
 const saved=parseSession(JSON.parse(JSON.stringify(engine.getSession()))),model=playMapModel(saved,[f.world])!;expect(saved.visitedMapPlaceIds).toContain(f.well.placeId);expect(model.nodes.some(n=>n.id==='well')).toBe(true);expect(model.nodes.some(n=>n.id==='secret')).toBe(false);expect(model.routes.some(r=>r.id==='secret-road')).toBe(false);
});

it('uses an adventure’s pinned map instead of later library changes',()=>{
 const built=connectedAdventureExample(),f=playMapFixture();const [a,b]=built.places;f.world.worldMap!.nodes.push({...f.home,id:'a',placeId:a!.id,name:a!.name,intro:a!.note||'You arrive at the square.'},{...f.hall,id:'b',placeId:b!.id,name:b!.name,intro:b!.note||'You arrive at the tower.'});
 const campaign=chooseAdventureMap(built.campaign,f.world,built.places),session=startPlayableCampaign(campaign,campaign.scenes[0]!,built.places,'pinned',[f.world]);f.world.worldMap!.nodes.find(n=>n.id==='town')!.name='Changed after play started';
 const model=playMapModel(session,[f.world])!;expect(model.pinned).toBe(true);expect(model.name).toBe('Riverside');expect(model.current.placeId).toBe(a!.id);
});
