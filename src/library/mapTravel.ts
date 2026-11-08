import { terrainTravel } from "./mapTerrain";
import type { MapNode, WorldMap } from "./worldMap";
/** Distance between rectangle edges, in visible 40px grid cells. */
export function travelGap(a:MapNode,b:MapNode):number {
  const dx=Math.max(0,Math.abs(a.x-b.x)-((a.settlementMarker?0:a.width??15)+(b.settlementMarker?0:b.width??15))/2)*8;
  const dy=Math.max(0,Math.abs(a.y-b.y)-((a.settlementMarker?0:a.height??(44/6))+(b.settlementMarker?0:b.height??(44/6)))/2)*6;
  return Math.hypot(dx,dy)/40;
}
/** Scale estimates from a stable snapshot; descriptive travel conditions stay unchanged. */
export function rescaleTravelTimes(before:WorldMap,after:WorldMap):WorldMap {
  return {...after,routes:after.routes.map(route=>{
    const original=before.routes.find(r=>r.id===route.id);
    if(!original||original.mode.toLowerCase()==="door")return route;
    const a=before.nodes.find(n=>n.id===route.from),b=before.nodes.find(n=>n.id===route.to);
    const nextA=after.nodes.find(n=>n.id===route.from),nextB=after.nodes.find(n=>n.id===route.to);
    if(!a||!b||!nextA||!nextB||a.parentId!==b.parentId)return route;
    const distance=travelGap(a,b),nextDistance=travelGap(nextA,nextB);
    if(distance<.01)return route;
    const match=original.duration.match(/^\s*(\d+(?:\.\d+)?)\s*(minute|hour|day|week)s?\s*$/i);
    if(!match)return route;
    const value=Math.max(0,Math.round(Number(match[1])*nextDistance/distance*10)/10);
    return {...route,duration:`${value} ${match[2]!.toLowerCase()}${value===1?"":"s"}`};
  })};
}

export function applyMapScale(map:WorldMap,level:string,minutesPerCell:number):WorldMap {
  return {...map,routes:map.routes.map(route=>{
    const a=map.nodes.find(n=>n.id===route.from),b=map.nodes.find(n=>n.id===route.to);
    if(!a||!b||(a.parentId??"")!==level||(b.parentId??"")!==level||route.mode.toLowerCase()==="door"||route.manualTime)return route;
    const terrain=terrainTravel(map,route,a,b);
    if(terrain.blocked)return {...route,duration:"Blocked by terrain"};
    const distanceScale=level?map.nodes.find(n=>n.id===level)?.distanceScale:map.distanceScale;
    const speed=route.speedKmh??(["boat","ferry"].includes(route.type??"")?8:5);
    const minutes=distanceScale?terrain.weightedCells*distanceScale.value*distanceScale.kmPerUnit/speed*60:terrain.weightedCells*minutesPerCell;
    const unit=minutes>=1440?"days":minutes>=60?"hours":"minutes";
    const amount=Math.round(minutes/(unit==="days"?1440:unit==="hours"?60:1)*10)/10;
    return {...route,duration:amount+" "+(amount===1?unit.slice(0,-1):unit)};
  })};
}
