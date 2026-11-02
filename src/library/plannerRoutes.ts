import type { WorldMap } from "./worldMap";
import { parseTravelMinutes, travelDaysFromDuration } from "../state/gameClock";
import { samplePlannedRoute, type RoutePlan, type RouteSample } from "./routePlan";

export type PlannerRoute=WorldMap["routes"][number]&{legs:NonNullable<RoutePlan["legs"]>;workMinutes:number;via:string};
export function routeWorkMinutes(duration:string):number|undefined{
  const days=travelDaysFromDuration(duration);return days!==undefined?Math.round(days*480):parseTravelMinutes(duration);
}

/** Reachable points, including those beyond road junctions; never invent missing graph edges. */
export function plannerRoutes(map:WorldMap,fromPlaceId:string):PlannerRoute[]{
  const origin=map.nodes.find(n=>n.placeId===fromPlaceId);if(!origin)return [];
  const known=map.nodes.filter(n=>n.parentId===origin.parentId&&(!n.visibility||n.visibility==="visible"||n.id===origin.id));
  const ids=new Set(known.map(n=>n.id));
  const usable=map.routes.filter(r=>ids.has(r.from)&&ids.has(r.to)&&r.mode.toLowerCase()!=="door"&&r.access==="open"&&(routeWorkMinutes(r.duration)??-1)>=0);
  type Path={cost:number;legs:NonNullable<RoutePlan["legs"]>;names:string[]};
  const best=new Map<string,Path>([[origin.id,{cost:0,legs:[],names:[]}]]),done=new Set<string>();
  while(true){
    const current=[...best.entries()].filter(([id])=>!done.has(id)).sort((a,b)=>a[1].cost-b[1].cost)[0];
    if(!current)break;const [id,path]=current;done.add(id);
    if(path.legs.length>=100)continue;
    for(const r of usable.filter(r=>r.from===id||r.bothWays&&r.to===id)){
      const target=known.find(n=>n.id===(r.from===id?r.to:r.from)),source=known.find(n=>n.id===id);
      if(!target?.placeId||!source?.placeId||done.has(target.id))continue;
      const cost=path.cost+routeWorkMinutes(r.duration)!;
      if(cost<(best.get(target.id)?.cost??Infinity))best.set(target.id,{cost,legs:[...path.legs,{routeId:r.id,fromPlaceId:source.placeId,toPlaceId:target.placeId}],names:[...path.names,target.name]});
    }
  }
  const options:PlannerRoute[]=[];
  // Preserve alternatives for direct connections instead of silently selecting only the shortest.
  for(const r of usable.filter(r=>r.from===origin.id||r.bothWays&&r.to===origin.id)){
    const target=known.find(n=>n.id===(r.from===origin.id?r.to:r.from));if(!target?.placeId)continue;
    options.push({...r,from:origin.id,to:target.id,legs:[{routeId:r.id,fromPlaceId,toPlaceId:target.placeId}],workMinutes:routeWorkMinutes(r.duration)!,via:""});
  }
  for(const [id,path] of best){
    if(id===origin.id||path.legs.length<2||path.cost<=0||options.some(o=>o.to===id))continue;
    const first=usable.find(r=>r.id===path.legs[0]!.routeId)!;
    const description=path.legs.map(l=>usable.find(r=>r.id===l.routeId)?.description?.trim()).filter(Boolean).join("\n");
    options.push({...first,id:`path:${id}`,from:origin.id,to:id,duration:`${Math.round(path.cost/6)/10} hours`,description,
      legs:path.legs,workMinutes:path.cost,via:path.names.slice(0,-1).join(" → ")});
  }
  return options;
}

export function samplePlannerRoute(map:WorldMap,route:PlannerRoute):RouteSample[]{
  let elapsed=0;const samples:RouteSample[]=[];
  for(const leg of route.legs){
    const actual=map.routes.find(r=>r.id===leg.routeId);if(!actual)continue;
    const work=routeWorkMinutes(actual.duration)??0;
    samples.push(...samplePlannedRoute(map,leg.routeId,leg.fromPlaceId).map(p=>({...p,fraction:(elapsed+p.fraction*work)/(route.workMinutes||1)})));
    elapsed+=work;
  }
  return samples;
}
