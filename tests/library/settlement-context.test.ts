import { expect,it } from 'vitest';
import { settlementWorldContext } from '../../src/library/settlementContext';
import { settlementPiece } from '../../src/library/settlement';
import type { WorldMap } from '../../src/library/worldMap';

function fixture():WorldMap{
 const town={...settlementPiece('settlement','',50,50),id:'town',distanceScale:{value:25,unit:'m',kmPerUnit:.001}},west={...settlementPiece('settlement','',10,50),id:'west'},lake={...settlementPiece('square','',51,50),id:'lake',kind:'Lake',width:1,height:3},forest={...settlementPiece('square','',50,50),id:'forest',kind:'Forest',width:40,height:30},home={...settlementPiece('cottage','town',50,50),id:'home'},square={...settlementPiece('square','town',50,50),id:'local-area',isArea:true};
 return {mapType:'world',distanceScale:{value:1,unit:'km',kmPerUnit:1},nodes:[town,west,lake,forest,home,square],routes:[{id:'approach',from:'west',to:'town',type:'road',mode:'Walk',duration:'',access:'open',bothWays:true},{id:'inside',from:'home',to:'local-area',type:'path',mode:'Walk',duration:'',access:'open',bothWays:true}]};
}

it('centres parent geography at the real location and uses both distance scales rather than symbol bounds',()=>{
 const map=fixture(),before=structuredClone(map),context=settlementWorldContext(map,'town')!;
 expect(context.estimated).toBe(false);expect(context.scale).toBe(40);expect(400*context.scale+context.x).toBe(400);expect(300*context.scale+context.y).toBe(300);
 expect(51*8*context.scale+context.x).toBe(720);expect(context.terrain.map(n=>n.id).sort()).toEqual(['forest','lake']);expect(context.routes.map(r=>r.id)).toEqual(['approach']);expect(map).toEqual(before);
 const differentIcon={...map,nodes:map.nodes.map(n=>n.id==='town'?{...n,width:80,height:70}:n)};expect(settlementWorldContext(differentIcon,'town')!.scale).toBe(40);
 const largerLocalMap={...map,nodes:map.nodes.map(n=>n.id==='town'?{...n,distanceScale:{value:50,unit:'m',kmPerUnit:.001}}:n)};expect(settlementWorldContext(largerLocalMap,'town')!.scale).toBe(20);
});

it('uses the containing map for nested settlements and explicitly marks legacy time scales as approximate',()=>{
 const map=fixture(),region={...settlementPiece('square','',50,50),id:'region',kind:'Region',contentType:'world' as const,distanceScale:{value:2,unit:'km',kmPerUnit:1}},nested={...map,nodes:[region,...map.nodes.map(n=>n.parentId?n:{...n,parentId:'region'})]};
 const context=settlementWorldContext(nested,'town')!;expect(context.parentId).toBe('region');expect(context.scale).toBe(80);expect(context.estimated).toBe(false);
 const legacy={...map,distanceScale:undefined};expect(settlementWorldContext(legacy,'town')!.estimated).toBe(true);expect(settlementWorldContext(map,'home')).toBeNull();expect(settlementWorldContext(map,'missing')).toBeNull();
});
