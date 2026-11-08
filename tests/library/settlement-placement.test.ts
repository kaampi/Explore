import { expect,it } from 'vitest';
import { settlementPiece } from '../../src/library/settlement';
import { settlementPlacementIssue } from '../../src/library/settlementPlacement';
import { starterBlueprints,instantiateBlueprint } from '../../src/library/placeBlueprint';
import { WorldMapSchema,type WorldMap } from '../../src/library/worldMap';

it('creates editable fields, cattle, wells and docks as independent places and keeps the police template genre-tagged',()=>{
 for(const type of ['fields','cattle','well','docks'] as const){const a=settlementPiece(type,'town',50,50),b=settlementPiece(type,'town',50,50);expect(a.id).not.toBe(b.id);expect(a.placeId).toBe(a.id);expect(a.symbol).toBe(type);expect(a.description.length).toBeGreaterThan(10);const template=starterBlueprints.find(t=>t.symbol===type)!;expect(template).toBeTruthy();const copy=instantiateBlueprint(template,'town');expect(copy.symbol).toBe(type);expect(copy.placementRule).toBe(type==='docks'?'shoreline':undefined);}
 expect(starterBlueprints.find(t=>t.id==='starter-police')!.tags).toEqual(['modern','crime']);
});

it('allows docks only where the footprint touches both land and local water, including erased islands',()=>{
 const lake={...settlementPiece('square','',60,50),id:'water',kind:'Lake',width:20,height:70},map:WorldMap={mapType:'settlement',nodes:[lake],routes:[]};
 expect(settlementPlacementIssue(map,'',settlementPiece('docks','',50,50))).toBeNull();expect(settlementPlacementIssue(map,'',settlementPiece('docks','',20,50))).toContain('need water');expect(settlementPlacementIssue(map,'',settlementPiece('docks','',60,50))).toContain('both land and water');
 const island={...map,nodes:[{...lake,brush:[{x:400,y:300,radius:190,erase:false},{x:400,y:300,radius:100,erase:true}]}]};expect(settlementPlacementIssue(island,'',settlementPiece('docks','',50,50))).toContain('need water');
 expect(settlementPlacementIssue(map,'',settlementPiece('well','',20,50))).toBeNull();
});

it('checks the real projected shoreline from the parent map rather than the display state or local decoration',()=>{
 for(const kind of ['Lake','River','Sea','Ocean']){const town={...settlementPiece('settlement','',50,50),id:'town',distanceScale:{value:25,unit:'m',kmPerUnit:.001}},water={...settlementPiece('square','',51,50),id:'water',kind,width:1,height:10},map:WorldMap={mapType:'world',distanceScale:{value:1,unit:'km',kmPerUnit:1},nodes:[town,water],routes:[]};
  expect(settlementPlacementIssue(map,'town',settlementPiece('docks','town',70,50))).toBeNull();expect(settlementPlacementIssue(map,'town',settlementPiece('docks','town',30,50))).toContain('need water');
  const copy=instantiateBlueprint(starterBlueprints.find(t=>t.id==='starter-docks')!,'town');expect(WorldMapSchema.safeParse({...map,nodes:[...map.nodes,{...copy,x:70}]}).success).toBe(true);
 }
});
