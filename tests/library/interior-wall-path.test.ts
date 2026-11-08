import { expect,it } from 'vitest';
import { ensureInterior,interiorRooms,splitInteriorRoomPath,placeInteriorFurniture,polygonContains } from '../../src/library/interior';
import { roomAreaMeters } from '../../src/library/interiorScale';
import { settlementPiece } from '../../src/library/settlement';
import { WorldMapSchema } from '../../src/library/worldMap';

const fixture=()=>ensureInterior({nodes:[{...settlementPiece('cottage','',50,50),id:'house',placeId:'house-place'}],routes:[]},'house');
it('creates an L-shaped partition, preserves the old room identity and saves the shared corner in both outlines',()=>{
 const map=fixture(),original=interiorRooms(map,'house').find(r=>r.name==='Living room & kitchen')!;original.description='An authored fireplace';original.imageDataUrl='data:image/png;base64,ROOM';const next=splitInteriorRoomPath(map,'house',[{x:10,y:40},{x:30,y:40},{x:30,y:90}]);
 expect(interiorRooms(next,'house')).toHaveLength(4);expect(interiorRooms(next,'house').filter(r=>r.roomPolygon!.some(p=>p.x===30&&p.y===40))).toHaveLength(2);expect(next.nodes.find(n=>n.id===original.id)?.description).toBe('An authored fireplace');expect(next.nodes.find(n=>n.id===original.id)?.imageDataUrl).toContain('ROOM');expect(interiorRooms(next,'house').reduce((a,r)=>a+roomAreaMeters(next.nodes[0]!,r),0)).toBeCloseTo(56);expect(WorldMapSchema.safeParse(JSON.parse(JSON.stringify(next))).success).toBe(true);expect(map.nodes).toHaveLength(4);
});
it('can cut back to the same outside wall with multiple corners',()=>{
 const next=splitInteriorRoomPath(fixture(),'house',[{x:20,y:10},{x:20,y:30},{x:45,y:30},{x:45,y:10}]);expect(interiorRooms(next,'house')).toHaveLength(4);expect(interiorRooms(next,'house').reduce((a,r)=>a+roomAreaMeters(next.nodes[0]!,r),0)).toBeCloseTo(56);
});
it('rejects crossed chains, crossing another room and cutting through a door',()=>{
 const map=fixture(),before=JSON.stringify(map);
 expect(()=>splitInteriorRoomPath(map,'house',[{x:10,y:30},{x:50,y:70},{x:20,y:70},{x:50,y:30},{x:10,y:80}])).toThrow('itself');
 expect(()=>splitInteriorRoomPath(map,'house',[{x:10,y:30},{x:70,y:30},{x:70,y:80},{x:10,y:80}])).toThrow('same room');
 expect(()=>splitInteriorRoomPath(map,'house',[{x:10,y:20},{x:60,y:35},{x:30,y:90}])).toThrow('opening');expect(JSON.stringify(map)).toBe(before);
});
it('checks the actual angled chain against furniture, rather than the diagonal between its ends',()=>{
 const map=placeInteriorFurniture(fixture(),'house',{x:20,y:43},'table'),table=map.nodes.find(n=>n.furnitureType==='table')!,next=splitInteriorRoomPath(map,'house',[{x:10,y:20},{x:40,y:20},{x:40,y:90}]);const moved=next.nodes.find(n=>n.id===table.id)!;expect(moved.interiorPosition).toEqual(table.interiorPosition);expect(polygonContains(next.nodes.find(n=>n.id===moved.parentId)!.roomPolygon!,moved.interiorPosition!)).toBe(true);
 const blocked=placeInteriorFurniture(fixture(),'house',{x:20,y:20},'table');expect(()=>splitInteriorRoomPath(blocked,'house',[{x:10,y:20},{x:30,y:20},{x:30,y:90}])).toThrow('furniture');
});
