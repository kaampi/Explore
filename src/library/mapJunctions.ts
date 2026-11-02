import type { WorldMap, MapNode } from "./worldMap";
import { curvePoint, splitEdge, type XY } from "./mapShapes";
import { routeLength, routePoints } from "./mapRoutes";
import { parseTravelMinutes, travelDaysFromDuration } from "../state/gameClock";
import { findCrossings } from "./mapCrossings";

/** Split the actual graph edge, not just its drawn curve. Both pieces retain direction and conditions. */
export function attachRoadJunction(map:WorldMap,routeId:string,point:XY,reuseId?:string):{map:WorldMap;nodeId:string}{
  const route=map.routes.find(r=>r.id===routeId),a=map.nodes.find(n=>n.id===route?.from),b=map.nodes.find(n=>n.id===route?.to);
  if(!route||!a||!b||route.mode.toLowerCase()==="door")throw new Error("Choose a road or path at this map level.");
  const points=routePoints(route,a,b);
  let hit={i:0,t:.5,d:Infinity};
  for(let i=0;i<points.length-1;i++)for(let j=0;j<=200;j++){
    const p=curvePoint(points[i]!,points[i+1]!,j/200),d=Math.hypot((p.x-point.x)*8,(p.y-point.y)*6);
    if(d<hit.d)hit={i,t:j/200,d};
  }
  const projected=curvePoint(points[hit.i]!,points[hit.i+1]!,hit.t);
  if(projected.x<0||projected.x>100||projected.y<0||projected.y>100)throw new Error("Choose a junction inside the map boundary.");
  const near=(p:XY,q:XY)=>Math.hypot((p.x-q.x)*8,(p.y-q.y)*6)<10;
  if(near(projected,points[0]!))return {map,nodeId:a.id};
  if(near(projected,points[points.length-1]!))return {map,nodeId:b.id};
  const reused=map.nodes.find(n=>n.id===reuseId&&n.isJunction&&n.parentId===a.parentId&&near(n,projected))??map.nodes.find(n=>n.isJunction&&n.parentId===a.parentId&&near(n,projected));
  const id=reused?.id??crypto.randomUUID();
  let number=1;while(map.nodes.some(n=>n.name===`Junction ${number}`))number++;
  const node:MapNode=reused??{id,placeId:id,name:`Junction ${number}`,kind:"Junction",isJunction:true,x:projected.x,y:projected.y,width:1,height:1,
    description:"A junction where mapped routes meet.",population:"",characterIds:[],...(a.parentId?{parentId:a.parentId}:{})};
  const split=splitEdge(points,hit.i,Math.max(.00001,Math.min(.99999,hit.t)));
  const left=split.slice(0,hit.i+2),right=split.slice(hit.i+1);
  const ratio=routeLength(left)/(routeLength(left)+routeLength(right)||1);
  const duration=parseTravelMinutes(route.duration),days=travelDaysFromDuration(route.duration);
  const first=duration!==undefined?Math.round(duration*ratio):undefined,second=duration!==undefined&&first!==undefined?duration-first:undefined;
  const text=(minutes:number|undefined)=>minutes===undefined?route.duration:days!==undefined?`${Number((minutes/1440).toFixed(8))} days`:`${minutes} minutes`;
  const secondId=crypto.randomUUID();
  const start={...route,to:id,toAnchor:{x:.5,y:.5},geometry:left,duration:text(first)};
  const end={...route,id:secondId,from:id,fromAnchor:{x:.5,y:.5},geometry:right,duration:text(second)};
  // Drop opposite-end anchors inherited from the old route only where explicitly replaced above.
  const next:WorldMap={...map,nodes:reused?map.nodes:[...map.nodes,node],routes:map.routes.flatMap(r=>r.id===routeId?[start,end]:[r])};
  const oldCrossings=findCrossings(map).filter(c=>c.routeId===routeId);
  const configs=map.crossings??[];
  const remapped=findCrossings(next).filter(c=>c.routeId===routeId||c.routeId===secondId).flatMap(c=>{
    const original=oldCrossings.filter(old=>old.riverId===c.riverId).sort((p,q)=>Math.hypot(p.x-c.x,p.y-c.y)-Math.hypot(q.x-c.x,q.y-c.y))[0];
    const config=original&&configs.find(v=>v.id===original.id);
    return config?[{...config,id:c.id,routeId:c.routeId,riverId:c.riverId}]:[];
  });
  if(map.crossings)next.crossings=[...configs.filter(c=>c.routeId!==routeId),...remapped];
  return {map:next,nodeId:id};
}
