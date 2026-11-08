import { expect,it } from 'vitest';
import { simplifyRoute } from '../../src/library/routeSimplify';
import { curvePoint,type ShapePoint,type XY } from '../../src/library/mapShapes';
import { addRouteSketch } from '../../src/library/routeSketch';
import { WorldMapSchema } from '../../src/library/worldMap';

const dense=(a:ShapePoint,b:ShapePoint,count=150)=>Array.from({length:count+1},(_,i)=>curvePoint(a,b,i/count));
const samples=(points:ShapePoint[])=>points.flatMap((a,i)=>i===points.length-1?[a]:Array.from({length:40},(_,j)=>curvePoint(a,points[i+1]!,j/40)));
const distance=(p:XY,a:XY,b:XY)=>{const dx=(b.x-a.x)*8,dy=(b.y-a.y)*6,t=Math.max(0,Math.min(1,((p.x-a.x)*8*dx+(p.y-a.y)*6*dy)/(dx*dx+dy*dy||1)));return Math.hypot((p.x-a.x)*8-dx*t,(p.y-a.y)*6-dy*t);};
function deviation(a:XY[],b:XY[]){return Math.max(...a.map(p=>Math.min(...b.slice(1).map((end,i)=>distance(p,b[i]!,end)))));}

it('fits dense arcs and S bends to at most four editable points with bounded visual error',()=>{
 for(const [a,b] of [
  [{x:10,y:60,outgoing:{x:20,y:5}},{x:90,y:60,incoming:{x:80,y:5}}],
  [{x:10,y:50,outgoing:{x:35,y:5}},{x:90,y:50,incoming:{x:65,y:95}}]
 ] as Array<[ShapePoint,ShapePoint]>){
  const input=dense(a,b),before=structuredClone(input),result=simplifyRoute(input,3),output=samples(result);
  expect(result.length).toBeLessThanOrEqual(4);expect(result[0]!.x).toBe(a.x);expect(result.at(-1)!.y).toBe(b.y);
  expect(deviation(input,output)).toBeLessThanOrEqual(3.1);expect(deviation(output,input)).toBeLessThanOrEqual(3.1);expect(input).toEqual(before);
 }
});

it('removes hand jitter and duplicates but preserves sharp turns, hairpins and loops',()=>{
 const straight=Array.from({length:151},(_,i)=>({x:10+i*.5,y:50+(i%2?.08:0)}));expect(simplifyRoute(straight)).toHaveLength(2);
 const turn=[...dense({x:10,y:10},{x:75,y:10},70),...dense({x:75,y:10},{x:75,y:80},70)];
 const loop=dense({x:30,y:50,outgoing:{x:100,y:0}},{x:30,y:50,incoming:{x:100,y:100}});
 const hairpin=[...dense({x:10,y:30},{x:90,y:30},60),...dense({x:90,y:30},{x:90,y:34},10),...dense({x:90,y:34},{x:10,y:34},60)];
 for(const input of [turn,loop,hairpin]){const result=simplifyRoute(input),output=samples(result);expect(deviation(input,output)).toBeLessThanOrEqual(3.1);expect(deviation(output,input)).toBeLessThanOrEqual(3.1);expect(result.length).toBeLessThan(input.length);expect(result.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);}
});

it('simplifies existing cubic curves without flattening them and leaves already minimal routes unchanged',()=>{
 const input:ShapePoint[]=[];
 for(let i=0;i<=20;i++){const t=i/20;input.push({x:10+80*t,y:40+15*Math.sin(t*Math.PI),incoming:{x:10+80*t-1,y:40+15*Math.sin(t*Math.PI)-Math.cos(t*Math.PI)},outgoing:{x:10+80*t+1,y:40+15*Math.sin(t*Math.PI)+Math.cos(t*Math.PI)}});}
 const result=simplifyRoute(input);expect(result.length).toBeLessThan(input.length);expect(deviation(samples(input),samples(result))).toBeLessThanOrEqual(3.1);
 const minimal:ShapePoint[]=[{x:5,y:50,outgoing:{x:20,y:0}},{x:95,y:50,incoming:{x:80,y:100}}];expect(simplifyRoute(minimal)).toEqual(minimal);
 expect(simplifyRoute([{x:20,y:20},{x:20,y:20},{x:20,y:20}])).toHaveLength(3);
});

it('automatically simplifies each drawn section after protecting real junctions and terrain entry points',()=>{
 const nodes=[{id:'west',name:'West',kind:'Settlement',x:5,y:50,width:2,height:2},{id:'east',name:'East',kind:'Settlement',x:95,y:50,width:2,height:2},{id:'north',name:'North',kind:'Settlement',x:50,y:5,width:2,height:2},{id:'south',name:'South',kind:'Settlement',x:50,y:95,width:2,height:2},{id:'wood',name:'Wood',kind:'Forest',x:30,y:50,width:20,height:30}];
 const original=WorldMapSchema.parse({nodes,routes:[{id:'crossing',from:'north',to:'south',type:'path',mode:'Walk',duration:'20 minutes',manualTime:true,access:'locked',bothWays:false,description:'Keep this condition'}]});
 const result=addRouteSketch(original,'',dense({x:5,y:50},{x:95,y:50}),'road');expect(WorldMapSchema.safeParse(result).success).toBe(true);
 const crossing=result.nodes.find(n=>n.isJunction&&Math.abs(n.x-50)<1&&Math.abs(n.y-50)<1)!;expect(result.routes.filter(r=>r.from===crossing.id||r.to===crossing.id)).toHaveLength(4);
 expect(result.routes.filter(r=>r.type==='path').every(r=>r.access==='locked'&&r.manualTime&&!r.bothWays&&r.description==='Keep this condition')).toBe(true);
 const roads=result.routes.filter(r=>r.type==='road');expect(roads.length).toBeGreaterThan(2);expect(roads.every(r=>r.geometry!.length<=4)).toBe(true);expect(roads.some(r=>r.areaIds?.includes('wood'))).toBe(true);
 for(const r of roads){expect(r.geometry![0]!.x).toBe(result.nodes.find(n=>n.id===r.from)!.x);expect(r.geometry!.at(-1)!.x).toBe(result.nodes.find(n=>n.id===r.to)!.x);}
 expect(original.routes).toHaveLength(1);
});
