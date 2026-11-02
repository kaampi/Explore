import { it,expect } from 'vitest';
import { addRouteSketch } from '../../src/library/routeSketch';
import { WorldMapSchema,type MapNode,type WorldMap } from '../../src/library/worldMap';
const node=(id:string,x:number,y:number):MapNode=>({id,placeId:id,name:id,kind:'Settlement',x,y,width:4,height:4,description:'',population:'',characterIds:[]});
it('snaps villages and records separate entrances on each side of a forest',()=>{
 const forest:MapNode={...node('forest',50,50),kind:'Forest',brush:[{x:400,y:300,radius:100,erase:false}]};
 const map=addRouteSketch({nodes:[node('west',10,50),forest,node('east',90,50)],routes:[]},'',[{x:10,y:50},{x:90,y:50}],'road');
 expect(WorldMapSchema.safeParse(map).success).toBe(true);
 expect(map.routes).toHaveLength(3);
 expect(map.routes[0]!.from).toBe('west');expect(map.routes.at(-1)!.to).toBe('east');
 const through=map.routes.find(r=>r.areaIds?.includes('forest'))!;expect(through).toBeTruthy();
 const entrance=map.nodes.find(n=>n.id===through.from)!,exit=map.nodes.find(n=>n.id===through.to)!;
 expect(entrance.x).toBeLessThan(exit.x);expect(entrance.placeId).toBeUndefined();expect(exit.placeId).toBeUndefined();
});
it('connects crossing roads and paths, preserving the existing route conditions',()=>{
 const initial:WorldMap={nodes:[node('a',10,50),node('b',90,50)],routes:[{id:'old',from:'a',to:'b',type:'road',mode:'Walk',duration:'100 minutes',manualTime:true,description:'Guarded road',access:'locked',bothWays:false}]};
 const result=addRouteSketch(initial,'',[{x:50,y:10},{x:50,y:90}],'path');
 const junction=result.nodes.find(n=>n.isJunction&&Math.abs(n.x-50)<1&&Math.abs(n.y-50)<1)!;
 expect(junction).toBeTruthy();expect(result.routes.filter(r=>r.from===junction.id||r.to===junction.id)).toHaveLength(4);
 const roads=result.routes.filter(r=>r.type==='road');expect(roads).toHaveLength(2);expect(roads.every(r=>r.access==='locked'&&!r.bothWays&&r.description==='Guarded road')).toBe(true);
 expect(initial.routes).toHaveLength(1);
});
it('keeps an unconnected crossing separate when auto-connect is disabled',()=>{
 const initial:WorldMap={nodes:[node('a',10,50),node('b',90,50)],routes:[{id:'old',from:'a',to:'b',type:'path',mode:'Walk',duration:'',access:'open',bothWays:true}]};
 const result=addRouteSketch(initial,'',[{x:50,y:10},{x:50,y:90}],'road',false);
 expect(result.routes).toHaveLength(2);expect(result.routes[0]).toBe(initial.routes[0]);
});
