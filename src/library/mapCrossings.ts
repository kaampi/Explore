import { mapPosition } from "./mapGeometry";
import type { WorldMap,MapNode } from "./worldMap";
import { rectanglePoints,curvePoint,type XY,type ShapePoint } from "./mapShapes";
import { routePoints } from "./mapRoutes";
export type Crossing={id:string;routeId:string;riverId:string;x:number;y:number;angle:number};
function samples(points:ShapePoint[],closed:boolean):XY[]{const result:XY[]=[];const count=closed?points.length:points.length-1;for(let i=0;i<count;i++)for(let j=0;j<32;j++)result.push(curvePoint(points[i]!,points[(i+1)%points.length]!,j/32));result.push(closed?points[0]!:points[points.length-1]!);return result;}
function contains(p:XY,polygon:XY[]):boolean{let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i]!,b=polygon[j]!;if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
function intersection(a:XY,b:XY,c:XY,d:XY):number|undefined{const x=b.x-a.x,y=b.y-a.y,u=d.x-c.x,v=d.y-c.y,den=x*v-y*u;if(Math.abs(den)<1e-10)return;const t=((c.x-a.x)*v-(c.y-a.y)*u)/den,s=((c.x-a.x)*y-(c.y-a.y)*x)/den;if(t>0&&t<1&&s>=0&&s<=1)return t;return;}
export function findCrossings(map:WorldMap):Crossing[]{const result:Crossing[]=[];for(const route of map.routes){if(route.mode.toLowerCase()==="door"||["boat","ferry"].includes(route.type??""))continue;const a=map.nodes.find(n=>n.id===route.from),b=map.nodes.find(n=>n.id===route.to);if(!a||!b||a.parentId!==b.parentId)continue;const line=samples(routePoints(route,a,b),false);for(const river of map.nodes.filter(n=>n.kind.toLowerCase()==="river"&&n.parentId===a.parentId)){
 const polygon=samples(river.shape??rectanglePoints(),true).map(p=>{const q=mapPosition(river,p);return {x:q.x/8,y:q.y/6};});let run:XY[]=[];let ordinal=0;
 const finish=()=>{if(run.length<2){run=[];return;}const first=run[0]!,last=run[run.length-1]!,mid=run[Math.floor(run.length/2)]!;result.push({id:JSON.stringify([route.id,river.id,ordinal++]),routeId:route.id,riverId:river.id,x:mid.x,y:mid.y,angle:Math.atan2((last.y-first.y)*6,(last.x-first.x)*8)*180/Math.PI});run=[];};
 for(let i=0;i<line.length-1;i++){const p=line[i]!,q=line[i+1]!,ts=[0,1];for(let k=0;k<polygon.length-1;k++){const t=intersection(p,q,polygon[k]!,polygon[k+1]!);if(t!==undefined)ts.push(t);}ts.sort((a,b)=>a-b);for(let j=0;j<ts.length-1;j++){const t=ts[j]!,u=ts[j+1]!,point=(v:number)=>({x:p.x+(q.x-p.x)*v,y:p.y+(q.y-p.y)*v});if(contains(point((t+u)/2),polygon)){run.push(point(t),point(u));}else finish();}}finish();
 }}return result;}
export function crossingSummary(map:WorldMap, routeId?:string):string[]{const live=findCrossings(map).filter(c=>!routeId||c.routeId===routeId);return live.map(c=>{
 const r=map.routes.find(r=>r.id===c.routeId)!,river=map.nodes.find(n=>n.id===c.riverId)!,config=map.crossings?.find(s=>s.id===c.id),choice=config?.type??"undefined";
 const from=map.nodes.find(n=>n.id===r.from)?.name??r.from,to=map.nodes.find(n=>n.id===r.to)?.name??r.to;
 const passage=choice==="none"?config?.naturalPassage??"blocked":choice;
 return [`River crossing on route ${from} to ${to}, at ${river.name}: ${choice}.`,
  config?.access==="blocked"?"Passage is currently blocked.":passage==="ford"?"No bridge or ferry; an established ford requires wading.":passage==="swim"?"No bridge or ferry; passage requires swimming.":passage==="blocked"||passage==="undefined"?"No established passage across the water. Do not assume it is safe to wade or swim.":"Authored crossing; current access still depends on scene state.",
  config?.description?`Description: ${config.description}`:"",config?.schedule?`Schedule: ${config.schedule}. This is narrative information, not an automatically enforced timetable.`:"",config?.instructions?`Instructions: ${config.instructions}`:""].filter(Boolean).join(" ");
 });}
