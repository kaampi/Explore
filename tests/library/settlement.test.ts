import { expect,it } from 'vitest';
import { generateSettlement,applySettlement,settlementOverview,settlementPiece,type SettlementOptions } from '../../src/library/settlement';
import { WorldMapSchema,type WorldMap } from '../../src/library/worldMap';
import { routePoints } from '../../src/library/mapRoutes';
import { mapPosition } from '../../src/library/mapGeometry';
import { travelGap,applyMapScale } from '../../src/library/mapTravel';
import { adventureMapPlaces } from '../../src/library/adventureMap';
import { newRealmTemplate } from '../../src/library/LibrarySchema';

const parent=()=>({...settlementPiece('settlement','',55,50),id:'town',placeId:'town-place',name:'Willowbrook'});
it('organises every size and street pattern into connected, non-overlapping lots',()=>{
 for(const size of ['village','town','city'] as const)for(const layout of ['street','crossroads'] as const)for(const landmark of ['worship','hall','none'] as const){
  const generated=generateSettlement({size,layout,landmark},'town'),map={...generated,nodes:[parent(),...generated.nodes]};expect(WorldMapSchema.safeParse(map).success,`${size}/${layout}/${landmark}`).toBe(true);
  const houses=generated.nodes.filter(n=>n.kind==='Building');expect(houses.length).toBeGreaterThanOrEqual(size==='village'?10:size==='town'?18:30);
  expect(houses.every(n=>n.contentType==='interior'&&n.placeId===n.id&&n.entrance==='open')).toBe(true);expect(generated.nodes.filter(n=>n.kind==='Square')).toHaveLength(1);
  for(let i=0;i<houses.length;i++)for(let j=i+1;j<houses.length;j++){const a=houses[i]!,b=houses[j]!;expect(Math.abs(a.x-b.x)>=(a.width!+b.width!)/2||Math.abs(a.y-b.y)>=(a.height!+b.height!)/2,`${a.name} overlaps ${b.name}`).toBe(true);}
  const square=generated.nodes.find(n=>n.kind==='Square')!,reachable=new Set([square.id]);let previous=-1;while(previous!==reachable.size){previous=reachable.size;for(const r of generated.routes)if(reachable.has(r.from)||reachable.has(r.to)){reachable.add(r.from);reachable.add(r.to);}}
  expect(houses.every(n=>reachable.has(n.id))).toBe(true);
  for(const r of generated.routes.filter(r=>r.type==='road')){const a=generated.nodes.find(n=>n.id===r.from)!,b=generated.nodes.find(n=>n.id===r.to)!;for(const p of routePoints(r,a,b))for(const house of houses)expect(Math.abs(house.x-p.x)>=house.width!/2+.3||Math.abs(house.y-p.y)>=house.height!/2+.3,`${house.name} blocks the street`).toBe(true);}
 }
});
it('creates independent identities, deterministic lot arrangements and optional edge landmarks',()=>{
 const options:SettlementOptions={size:'village',layout:'street',landmark:'none'},a=generateSettlement(options,'town'),b=generateSettlement(options,'town');
 expect(a.nodes.map(n=>[n.kind,n.name,n.x,n.y])).toEqual(b.nodes.map(n=>[n.kind,n.name,n.x,n.y]));expect(a.nodes.some(n=>b.nodes.some(other=>other.id===n.id))).toBe(false);expect(a.nodes.some(n=>n.name==='Place of worship')).toBe(false);
 const worship=generateSettlement({...options,landmark:'worship'},'town').nodes.find(n=>n.name==='Place of worship')!;expect(worship.x).toBeLessThan(20);expect(worship.y).toBeLessThan(30);
});
it('applies the preview without replacing authored content and keeps nested map IDs usable in Storyboard',()=>{
 const town=parent(),forest={...settlementPiece('square','',15,20),id:'forest',placeId:'forest-place',kind:'Forest',name:'Old wood'},world=newRealmTemplate({name:'Settlement world',note:'',source:'player',worldMap:{nodes:[town,forest],routes:[],mapType:'world'}});
 const before=structuredClone(world.worldMap!),layout=generateSettlement({size:'village',layout:'crossroads',landmark:'hall'},'town'),next=applySettlement(world.worldMap!,'town',layout);
 expect(world.worldMap).toEqual(before);expect(next.nodes.find(n=>n.id==='forest')).toEqual(forest);expect(next.nodes.find(n=>n.id==='town')!.distanceScale).toEqual(layout.distanceScale);expect(next.routes.every(r=>/minutes?$/.test(r.duration))).toBe(true);expect(next.nodes.filter(n=>n.parentId==='town').map(n=>n.id)).toEqual(layout.nodes.map(n=>n.id));
 const parsed=WorldMapSchema.parse(JSON.parse(JSON.stringify(next)));expect(adventureMapPlaces({...world,worldMap:parsed},[]).some(entry=>entry.path==='Willowbrook / Market square')).toBe(true);
 expect(()=>applySettlement(next,'town',layout)).toThrow('Existing places are kept');expect(()=>applySettlement(before,'missing',layout)).toThrow('existing settlement');
});
it('derives a long settlement from the actual building positions and updates after edits',()=>{
 const town=parent(),a=settlementPiece('cottage','town',20,50),b=settlementPiece('inn','town',80,50),map:WorldMap={nodes:[town,a,b],routes:[]};
 const overview=settlementOverview('town',map.nodes,map.routes)!;expect(overview.bounds.width/overview.bounds.height).toBeGreaterThan(3);expect(overview.path).not.toContain('NaN');expect(overview.buildings.map(n=>n.id)).toEqual([a.id,b.id]);
 const after=settlementOverview('town',[town,a],[])!;expect(after.bounds.width).toBeLessThan(overview.bounds.width);expect(overview.buildings).toHaveLength(2);expect(settlementOverview('town',[town],[])).toBeNull();
});
it('supports an empty root settlement and clamps manually placed buildings within the map',()=>{
 const generated=generateSettlement({size:'village',layout:'street',landmark:'none'}),map=applySettlement({nodes:[],routes:[],mapType:'settlement'},'',generated);expect(WorldMapSchema.safeParse(map).success).toBe(true);expect(map.distanceScale).toEqual(generated.distanceScale);
 const cottage=settlementPiece('cottage','town',50,50),large=settlementPiece('longhouse','town',50,50);expect(large.width!).toBeGreaterThan(cottage.width!);expect(large.height!).toBeGreaterThan(cottage.height!);
 const n=settlementPiece('longhouse','town',-4,102);expect(n.x-n.width!/2).toBeGreaterThanOrEqual(0);expect(n.y+n.height!/2).toBeLessThanOrEqual(100);
});

it('treats a new settlement as a location, independent of its icon or local building layout',()=>{
 const town={...settlementPiece('settlement','',50,50),id:'town'},other={...settlementPiece('settlement','',70,50),id:'other'};
 expect(town.settlementMarker).toBe(true);expect(town.width).toBeUndefined();expect(town.height).toBeUndefined();
 const legacySized={...town,width:60,height:40};expect(mapPosition(legacySized,{x:0,y:0})).toEqual({x:400,y:300});expect(mapPosition(legacySized,{x:1,y:1})).toEqual({x:400,y:300});expect(travelGap(legacySized,other)).toBe(4);
 const route={id:'road',from:town.id,to:other.id,mode:'Walk',duration:'',access:'open' as const,bothWays:true,fromAnchor:{x:1,y:0},toAnchor:{x:0,y:1}};
 expect(routePoints(route,legacySized,other)).toEqual([{x:50,y:50},{x:70,y:50}]);
 const world:WorldMap={mapType:'world',distanceScale:{value:10,unit:'km',kmPerUnit:1},nodes:[legacySized,other],routes:[route]},before=applyMapScale(world,'',1440);
 const built=applySettlement(before,'town',generateSettlement({size:'city',layout:'crossroads',landmark:'hall'},'town'));
 expect(built.routes.find(r=>r.id==='road')!.duration).toBe(before.routes[0]!.duration);expect(built.nodes.find(n=>n.id==='town')!.settlementMarker).toBe(true);
 const parsed=WorldMapSchema.parse(JSON.parse(JSON.stringify(built)));expect(parsed.nodes.find(n=>n.id==='town')!.settlementMarker).toBe(true);
});
