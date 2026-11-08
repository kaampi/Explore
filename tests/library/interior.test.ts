import { expect,it } from 'vitest';
import { ensureInterior,interiorRooms,interiorEdges,splitInteriorRoom,addInteriorOpening,updateInteriorOpening,extendInterior,placeInteriorFurniture,inheritedMapImage,moveInteriorVertex,removeInteriorWall,duplicateInteriorBuilding,interiorPlaceBrief } from '../../src/library/interior';
import { settlementPiece } from '../../src/library/settlement';
import { WorldMapSchema,mapContext,type WorldMap } from '../../src/library/worldMap';
import { adventureMapPlaces } from '../../src/library/adventureMap';
import { newRealmTemplate } from '../../src/library/LibrarySchema';
import { quickCharacterSession } from '../../src/ui/home/quickStart';
import { exampleCharacterTemplate } from '../../src/library/exampleTemplates';
import { resolveMapMovement } from '../../src/session/mapMovement';
import { applyLandmarkTravel } from '../../src/state/landmarkTravel';
import { landmarkTravelPatch } from '../../src/session/landmarkTravel';
import { sceneBackdrop } from '../../src/state/sceneBackdrop';

function fixture(symbol:'cottage'|'longhouse'|'townhouse'|'inn'='cottage'){const building={...settlementPiece(symbol,'',50,50),id:'house',placeId:'house-place'};return {building,map:{nodes:[building],routes:[]} as WorldMap};}
it('creates standard rooms once with stable place IDs, real door routes and safe locked entrances',()=>{
 for(const symbol of ['cottage','longhouse','townhouse','inn'] as const){const f=fixture(symbol);f.building.entrance='locked';const map=ensureInterior(f.map,'house'),rooms=interiorRooms(map,'house');expect(rooms).toHaveLength(symbol==='inn'?4:3);expect(WorldMapSchema.safeParse(map).success).toBe(true);expect(ensureInterior(map,'house')).toBe(map);expect(rooms.every(r=>r.placeId===r.id)).toBe(true);expect(map.routes.filter(r=>r.from==='house'||r.to==='house').every(r=>r.access==='locked')).toBe(true);expect(f.map.nodes).toHaveLength(1);}
});
it('splits a room, preserves existing identity and facts, and keeps its furniture in the correct room',()=>{
 const map=ensureInterior(fixture().map,'house'),room=interiorRooms(map,'house').find(r=>r.name==='Living room & kitchen')!;room.description='A remembered fireplace';const withTable=placeInteriorFurniture(map,'house',{x:20,y:20},'table');
 const next=splitInteriorRoom(withTable,'house',{x:10,y:45},{x:60,y:45});expect(interiorRooms(next,'house')).toHaveLength(4);expect(next.nodes.find(n=>n.id===room.id)?.description).toBe('A remembered fireplace');expect(WorldMapSchema.safeParse(next).success).toBe(true);expect(next.nodes.find(n=>n.kind==='Furniture')?.parentId).toBe(next.nodes.find(n=>n.roomPolygon?.some(p=>p.x===10&&p.y===10))?.id);
 expect(()=>splitInteriorRoom(map,'house',{x:15,y:15},{x:25,y:25})).toThrow('boundary');
});
it('adds windows only on exterior walls and changes door access without changing route identity',()=>{
 let map=ensureInterior(fixture().map,'house');const opening=map.nodes[0]!.interior!.openings.find(o=>map.routes.find(r=>r.id===o.routeId&&r.to!=='house'))!;
 map=updateInteriorOpening(map,'house',opening.id,'locked');expect(map.routes.find(r=>r.id===opening.routeId)?.access).toBe('locked');
 expect(()=>addInteriorOpening(map,'house',{x:60,y:35},'window')).toThrow('outside wall');map=addInteriorOpening(map,'house',{x:25,y:10},'window');expect(map.nodes[0]!.interior!.openings.some(o=>o.kind==='window')).toBe(true);expect(WorldMapSchema.safeParse(map).success).toBe(true);
});
it('extends a house without replacing authored rooms and rejects overlap with neighbours or streets',()=>{
 const map=ensureInterior(fixture().map,'house'),ids=interiorRooms(map,'house').map(r=>r.id),next=extendInterior(map,'house','right');expect(next.nodes[0]!.width).toBeGreaterThan(map.nodes[0]!.width!);expect(ids.every(id=>next.nodes.some(n=>n.id===id))).toBe(true);expect(interiorRooms(next,'house')).toHaveLength(4);expect(WorldMapSchema.safeParse(next).success).toBe(true);
 const neighbour={...settlementPiece('cottage','',56,50),id:'neighbour',placeId:'neighbour'};expect(()=>extendInterior({...map,nodes:[...map.nodes,neighbour]},'house','right')).toThrow('overlap');
});
it('inherits a room picture from its house and prefers an explicit room picture',()=>{
 const map=ensureInterior(fixture().map,'house'),room=interiorRooms(map,'house')[0]!;map.nodes[0]!.imageDataUrl='data:image/png;base64,HOUSE';expect(inheritedMapImage(map,room.id)).toContain('HOUSE');room.imageDataUrl='data:image/png;base64,ROOM';expect(inheritedMapImage(map,room.id)).toContain('ROOM');room.imageDataUrl='';expect(inheritedMapImage(map,room.id)).toContain('HOUSE');
});
it('moves wall junctions without losing room IDs and protects authored rooms when removing partitions',()=>{
 const map=ensureInterior(fixture().map,'house'),ids=interiorRooms(map,'house').map(r=>r.id),moved=moveInteriorVertex(map,'house',{x:60,y:10},{x:55,y:15});expect(interiorRooms(moved,'house').map(r=>r.id)).toEqual(ids);expect(WorldMapSchema.safeParse(moved).success).toBe(true);
 const edge=interiorEdges(interiorRooms(map,'house')).find(e=>e.rooms.length===2)!,p={x:(edge.a.x+edge.b.x)/2,y:(edge.a.y+edge.b.y)/2};expect(()=>removeInteriorWall(map,'house',p,ids)).toThrow('adventure');const merged=removeInteriorWall(map,'house',p);expect(interiorRooms(merged,'house')).toHaveLength(2);expect(WorldMapSchema.safeParse(merged).success).toBe(true);expect(merged.routes.every(r=>merged.nodes.some(n=>n.id===r.from)&&merged.nodes.some(n=>n.id===r.to))).toBe(true);
});
it('duplicates complete interiors with independent place and door identities and keeps room details out of global context',()=>{
 const map=ensureInterior(fixture().map,'house'),room=interiorRooms(map,'house')[0]!;room.description='PRIVATE ROOM FACT';expect(mapContext(map)).not.toContain('PRIVATE ROOM FACT');expect(interiorPlaceBrief(map,room.id)).toContain('PRIVATE ROOM FACT');
 const next=duplicateInteriorBuilding(map,'house');expect(WorldMapSchema.safeParse(next).success).toBe(true);const copy=next.nodes[map.nodes.length]!;expect(copy.id).not.toBe('house');expect(interiorRooms(next,copy.id)).toHaveLength(3);const oldPlaces=new Set(map.nodes.map(n=>n.placeId));expect(next.nodes.slice(map.nodes.length).filter(n=>n.placeId).every(n=>!oldPlaces.has(n.placeId))).toBe(true);expect(next.routes.slice(map.routes.length).every(r=>!map.routes.some(old=>old.id===r.id))).toBe(true);
});
it('enters the actual entrance room, inherits its backdrop and obeys locked doors during play',()=>{
 const map=ensureInterior(fixture().map,'house');map.nodes[0]!.imageDataUrl='data:image/jpeg;base64,HOUSE';const world=newRealmTemplate({name:'Interior world',note:'',source:'player',worldMap:map}),places=adventureMapPlaces(world,[]).map(e=>e.place),house=places.find(p=>p.id==='house-place')!,session=quickCharacterSession(exampleCharacterTemplate(),'interior-play',{place:house,realm:world});session.scene!.location='Outside '+house.name;
 const entered=resolveMapMovement('I enter '+house.name,session,[world],places);expect(entered.place?.id).not.toBe(house.id);expect(map.nodes.some(n=>n.roomPolygon&&n.placeId===entered.place?.id)).toBe(true);applyLandmarkTravel(session,landmarkTravelPatch(entered.place!));expect(sceneBackdrop(session).imageDataUrl).toContain('HOUSE');
 const current=map.nodes.find(n=>n.placeId===entered.place!.id)!,route=world.worldMap!.routes.find(r=>r.from===current.id&&r.to!=='house'||r.to===current.id&&r.from!=='house')!,target=map.nodes.find(n=>n.id===(route.from===current.id?route.to:route.from))!;route.access='locked';expect(()=>resolveMapMovement('I go to '+target.name,session,[world],places,target.placeId)).toThrow('locked');route.access='open';expect(resolveMapMovement('I go to '+target.name,session,[world],places,target.placeId).place?.id).toBe(target.placeId);
});
it('resolves repeated room names inside the current house and does not bypass a pre-existing locked exterior door',()=>{
 let map=ensureInterior(fixture().map,'house');map=duplicateInteriorBuilding(map,'house');const square={...settlementPiece('square','',10,10),id:'square',placeId:'square-place'};map.nodes.push(square);map.routes.push({id:'old-entrance',from:'square',to:'house',mode:'Door',duration:'A few steps',access:'locked',bothWays:true});
 const world=newRealmTemplate({name:'Two houses',note:'',source:'player',worldMap:map}),places=adventureMapPlaces(world,[]).map(e=>e.place),house=places.find(p=>p.id==='house-place')!,session=quickCharacterSession(exampleCharacterTemplate(),'two-houses',{place:house,realm:world});session.scene!.location='Outside '+house.name;session.player!.position.lock='unlocked';expect(()=>resolveMapMovement('I enter '+house.name,session,[world],places,house.id)).toThrow('locked');
 const room=interiorRooms(world.worldMap!,'house').find(n=>n.name==='Living room & kitchen')!,bedroom=interiorRooms(world.worldMap!,'house').find(n=>n.name==='Bedroom')!;session.scene!.placeId=room.placeId!;session.scene!.location=room.name;expect(resolveMapMovement('I go to Bedroom',session,[world],places).place?.id).toBe(bedroom.placeId);
});
