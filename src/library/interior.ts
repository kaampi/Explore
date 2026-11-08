import { InteriorSizeSchema,houseSizeMeters,interiorScale,furnitureSizeMeters,furnitureFootprint,openingWidthMeters,physicalDistance,roomAreaMeters,type MetreSize } from "./interiorScale";
import { z } from 'zod';
import type { MapNode,WorldMap } from './worldMap';
import type { XY } from './mapShapes';
import { rectanglePoints } from './mapShapes';
import { mapPosition,rotatePoint } from './mapGeometry';
import { routePoints } from './mapRoutes';
import { curvePoint } from './mapShapes';
import { interiorFurniture, type FurnitureType } from './interiorFurniture';

const Point=z.object({x:z.number().finite().min(0).max(100),y:z.number().finite().min(0).max(100)});
export const InteriorSchema=z.object({version:z.literal(1),sizeMeters:InteriorSizeSchema.optional(),outline:z.array(Point).min(3).max(200),footprintEdited:z.boolean().optional(),openings:z.array(z.object({id:z.string(),kind:z.enum(['door','window']),position:Point,access:z.enum(['open','locked','hidden']),widthMeters:z.number().finite().min(.3).max(6).optional(),routeId:z.string().optional()})).max(300)});
export type Interior=z.infer<typeof InteriorSchema>;
export type InteriorEdge={a:XY;b:XY;rooms:string[]};
const eps=.001;
const distance=(a:XY,b:XY)=>Math.hypot(a.x-b.x,a.y-b.y);
const cross=(a:XY,b:XY,c:XY)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
export function nearestOnSegment(p:XY,a:XY,b:XY){const length=(b.x-a.x)**2+(b.y-a.y)**2,t=length?Math.max(0,Math.min(1,((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/length)):0;return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
export function polygonArea(p:XY[]){return Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length]!;return s+a.x*b.y-b.x*a.y;},0)/2);}
export function polygonContains(p:XY[],q:XY){if(p.some((a,i)=>distance(q,nearestOnSegment(q,a,p[(i+1)%p.length]!))<eps))return true;let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i]!,b=p[j]!;if((a.y>q.y)!==(b.y>q.y)&&q.x<(b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
export function polygonBounds(p:XY[]){const left=Math.min(...p.map(v=>v.x)),top=Math.min(...p.map(v=>v.y)),right=Math.max(...p.map(v=>v.x)),bottom=Math.max(...p.map(v=>v.y));return {left,top,right,bottom,width:right-left,height:bottom-top};}
function roomGeometry(p:XY[]):Pick<MapNode,'x'|'y'|'width'|'height'|'shape'|'roomPolygon'>{const b=polygonBounds(p);return {x:(b.left+b.right)/2,y:(b.top+b.bottom)/2,width:b.width,height:b.height,shape:p.map(v=>({x:(v.x-b.left)/b.width,y:(v.y-b.top)/b.height})),roomPolygon:p};}
function newRoom(buildingId:string,p:XY[],name:string):MapNode{const id=crypto.randomUUID();return {id,placeId:id,parentId:buildingId,name,kind:'Room',contentType:'interior',description:'',intro:'',population:'',characterIds:[],color:'#e9dfc7',...roomGeometry(p)};}
export const interiorRooms=(map:WorldMap,id:string)=>map.nodes.filter(n=>n.parentId===id&&n.kind.toLowerCase()==='room'&&n.roomPolygon);
export function interiorEdges(rooms:MapNode[]):InteriorEdge[]{
 const segments=rooms.flatMap(r=>(r.roomPolygon??[]).map((a,i,p)=>({a,b:p[(i+1)%p.length]!,room:r.id}))),vertices=segments.flatMap(e=>[e.a,e.b]),edges=new Map<string,InteriorEdge>();
 const key=(p:XY)=>`${p.x.toFixed(4)},${p.y.toFixed(4)}`;
 for(const edge of segments){const parts=vertices.filter(p=>distance(p,nearestOnSegment(p,edge.a,edge.b))<eps).sort((a,b)=>distance(edge.a,a)-distance(edge.a,b));const unique=parts.filter((p,i)=>!i||distance(p,parts[i-1]!)>eps);for(let i=1;i<unique.length;i++){const a=unique[i-1]!,b=unique[i]!,id=[key(a),key(b)].sort().join('|'),old=edges.get(id);if(old){if(!old.rooms.includes(edge.room))old.rooms.push(edge.room);}else edges.set(id,{a,b,rooms:[edge.room]});}}
 return [...edges.values()];
}
export function nearestInteriorEdge(map:WorldMap,id:string,p:XY,outerOnly=false,cachedEdges?:InteriorEdge[]){let best:{edge:InteriorEdge;point:XY;distance:number}|undefined;for(const edge of cachedEdges??interiorEdges(interiorRooms(map,id))){if(outerOnly&&edge.rooms.length!==1)continue;const point=nearestOnSegment(p,edge.a,edge.b),d=distance(p,point);if(!best||d<best.distance)best={edge,point,distance:d};}return best;}
export function openingFits(building:MapNode,opening:Interior['openings'][number],edge:InteriorEdge){return Math.min(physicalDistance(building,edge.a,opening.position),physicalDistance(building,edge.b,opening.position))>=openingWidthMeters(opening)/2+.02;}
function checkOpeningWidths(map:WorldMap,id:string){const building=map.nodes.find(n=>n.id===id)!;for(const o of building.interior!.openings){const edge=nearestInteriorEdge(map,id,o.position)?.edge;if(!edge||!openingFits(building,o,edge))throw Error('A door or window would no longer fit. Move its opening first.');}}
function rebuildDoors(map:WorldMap,id:string):WorldMap{
 const building=map.nodes.find(n=>n.id===id)!,plan=building.interior!;const oldIds=new Set(plan.openings.map(o=>o.routeId).filter(Boolean)),routes=map.routes.filter(r=>!oldIds.has(r.id));
 for(const opening of plan.openings){if(opening.kind!=='door'||!opening.routeId)continue;const hit=nearestInteriorEdge(map,id,opening.position);if(!hit||hit.distance>.05)throw Error('A door would lose its wall. Move or remove that door first.');const [from,to]=hit.edge.rooms;if(!from)continue;routes.push({id:opening.routeId,from,to:to??id,mode:'Door',duration:'A few steps',access:opening.access,bothWays:true});}
 return {...map,routes};
}
/** Create once, on first opening. Existing authored rooms are never replaced. */
export function ensureInterior(map:WorldMap,id:string):WorldMap{
 const building=map.nodes.find(n=>n.id===id);if(!building||building.kind.toLowerCase()!=='building')return map;if(building.interior){if(building.interior.sizeMeters)return map;const roomIds=new Set(interiorRooms(map,id).map(r=>r.id));return {...map,nodes:map.nodes.map(n=>n.id===id?{...n,interior:{...n.interior!,sizeMeters:houseSizeMeters(n)}}:n.furnitureType&&roomIds.has(n.parentId??'')&&!n.furnitureSizeMeters?{...n,furnitureSizeMeters:furnitureSizeMeters(n)}:n)};}
 if(map.nodes.some(n=>n.parentId===id))return map;
 if(building.shape?.some(p=>p.incoming||p.outgoing))throw Error('Use a straight-sided outline for this first version of the interior editor.');
 const outline=(building.shape??rectanglePoints()).map(p=>({x:10+p.x*80,y:10+p.y*80}));
 const room=newRoom(id,outline,'Main room');let next:WorldMap={...map,nodes:[...map.nodes.map(n=>n.id===id?{...n,hasMap:true,contentType:'interior' as const,interior:{version:1 as const,sizeMeters:houseSizeMeters(building),outline,openings:[]}}:n),room]};
 // Custom shapes begin as one room. Standard rectangular houses get editable partitions.
 if(!building.shape&&building.symbol&&['cottage','longhouse','townhouse','inn'].includes(building.symbol)){
  const split=(a:XY,b:XY)=>{next=splitInteriorRoom(next,id,a,b);};
  if(building.symbol==='longhouse'){split({x:62,y:10},{x:62,y:90});split({x:62,y:50},{x:90,y:50});}
  else if(building.symbol==='inn'){split({x:10,y:58},{x:90,y:58});split({x:34,y:58},{x:34,y:90});split({x:62,y:58},{x:62,y:90});}
  else {split({x:60,y:10},{x:60,y:90});split({x:60,y:60},{x:90,y:60});}
  const rooms=interiorRooms(next,id).sort((a,b)=>polygonArea(b.roomPolygon!)-polygonArea(a.roomPolygon!));const names=building.symbol==='inn'?['Common room','Kitchen','Guest room','Store room']:building.symbol==='longhouse'?['Great hall','Sleeping room','Kitchen']:['Living room & kitchen','Bedroom','Store room'];
  next={...next,nodes:next.nodes.map(n=>rooms.some(r=>r.id===n.id)?{...n,name:names[rooms.findIndex(r=>r.id===n.id)]??'Room'}:n)};
  // One doorway on each partition connects every room; no unplanned passages.
  for(const e of interiorEdges(interiorRooms(next,id)).filter(e=>e.rooms.length===2))next=addInteriorOpening(next,id,{x:(e.a.x+e.b.x)/2,y:(e.a.y+e.b.y)/2},'door');
 }
 const exterior=interiorEdges(interiorRooms(next,id)).find(e=>e.rooms.length===1&&e.a.y===90&&e.b.y===90)??interiorEdges(interiorRooms(next,id)).find(e=>e.rooms.length===1)!;
 next=addInteriorOpening(next,id,{x:(exterior.a.x+exterior.b.x)/2,y:(exterior.a.y+exterior.b.y)/2},'door',building.entrance==='locked'?'locked':building.entrance==='hidden'||building.entrance==='none'?'hidden':'open');
 return next;
}
export function splitInteriorRoom(map:WorldMap,id:string,start:XY,end:XY):WorldMap{return splitInteriorRoomPath(map,id,[start,end]);}
function segmentTouches(a:XY,b:XY,c:XY,d:XY){
 const den=(b.x-a.x)*(d.y-c.y)-(b.y-a.y)*(d.x-c.x);
 if(Math.abs(den)<1e-9)return Math.abs(cross(a,b,c))<eps&&(distance(a,nearestOnSegment(a,c,d))<eps||distance(b,nearestOnSegment(b,c,d))<eps||distance(c,nearestOnSegment(c,a,b))<eps||distance(d,nearestOnSegment(d,a,b))<eps);
 const t=((c.x-a.x)*(d.y-c.y)-(c.y-a.y)*(d.x-c.x))/den,u=((c.x-a.x)*(b.y-a.y)-(c.y-a.y)*(b.x-a.x))/den;return t>=-1e-9&&t<=1+1e-9&&u>=-1e-9&&u<=1+1e-9;
}
/** A simple open wall chain cuts one face into two; its bends become shared room vertices. */
export function splitInteriorRoomPath(map:WorldMap,id:string,points:XY[]):WorldMap{
 const cut=points.filter((p,i)=>!i||distance(p,points[i-1]!)>eps);
 if(cut.length<2||cut.length>32||cut.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>100||p.y<0||p.y>100))throw Error('Draw a wall with two to 32 points inside the house.');
 const start=cut[0]!,end=cut.at(-1)!;
 if(distance(start,end)<.25||cut.slice(1).reduce((sum,p,i)=>sum+distance(p,cut[i]!),0)<3)throw Error('Draw a longer wall between two room boundaries.');
 for(let i=0;i<cut.length-1;i++)for(let j=i+2;j<cut.length-1;j++)if(segmentTouches(cut[i]!,cut[i+1]!,cut[j]!,cut[j+1]!))throw Error('The new wall cannot cross or touch itself.');
 for(let i=1;i<cut.length-1;i++)if(Math.abs(cross(cut[i-1]!,cut[i]!,cut[i+1]!))<eps&&((cut[i]!.x-cut[i-1]!.x)*(cut[i+1]!.x-cut[i]!.x)+(cut[i]!.y-cut[i-1]!.y)*(cut[i+1]!.y-cut[i]!.y))<=0)throw Error('The new wall cannot double back on itself.');
 const plan=map.nodes.find(n=>n.id===id)?.interior;
 if(plan?.openings.some(o=>cut.slice(1).some((p,i)=>distance(o.position,nearestOnSegment(o.position,cut[i]!,p))<3)))throw Error('Move the opening away from the new wall first.');
 for(const room of interiorRooms(map,id)){
  const p=room.roomPolygon!,nearest=(q:XY)=>p.map((a,i)=>({i,point:nearestOnSegment(q,a,p[(i+1)%p.length]!)})).sort((a,b)=>distance(q,a.point)-distance(q,b.point))[0]!;
  const a=nearest(start),b=nearest(end);if(distance(start,a.point)>2||distance(end,b.point)>2||cut.length===2&&a.i===b.i)continue;
  const chain=[a.point,...cut.slice(1,-1),b.point];
  if(chain.slice(1,-1).some(q=>!polygonContains(p,q)||p.some((v,i)=>distance(q,nearestOnSegment(q,v,p[(i+1)%p.length]!))<eps)))continue;
  let outside=false;
  for(let k=0;k<chain.length-1;k++){
   const u=chain[k]!,v=chain[k+1]!;
   if(!polygonContains(p,{x:(u.x+v.x)/2,y:(u.y+v.y)/2})){outside=true;break;}
   // Except for the chain's two ends, a partition must remain strictly inside its room.
   const shrink=.0001,aa={x:u.x+(v.x-u.x)*(k===0?shrink:0),y:u.y+(v.y-u.y)*(k===0?shrink:0)},bb={x:v.x+(u.x-v.x)*(k===chain.length-2?shrink:0),y:v.y+(u.y-v.y)*(k===chain.length-2?shrink:0)};
   if(p.some((q,i)=>segmentTouches(aa,bb,q,p[(i+1)%p.length]!))){outside=true;break;}
  }
  if(outside)continue;
  const vertices=p.flatMap((v,i)=>[v,...[a,b].filter(q=>q.i===i&&distance(q.point,v)>eps&&distance(q.point,p[(i+1)%p.length]!)>eps).sort((u,v)=>distance(p[i]!,u.point)-distance(p[i]!,v.point)).map(q=>q.point)]);
  const ai=vertices.findIndex(v=>distance(v,a.point)<eps),bi=vertices.findIndex(v=>distance(v,b.point)<eps);if(ai<0||bi<0||ai===bi)continue;
  const path=(from:number,to:number)=>{const result:XY[]=[];for(let i=from;;i=(i+1)%vertices.length){result.push(vertices[i]!);if(i===to)break;}return result;};
  const middle=chain.slice(1,-1);
  const pieces=[[...path(ai,bi),...[...middle].reverse()],[...path(bi,ai),...middle]].sort((a,b)=>polygonArea(b)-polygonArea(a));if(pieces.some(part=>part.length>200))throw Error('The room outline would become too complex.');if(pieces.some(part=>polygonArea(part)<12))throw Error('That wall would create a room that is too small.');
  const first={...room,...roomGeometry(pieces[0]!)},second=newRoom(id,pieces[1]!,'New room');
  if(map.nodes.some(n=>n.parentId===room.id&&n.kind!=='Furniture'))throw Error('This room has nested authored places. Move them before splitting it.');
  const next={...map,nodes:[...map.nodes.map(n=>n.id===room.id?first:n.parentId===room.id&&n.interiorPosition&&polygonContains(second.roomPolygon!,n.interiorPosition)?{...n,parentId:second.id}:n),second]};const building=map.nodes.find(n=>n.id===id)!;for(const n of next.nodes.filter(n=>n.furnitureType&&(n.parentId===first.id||n.parentId===second.id)))if(!furnitureFits(building,n.parentId===first.id?first:second,n))throw Error('Move the furniture away from the new wall first.');checkOpeningWidths(next,id);return rebuildDoors(next,id);
 }
 throw Error('Start and finish the wall on the boundary of the same room.');
}
/** Shared by the placement cursor and the actual operation; preview never creates IDs or routes. */
export function interiorOpeningPlacement(map:WorldMap,id:string,p:XY,kind:'door'|'window',existing?:Interior['openings'][number],cachedEdges?:InteriorEdge[]){
 const hit=nearestInteriorEdge(map,id,p,kind==='window',cachedEdges),building=map.nodes.find(n=>n.id===id)!,widthMeters=openingWidthMeters(existing??{kind}),position=hit&&hit.distance<=4?hit.point:p;
 const edge=hit?.edge??{a:p,b:{x:p.x+1,y:p.y},rooms:[]};
 let error:string|undefined;
 if(!hit||hit.distance>4)error=kind==='window'?'Place windows on an outside wall.':'Place the door on a wall.';
 else if(physicalDistance(building,edge.a,edge.b)<widthMeters+(existing ? .04 : .16))error='This wall is too short for the opening’s width.';
 else if(Math.min(physicalDistance(building,position,edge.a),physicalDistance(building,position,edge.b))<widthMeters/2+(existing ? .02 : .08))error='Place the opening farther from the corner.';
 else if(building.interior!.openings.some(o=>o.id!==existing?.id&&physicalDistance(building,o.position,position)<(openingWidthMeters(o)+widthMeters)/2+.15))error='There is already an opening here.';
 return {position,edge,widthMeters,valid:!error,error};
}
export function addInteriorOpening(map:WorldMap,id:string,p:XY,kind:'door'|'window',access:'open'|'locked'|'hidden'='open'):WorldMap{
 const placement=interiorOpeningPlacement(map,id,p,kind);if(!placement.valid)throw Error(placement.error);
 const building=map.nodes.find(n=>n.id===id)!,pos=placement.position,widthMeters=placement.widthMeters;
 const opening={id:crypto.randomUUID(),kind,position:pos,access,widthMeters,...(kind==='door'?{routeId:crypto.randomUUID()}:{})};
 return rebuildDoors({...map,nodes:map.nodes.map(n=>n.id===id?{...n,interior:{...n.interior!,openings:[...n.interior!.openings,opening]}}:n)},id);
}
export function updateInteriorOpening(map:WorldMap,id:string,openingId:string,access:'open'|'locked'|'hidden'|null):WorldMap{
 const building=map.nodes.find(n=>n.id===id)!,old=building.interior!.openings.find(o=>o.id===openingId);if(!old)return map;
 const next={...map,nodes:map.nodes.map(n=>n.id===id?{...n,interior:{...n.interior!,openings:n.interior!.openings.flatMap(o=>o.id!==openingId?[o]:access?[{...o,access}]:[])}}:n),routes:map.routes.filter(r=>r.id!==old.routeId)};return rebuildDoors(next,id);
}
export function moveInteriorOpening(map:WorldMap,id:string,openingId:string,p:XY):WorldMap{
 const building=map.nodes.find(n=>n.id===id)!,o=building.interior!.openings.find(o=>o.id===openingId);if(!o)return map;
 const placement=interiorOpeningPlacement(map,id,p,o.kind,o);if(!placement.valid)throw Error(placement.error);
 const moved={...o,position:placement.position};
 return rebuildDoors({...map,nodes:map.nodes.map(n=>n.id===id?{...n,interior:{...n.interior!,openings:n.interior!.openings.map(old=>old.id===openingId?moved:old)}}:n)},id);
}
export function moveInteriorVertex(map:WorldMap,id:string,from:XY,to:XY):WorldMap{
 if(!Number.isFinite(to.x)||!Number.isFinite(to.y)||to.x<2||to.x>98||to.y<2||to.y>98)throw Error('Keep the wall inside the drawing area.');
 const building=map.nodes.find(n=>n.id===id)!;if(building.interior!.outline.some(p=>distance(p,from)<eps))throw Error('Use Extend building to change the outside walls. Interior wall junctions can be dragged.');
 const outline=building.interior!.outline;
 const boundary=outline.map((a,i)=>({a,b:outline[(i+1)%outline.length]!})).find(e=>distance(nearestOnSegment(from,e.a,e.b),from)<eps);
 if(boundary)to=nearestOnSegment(to,boundary.a,boundary.b);
 if(!polygonContains(outline,to))throw Error('Keep the wall inside the house.');
 const rooms=interiorRooms(map,id),changed=rooms.map(r=>({...r,...roomGeometry(r.roomPolygon!.map(p=>distance(p,from)<eps?to:p))}));
 for(const r of changed){const p=r.roomPolygon!;if(polygonArea(p)<12)throw Error('The room would become too small.');for(let i=0;i<p.length;i++)for(let j=i+2;j<p.length;j++){if(i===0&&j===p.length-1)continue;const a=p[i]!,b=p[(i+1)%p.length]!,c=p[j]!,d=p[(j+1)%p.length]!;if(cross(a,b,c)*cross(a,b,d)<-eps&&cross(c,d,a)*cross(c,d,b)<-eps)throw Error('Walls cannot cross.');}}
 const next={...map,nodes:map.nodes.map(n=>changed.find(r=>r.id===n.id)??n)};
 const edges=interiorEdges(changed);for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){const a=edges[i]!,b=edges[j]!;if(cross(a.a,a.b,b.a)*cross(a.a,a.b,b.b)<-eps&&cross(b.a,b.b,a.a)*cross(b.a,b.b,a.b)<-eps)throw Error('Walls cannot cross.');}
 for(const n of next.nodes.filter(n=>n.interiorPosition&&changed.some(r=>r.id===n.parentId)))if(!furnitureFits(building,changed.find(r=>r.id===n.parentId)!,n))throw Error('Move the furniture before moving this wall.');
 // Keep openings at the same proportion along the edited wall.
 const oldEdges=interiorEdges(rooms);next.nodes=next.nodes.map(n=>n.id!==id?n:{...n,interior:{...n.interior!,openings:n.interior!.openings.map(o=>{const edge=oldEdges.find(e=>distance(nearestOnSegment(o.position,e.a,e.b),o.position)<eps&&(distance(e.a,from)<eps||distance(e.b,from)<eps));if(!edge)return o;const t=distance(edge.a,o.position)/distance(edge.a,edge.b),a=distance(edge.a,from)<eps?to:edge.a,b=distance(edge.b,from)<eps?to:edge.b;return {...o,position:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}};})}});
 checkOpeningWidths(next,id);return rebuildDoors(next,id);
}
export function removeInteriorWall(map:WorldMap,id:string,p:XY,protectedPlaceIds:Iterable<string>=[]):WorldMap{
 const hit=nearestInteriorEdge(map,id,p);if(!hit||hit.distance>3||hit.edge.rooms.length!==2)throw Error('Choose an interior wall between two rooms. Outside walls cannot be erased.');
 const protectedIds=new Set(protectedPlaceIds),rooms=hit.edge.rooms.map(key=>map.nodes.find(n=>n.id===key)!);if(protectedIds.has(rooms[1]!.placeId??''))rooms.reverse();const [keep,remove]=rooms as [MapNode,MapNode];
 if(protectedIds.has(remove.placeId??''))throw Error('Both rooms are used by an adventure. Keep their identities and move the wall instead.');
 if(remove.description||remove.intro||remove.instructions||remove.imageDataUrl||remove.images?.length||remove.characterIds.length||remove.visibility&&remove.visibility!=='visible')throw Error('This room has authored details. Move those details to the room you keep before removing the wall.');
 if(map.nodes.some(n=>n.parentId===remove.id&&n.kind!=='Furniture'))throw Error('This room has nested places. Move them before removing the wall.');
 const building=map.nodes.find(n=>n.id===id)!,generated=new Set(building.interior!.openings.map(o=>o.routeId));
 if(map.routes.some(r=>!generated.has(r.id)&&(r.from===remove.id||r.to===remove.id)))throw Error('This room has an authored connection. Keep the room and move the wall instead.');
 const edges=interiorEdges(rooms),boundary=edges.filter(e=>e.rooms.length===1),first=boundary.shift()!,polygon=[first.a,first.b];
 while(boundary.length){const end=polygon.at(-1)!,index=boundary.findIndex(e=>distance(e.a,end)<eps||distance(e.b,end)<eps);if(index<0)throw Error('These rooms cannot form a single outline.');const e=boundary.splice(index,1)[0]!,next=distance(e.a,end)<eps?e.b:e.a;if(distance(next,polygon[0]!)<eps)break;polygon.push(next);}
 if(polygon.length>200)throw Error('The combined room outline is too complex.');
 const removedOpenings=building.interior!.openings.filter(o=>edges.some(e=>e.rooms.length===2&&distance(o.position,nearestOnSegment(o.position,e.a,e.b))<eps)),removedIds=new Set(removedOpenings.map(o=>o.id)),removedRoutes=new Set(removedOpenings.map(o=>o.routeId));
 const next={...map,nodes:map.nodes.filter(n=>n.id!==remove.id).map(n=>n.id===keep.id?{...keep,...roomGeometry(polygon)}:n.parentId===remove.id?{...n,parentId:keep.id}:n.id===id?{...n,interior:{...n.interior!,openings:n.interior!.openings.filter(o=>!removedIds.has(o.id))}}:n),routes:map.routes.filter(r=>!removedRoutes.has(r.id))};return rebuildDoors(next,id);
}
export type { FurnitureType } from './interiorFurniture';
export function furnitureFits(building:MapNode,room:MapNode,node:MapNode){
 if(!room.roomPolygon||!node.interiorPosition)return false;
 const corners=furnitureFootprint(building,node),polygon=room.roomPolygon;
 if(!corners.every(p=>polygonContains(polygon,p)))return false;
 for(let i=0;i<corners.length;i++)for(let j=0;j<polygon.length;j++){const a=corners[i]!,b=corners[(i+1)%corners.length]!,c=polygon[j]!,d=polygon[(j+1)%polygon.length]!;if(cross(a,b,c)*cross(a,b,d)<-eps&&cross(c,d,a)*cross(c,d,b)<-eps)return false;}
 return true;
}
export function moveInteriorFurniture(map:WorldMap,id:string,nodeId:string,p:XY,rotation?:number):WorldMap{
 const building=map.nodes.find(n=>n.id===id)!,old=map.nodes.find(n=>n.id===nodeId&&n.furnitureType);if(!old)throw Error('Choose a piece of furniture.');
 const room=interiorRooms(map,id).find(r=>polygonContains(r.roomPolygon!,p));if(!room)throw Error('Keep furniture inside a room.');
 const node={...old,parentId:room.id,interiorPosition:p,...(rotation!==undefined?{rotation}:{})};if(!furnitureFits(building,room,node))throw Error('The whole piece of furniture must fit inside the room.');
 return {...map,nodes:map.nodes.map(n=>n.id===nodeId?node:n)};
}
/** Physical size is independent of zoom and of the decorative symbol on the map. */
export function resizeInterior(map:WorldMap,id:string,size:MetreSize):WorldMap{
 const parsed=InteriorSizeSchema.safeParse(size);if(!parsed.success)throw Error('Width and depth must be between 2 and 500 metres.');
 const valid=parsed.data,building=map.nodes.find(n=>n.id===id)!,old=houseSizeMeters(building);
 const width=(building.width??10)*valid.width/old.width,height=(building.height??10)*valid.depth/old.depth;
 if(width>90||height>90)throw Error('The resized building would be too large for this map.');
 const nextBuilding={...building,width,height,interior:{...building.interior!,sizeMeters:valid}};
 validateBuildingFootprint(map,nextBuilding);
 const rooms=interiorRooms(map,id);
 for(const n of map.nodes.filter(n=>n.furnitureType&&rooms.some(r=>r.id===n.parentId)))if(!furnitureFits(nextBuilding,rooms.find(r=>r.id===n.parentId)!,n))throw Error('Move furniture clear of the walls before changing the house size.');
 for(const o of nextBuilding.interior.openings){const hit=nearestInteriorEdge(map,id,o.position);if(hit&&Math.min(physicalDistance(nextBuilding,hit.edge.a,o.position),physicalDistance(nextBuilding,hit.edge.b,o.position))<openingWidthMeters(o)/2+.02)throw Error('A door or window would no longer fit on its wall.');}
 return {...map,nodes:map.nodes.map(n=>n.id===id?nextBuilding:n)};
}
function validateBuildingFootprint(map:WorldMap,building:MapNode){
 const box=polygonBounds(rectanglePoints().map(p=>mapPosition(building,p)));
 if(box.left<0||box.right>800||box.top<0||box.bottom>600)throw Error('The building would leave the settlement map.');
 for(const other of map.nodes.filter(n=>n.parentId===building.parentId&&n.id!==building.id&&n.kind.toLowerCase()==='building')){const q=polygonBounds(rectanglePoints().map(p=>mapPosition(other,p)));if(box.left<q.right&&box.right>q.left&&box.top<q.bottom&&box.bottom>q.top)throw Error('The building would overlap '+other.name+'. Move the building or its neighbour first.');}
 for(const route of map.routes.filter(r=>r.type==='road'&&r.from!==building.id&&r.to!==building.id)){const a=map.nodes.find(n=>n.id===route.from),c=map.nodes.find(n=>n.id===route.to);if(!a||!c||a.parentId!==building.parentId||c.parentId!==building.parentId)continue;const points=routePoints(route,a,c);for(let i=1;i<points.length;i++)for(let j=0;j<=30;j++){const p=curvePoint(points[i-1]!,points[i]!,j/30);if(p.x*8>box.left&&p.x*8<box.right&&p.y*6>box.top&&p.y*6<box.bottom)throw Error('The building would cross a street. Move the building or street first.');}}
}
export function placeInteriorFurniture(map: WorldMap, id: string, p: XY, type: FurnitureType, rotation = 0): WorldMap {
  const room = interiorRooms(map, id).find(item => polygonContains(item.roomPolygon!, p));
  if (!room) throw Error('Place furniture inside a room.');
  const { label, width, depth } = interiorFurniture[type];
  const node: MapNode = {
    id: crypto.randomUUID(), parentId: room.id, name: label, kind: 'Furniture', x: 50, y: 50,
    interiorPosition: p, furnitureType: type, furnitureSizeMeters: { width, depth },
    ...(rotation ? { rotation } : {}), description: '', population: '', characterIds: []
  };
  if (!furnitureFits(map.nodes.find(item => item.id === id)!, room, node)) throw Error('The whole piece of furniture must fit inside the room.');
  return { ...map, nodes: [...map.nodes, node] };
}
/** Inherit visual context only. Never copy an ancestor's hidden text into a room. */
export function inheritedMapImage(map:WorldMap,id:string,places:Array<{id:string;imageDataUrl?:string|undefined}>=[]):string|undefined{const seen=new Set<string>();let node=map.nodes.find(n=>n.id===id);while(node&&!seen.has(node.id)){seen.add(node.id);const image=node.imageDataUrl||node.images?.find(Boolean)||(node.imageDataUrl===undefined?places.find(p=>p.id===node!.placeId)?.imageDataUrl:undefined);if(image)return image;node=map.nodes.find(n=>n.id===node!.parentId);}return;}

/** Local authored facts. Room interiors need not be repeated in the global world brief. */
export function interiorPlaceBrief(map:WorldMap,id:string):string|undefined{
 const room=map.nodes.find(n=>n.id===id&&n.roomPolygon);if(!room)return;
 const house=map.nodes.find(n=>n.id===room.parentId),furniture=map.nodes.filter(n=>n.parentId===id&&n.kind==='Furniture');
 const exits=map.routes.filter(r=>r.from===id||r.bothWays&&r.to===id).map(r=>{const dest=map.nodes.find(n=>n.id===(r.from===id?r.to:r.from));return `Door to ${dest?.name??'outside'}: ${r.access}.`;});
 return [room.description,room.instructions?`Author instructions: ${room.instructions}`:'',`Authored room inside ${house?.name??'the building'}.${house?` Floor area: ${roomAreaMeters(house,room).toFixed(1)} m².`:''}`,...furniture.map(n=>`${n.name} (${n.furnitureType??'furniture'}, ${furnitureSizeMeters(n).width} × ${furnitureSizeMeters(n).depth} m). ${n.description}`),...exits,'Walls separate rooms. Use the mapped doors and their access rules; do not invent exits, occupants, hidden objects or successful actions. Hidden doors and private facts are not player knowledge.'].filter(Boolean).join('\n');
}

export function duplicateInteriorBuilding(map:WorldMap,id:string):WorldMap{
 const building=map.nodes.find(n=>n.id===id)!;const ids=new Set([id]);let size=-1;while(size!==ids.size){size=ids.size;for(const n of map.nodes)if(n.parentId&&ids.has(n.parentId))ids.add(n.id);}
 const keys=new Map([...ids].map(key=>[key,crypto.randomUUID()])),routes=map.routes.filter(r=>ids.has(r.from)&&ids.has(r.to)),routeKeys=new Map(routes.map(r=>[r.id,crypto.randomUUID()]));
 const copies=map.nodes.filter(n=>ids.has(n.id)).map(n=>({...structuredClone(n),id:keys.get(n.id)!,...(n.placeId?{placeId:crypto.randomUUID()}:{}),...(n.parentId&&ids.has(n.parentId)?{parentId:keys.get(n.parentId)!}:{}),...(n.id===id?{name:n.name+' (copy)',x:Math.min(100-(n.width??10)/2,n.x+10),y:Math.min(100-(n.height??10)/2,n.y+10)}:{}),...(n.interior?{interior:{...structuredClone(n.interior),openings:n.interior.openings.map(o=>({...o,id:crypto.randomUUID(),...(o.routeId?{routeId:routeKeys.get(o.routeId)!}:{})}))}}:{})}));
 if(!building.interior)throw Error('Choose a building with an interior.');
 return {...map,nodes:[...map.nodes,...copies],routes:[...map.routes,...routes.map(r=>({...structuredClone(r),id:routeKeys.get(r.id)!,from:keys.get(r.from)!,to:keys.get(r.to)!}))]};
}

/** Add a full side wing while preserving the existing rooms and their identities. */
export function extendInterior(map:WorldMap,id:string,side:'left'|'right'|'top'|'bottom'):WorldMap{
 const building=map.nodes.find(n=>n.id===id)!,plan=building.interior!,b=polygonBounds(plan.outline),oldSize=houseSizeMeters(building),amount=20;
 if(plan.outline.length!==4||!plan.outline.every(p=>(p.x===b.left||p.x===b.right)&&(p.y===b.top||p.y===b.bottom)))throw Error('This version extends rectangular buildings. You can still divide and furnish a custom outline.');
 const wing=side==='right'?[{x:b.right,y:b.top},{x:b.right+amount,y:b.top},{x:b.right+amount,y:b.bottom},{x:b.right,y:b.bottom}]:side==='left'?[{x:b.left-amount,y:b.top},{x:b.left,y:b.top},{x:b.left,y:b.bottom},{x:b.left-amount,y:b.bottom}]:side==='bottom'?[{x:b.left,y:b.bottom},{x:b.right,y:b.bottom},{x:b.right,y:b.bottom+amount},{x:b.left,y:b.bottom+amount}]:[{x:b.left,y:b.top-amount},{x:b.right,y:b.top-amount},{x:b.right,y:b.top},{x:b.left,y:b.top}];
 const bounds=polygonBounds([...plan.outline,...wing]),horizontal=side==='left'||side==='right',width=(building.width??10)*(horizontal?bounds.width/b.width:1),height=(building.height??10)*(!horizontal?bounds.height/b.height:1);
 if(width>90||height>90)throw Error('The building has reached the maximum size on this map.');
 const shifted=rotatePoint({x:building.x*8+(side==='right'?1:side==='left'?-1:0)*(width-(building.width??10))*4,y:building.y*6+(side==='bottom'?1:side==='top'?-1:0)*(height-(building.height??10))*3},{x:building.x*8,y:building.y*6},building.rotation??0);
 const newBuilding={...building,width,height,x:shifted.x/8,y:shifted.y/6};
 const corners=rectanglePoints().map(p=>mapPosition(newBuilding,p)),box=polygonBounds(corners);if(box.left<0||box.right>800||box.top<0||box.bottom>600)throw Error('The extension would leave the settlement map.');
 for(const other of map.nodes.filter(n=>n.parentId===building.parentId&&n.id!==id&&n.kind.toLowerCase()==='building')){const q=polygonBounds(rectanglePoints().map(p=>mapPosition(other,p)));if(box.left<q.right&&box.right>q.left&&box.top<q.bottom&&box.bottom>q.top)throw Error('The extension would overlap '+other.name+'. Move the building or its neighbour first.');}
 for(const route of map.routes.filter(r=>r.type==='road'&&r.from!==id&&r.to!==id)){const a=map.nodes.find(n=>n.id===route.from),c=map.nodes.find(n=>n.id===route.to);if(!a||!c||a.parentId!==building.parentId||c.parentId!==building.parentId)continue;const points=routePoints(route,a,c);for(let i=1;i<points.length;i++)for(let j=0;j<=30;j++){const p=curvePoint(points[i-1]!,points[i]!,j/30),x=p.x*8,y=p.y*6;if(x>box.left&&x<box.right&&y>box.top&&y<box.bottom)throw Error('The extension would cross a street. Move the building or street first.');}}
 const transform=(p:XY)=>({x:10+(p.x-bounds.left)*80/bounds.width,y:10+(p.y-bounds.top)*80/bounds.height}),newOutline=rectanglePoints().map(p=>({x:10+p.x*80,y:10+p.y*80})),room=newRoom(id,wing,'New wing'),all=[...map.nodes,room];
 const roomIds=new Set(interiorRooms({...map,nodes:all},id).map(r=>r.id));
 const moveOpening=(p:XY)=>side==='right'&&Math.abs(p.x-b.right)<eps?{...p,x:bounds.right}:side==='left'&&Math.abs(p.x-b.left)<eps?{...p,x:bounds.left}:side==='bottom'&&Math.abs(p.y-b.bottom)<eps?{...p,y:bounds.bottom}:side==='top'&&Math.abs(p.y-b.top)<eps?{...p,y:bounds.top}:p;
 let next:WorldMap={...map,nodes:all.map(n=>n.id===id?{...newBuilding,interior:{...plan,sizeMeters:{width:oldSize.width*bounds.width/b.width,depth:oldSize.depth*bounds.height/b.height},outline:newOutline,footprintEdited:true,openings:plan.openings.map(o=>({...o,position:transform(moveOpening(o.position))}))}}:roomIds.has(n.id)?{...n,...roomGeometry(n.roomPolygon!.map(transform))}:n.interiorPosition&&roomIds.has(n.parentId??'')?{...n,interiorPosition:transform(n.interiorPosition)}:n)};
 // New external doors are not invented. Add an interior door to connect the wing.
 next=rebuildDoors(next,id);return next;
}
