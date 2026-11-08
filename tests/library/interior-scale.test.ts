import { expect,it } from 'vitest';
import { ensureInterior,extendInterior,interiorRooms,placeInteriorFurniture,resizeInterior,moveInteriorFurniture,moveInteriorOpening,interiorEdges } from '../../src/library/interior';
import { furnitureFootprint,furnitureSizeMeters,houseSizeMeters,interiorScale,physicalDistance,roomAreaMeters } from '../../src/library/interiorScale';
import { settlementPiece } from '../../src/library/settlement';
import { WorldMapSchema,type WorldMap } from '../../src/library/worldMap';

function fixture(){return ensureInterior({nodes:[{...settlementPiece('cottage','',50,50),id:'house',placeId:'house-place'}],routes:[]},'house');}
it('uses one metre scale for house, rooms and furniture, including rotated furniture',()=>{
 let map=fixture();const house=map.nodes[0]!,m=interiorScale(house);expect(m.size).toEqual({width:8,depth:7});expect(interiorRooms(map,'house').reduce((a,r)=>a+roomAreaMeters(house,r),0)).toBeCloseTo(56);expect(m.pxPerMetreX*m.scaleX).toBeCloseTo(m.pxPerMetreY*m.scaleY);
 map=placeInteriorFurniture(map,'house',{x:75,y:35},'bed');const bed=map.nodes.find(n=>n.furnitureType==='bed')!;for(const rotation of [0,45,90,135]){const corners=furnitureFootprint(house,{...bed,rotation});expect(physicalDistance(house,corners[0]!,corners[1]!)).toBeCloseTo(.9);expect(physicalDistance(house,corners[1]!,corners[2]!)).toBeCloseTo(2);}
});
it('keeps old room areas, furniture dimensions and physical offsets when extending a building',()=>{
 let map=placeInteriorFurniture(fixture(),'house',{x:25,y:25},'table');const house=map.nodes[0]!,rooms=interiorRooms(map,'house'),areas=new Map(rooms.map(r=>[r.id,roomAreaMeters(house,r)])),table=map.nodes.find(n=>n.furnitureType==='table')!,old=interiorScale(house),offset=(table.interiorPosition!.x-old.left)*old.metresPerUnitX;
 map=extendInterior(map,'house','right');const next=map.nodes[0]!,m=interiorScale(next),moved=map.nodes.find(n=>n.id===table.id)!;expect(houseSizeMeters(next)).toEqual({width:10,depth:7});expect(furnitureSizeMeters(moved)).toEqual({width:1.6,depth:.9});expect((moved.interiorPosition!.x-m.left)*m.metresPerUnitX).toBeCloseTo(offset);
 for(const [id,area] of areas)expect(roomAreaMeters(next,map.nodes.find(n=>n.id===id)!)).toBeCloseTo(area);expect(WorldMapSchema.safeParse(JSON.parse(JSON.stringify(map))).success).toBe(true);
});
it('resizes the house and its map footprint while preserving real furniture size and rejects impossible fits',()=>{
 let map=placeInteriorFurniture(fixture(),'house',{x:75,y:35},'bed');const ids=interiorRooms(map,'house').map(r=>r.id),originalWidth=map.nodes[0]!.width!;map=resizeInterior(map,'house',{width:12,depth:7});expect(map.nodes[0]!.width).toBeCloseTo(originalWidth*1.5);expect(interiorRooms(map,'house').map(r=>r.id)).toEqual(ids);const bed=map.nodes.find(n=>n.furnitureType==='bed')!;expect(furnitureSizeMeters(bed)).toEqual({width:.9,depth:2});expect(()=>moveInteriorFurniture(map,'house',bed.id,{x:89,y:11})).toThrow('whole piece');expect(()=>resizeInterior(map,'house',{width:2,depth:2})).toThrow();
 expect(()=>placeInteriorFurniture(fixture(),'house',{x:85,y:15},'bed')).toThrow('whole piece');
});
it('adds starter measurements to a legacy plan without replacing rooms, pictures or positions',()=>{
 const map=fixture(),before=structuredClone(map);delete map.nodes[0]!.interior!.sizeMeters;const migrated=ensureInterior(map,'house');expect(migrated.nodes.slice(1)).toEqual(before.nodes.slice(1));expect(migrated.routes).toEqual(before.routes);expect(migrated.nodes[0]!.interior!.sizeMeters).toEqual({width:8,depth:7});migrated.nodes[0]!.interior!.sizeMeters!.width=50;expect(houseSizeMeters(settlementPiece('cottage','',50,50)).width).toBe(8);expect(ensureInterior(migrated,'house')).toBe(migrated);
});

it('moves a door at real width without changing its route identity or access',()=>{
 const map=fixture(),building=map.nodes[0]!,door=building.interior!.openings.find(o=>o.kind==='door'&&o.position.x===60&&o.position.y===35)!;door.access='locked';const moved=moveInteriorOpening(map,'house',door.id,{x:60,y:40}),opening=moved.nodes[0]!.interior!.openings.find(o=>o.id===door.id)!;expect(opening.routeId).toBe(door.routeId);expect(opening.access).toBe('locked');expect(opening.widthMeters).toBe(.9);expect(moved.routes.find(r=>r.id===door.routeId)?.access).toBe('locked');expect(()=>moveInteriorOpening(map,'house',door.id,{x:60,y:10.5})).toThrow('corner');
});
