import type { WorldMap,MapNode } from './worldMap';
import { attachRoadJunction } from './mapJunctions';
import { routePoints } from './mapRoutes';
import { curvePoint,rectanglePoints,type XY } from './mapShapes';
import { mapPosition } from './mapGeometry';
import { brushContains } from './forestBrush';
const distance=(a:XY,b:XY)=>Math.hypot((a.x-b.x)*8,(a.y-b.y)*6);
export function areaContains(n:MapNode,p:XY){
 if(n.brush)return brushContains(n,p.x*8,p.y*6);
 const shape=n.shape??rectanglePoints(),poly:XY[]=[];for(let i=0;i<shape.length;i++)for(let j=0;j<12;j++){const q=mapPosition(n,curvePoint(shape[i]!,shape[(i+1)%shape.length]!,j/12));poly.push({x:q.x/8,y:q.y/6});}
 let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i]!,b=poly[j]!;if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;
}
function segments(map:WorldMap,level:string){return map.routes.filter(r=>['road','path'].includes(r.type??'road')).flatMap(r=>{const a=map.nodes.find(n=>n.id===r.from),b=map.nodes.find(n=>n.id===r.to);if(!a||!b||(a.parentId??'')!==level||(b.parentId??'')!==level)return [];const points=routePoints(r,a,b),result:{id:string;a:XY;b:XY}[]=[];for(let i=0;i<points.length-1;i++){let last:XY=points[i]!;for(let j=1;j<=16;j++){const p=curvePoint(points[i]!,points[i+1]!,j/16);result.push({id:r.id,a:last,b:p});last=p;}}return result;});}
function projection(p:XY,a:XY,b:XY){const dx=(b.x-a.x)*8,dy=(b.y-a.y)*6,t=Math.max(0,Math.min(1,((p.x-a.x)*8*dx+(p.y-a.y)*6*dy)/(dx*dx+dy*dy||1)));return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
export function sketchSnap(map:WorldMap,level:string,p:XY,tolerance=12):{point:XY;nodeId?:string;routeId?:string;label:string}|null{
 const nodes=map.nodes.filter(n=>(n.parentId??'')===level&&!['forest','lake','river','mountain','region','area'].includes(n.kind.toLowerCase()));
 const node=nodes.filter(n=>areaContains(n,p)||distance(n,p)<tolerance).sort((a,b)=>distance(a,p)-distance(b,p))[0];if(node)return {point:{x:node.x,y:node.y},nodeId:node.id,label:node.name};
 let best:{point:XY;routeId:string;label:string}|null=null,d=tolerance;for(const s of segments(map,level)){const q=projection(p,s.a,s.b),gap=distance(p,q);if(gap<d){d=gap;best={point:q,routeId:s.id,label:'Road junction'};}}return best;
}
export function addRouteSketch(original:WorldMap,level:string,input:XY[],type:'road'|'path',autoJunctions=true):WorldMap{
 if(input.length<2||input.reduce((sum,p,i)=>sum+(i?distance(input[i-1]!,p):0),0)<5)throw Error('Draw a longer route.');
 let map=original;const stride=Math.max(1,Math.ceil(input.length/160));const points=input.filter((_,i)=>i===0||i===input.length-1||i%stride===0).map(p=>({...p}));
 const cuts:{at:number;point:XY;nodeId?:string}[]=[];
 const waypoint=(p:XY,name='Route waypoint')=>{const existing=map.nodes.find(n=>n.isJunction&&(n.parentId??'')===level&&distance(n,p)<2);if(existing)return existing.id;const id=crypto.randomUUID();map={...map,nodes:[...map.nodes,{id,name,kind:'Junction',isJunction:true,x:p.x,y:p.y,width:1,height:1,description:'A geographic route point, not a named destination.',population:'',characterIds:[],...(level?{parentId:level}:{})}]};return id;};
 for(const index of [0,points.length-1]){const snap=sketchSnap(map,level,points[index]!);let id:string;if(snap){points[index]=snap.point;if(snap.nodeId)id=snap.nodeId;else{const attached=attachRoadJunction(map,snap.routeId!,snap.point);map=attached.map;id=attached.nodeId;}}else id=waypoint(points[index]!);cuts.push({at:index,point:points[index]!,nodeId:id});}
 if(autoJunctions){const contacts:{at:number;point:XY}[]=[];for(let i=0;i<points.length-1;i++)for(const s of segments(map,level)){const a=points[i]!,b=points[i+1]!,dx=b.x-a.x,dy=b.y-a.y,ux=s.b.x-s.a.x,uy=s.b.y-s.a.y,den=dx*uy-dy*ux;if(Math.abs(den)<1e-9)continue;const t=((s.a.x-a.x)*uy-(s.a.y-a.y)*ux)/den,u=((s.a.x-a.x)*dy-(s.a.y-a.y)*dx)/den;if(t>=0&&t<=1&&u>=0&&u<=1){const p={x:a.x+dx*t,y:a.y+dy*t};if(!contacts.some(c=>distance(c.point,p)<2))contacts.push({at:i+t,point:p});}}
  for(const c of contacts){const snap=sketchSnap(map,level,c.point,3);if(!snap)continue;let id=snap.nodeId;if(!id&&snap.routeId){const attached=attachRoadJunction(map,snap.routeId,c.point);map=attached.map;id=attached.nodeId;}if(id)cuts.push({...c,nodeId:id});}
 }
 const areas=map.nodes.filter(n=>(n.parentId??'')===level&&!n.isJunction&&['forest','mountain','region','area'].includes(n.kind.toLowerCase()));
 const membership=(p:XY)=>areas.filter(n=>areaContains(n,p)).map(n=>n.id).sort().join('|');
 for(let i=0;i<points.length-1;i++){const a=points[i]!,b=points[i+1]!,steps=Math.max(1,Math.ceil(distance(a,b)/2));let previous=membership(a);for(let j=1;j<=steps;j++){const t=j/steps,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},current=membership(p);if(current!==previous){cuts.push({at:i+t,point:p,nodeId:waypoint(p,'Area boundary')});previous=current;}}}
 cuts.sort((a,b)=>a.at-b.at);const unique=cuts.filter((c,i)=>i===0||distance(c.point,cuts[i-1]!.point)>2);
 for(let i=0;i<unique.length-1;i++){const a=unique[i]!,b=unique[i+1]!;if(a.nodeId===b.nodeId)continue;const geometry=[a.point,...points.filter((_,j)=>j>a.at&&j<b.at),b.point],mid={x:(geometry[0]!.x+geometry[1]!.x)/2,y:(geometry[0]!.y+geometry[1]!.y)/2},areaIds=areas.filter(n=>areaContains(n,mid)).map(n=>n.id);
 map={...map,routes:[...map.routes,{id:crypto.randomUUID(),from:a.nodeId!,to:b.nodeId!,fromAnchor:{x:.5,y:.5},toAnchor:{x:.5,y:.5},geometry,type,mode:'Walk',duration:'',access:'open',bothWays:true,areaIds}]};}
 return map;
}
