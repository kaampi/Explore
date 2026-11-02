import { z } from "zod";
import type { WorldMap } from "./worldMap";
import { routePoints } from "./mapRoutes";
import { curvePoint } from "./mapShapes";

export const RouteStopSchema = z.object({
  fraction:z.number().gt(0).lt(1), label:z.string().trim().min(1).max(120),
  kind:z.enum(["pause","overnight"]), description:z.string().max(2000).optional()
});
export const RoutePlanSchema = z.object({
  worldId:z.string().min(1), routeId:z.string().min(1), fromPlaceId:z.string().min(1),
  legs:z.array(z.object({routeId:z.string().min(1),fromPlaceId:z.string().min(1),toPlaceId:z.string().min(1)})).min(1).max(100).optional(),
  stops:z.array(RouteStopSchema).max(100)
}).superRefine((plan,ctx)=>{
  if(plan.legs){
    if(plan.legs[0]!.routeId!==plan.routeId||plan.legs[0]!.fromPlaceId!==plan.fromPlaceId)ctx.addIssue({code:"custom",message:"The route must start at the current place."});
    for(let i=1;i<plan.legs.length;i++)if(plan.legs[i-1]!.toPlaceId!==plan.legs[i]!.fromPlaceId)ctx.addIssue({code:"custom",message:"Route legs must form a continuous path."});
  }
  for(let i=1;i<plan.stops.length;i++)if(plan.stops[i]!.fraction<=plan.stops[i-1]!.fraction)
    ctx.addIssue({code:"custom",message:"Stops must be ordered along the route."});
});
export type RouteStop = z.infer<typeof RouteStopSchema>;
export type RoutePlan = z.infer<typeof RoutePlanSchema>;
export type RouteSample = {x:number;y:number;fraction:number};

export function samplePlannedRoute(map:WorldMap,routeId:string,fromPlaceId:string):RouteSample[]{
  const route=map.routes.find(r=>r.id===routeId),a=map.nodes.find(n=>n.id===route?.from),b=map.nodes.find(n=>n.id===route?.to);
  if(!route||!a||!b)return [];
  const points=routePoints(route,a,b),samples:Array<{x:number;y:number}>=[];
  for(let i=0;i<points.length-1;i++)for(let j=0;j<50;j++)samples.push(curvePoint(points[i]!,points[i+1]!,j/50));
  samples.push(points[points.length-1]!);
  if(b.placeId===fromPlaceId)samples.reverse();
  const distances=[0];
  for(let i=1;i<samples.length;i++){const p=samples[i-1]!,q=samples[i]!;distances.push(distances[i-1]!+Math.hypot((q.x-p.x)*8,(q.y-p.y)*6));}
  const total=distances[distances.length-1]??0;
  return samples.map((p,i)=>({...p,fraction:total?distances[i]!/total:0}));
}

export function pointOnPlannedRoute(samples:RouteSample[],fraction:number):RouteSample{
  const upper=samples.findIndex(p=>p.fraction>=fraction);
  if(upper<=0)return samples[upper<0?samples.length-1:0]??{x:0,y:0,fraction:0};
  const a=samples[upper-1]!,b=samples[upper]!,t=(fraction-a.fraction)/(b.fraction-a.fraction||1);
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,fraction};
}

export function projectToPlannedRoute(samples:RouteSample[],point:{x:number;y:number}):RouteSample{
  let best={x:0,y:0,fraction:0},distance=Infinity;
  for(let i=1;i<samples.length;i++){
    const a=samples[i-1]!,b=samples[i]!,dx=(b.x-a.x)*8,dy=(b.y-a.y)*6;
    const t=Math.max(0,Math.min(1,(((point.x-a.x)*8)*dx+((point.y-a.y)*6)*dy)/(dx*dx+dy*dy||1)));
    const candidate={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,fraction:a.fraction+(b.fraction-a.fraction)*t};
    const d=Math.hypot((point.x-candidate.x)*8,(point.y-candidate.y)*6);
    if(d<distance){best=candidate;distance=d;}
  }
  return best;
}

export function validatePlannedStops(stops:RouteStop[],total:number):string|undefined{
  let last=0;
  for(const stop of [...stops,{fraction:1}]){
    const next=Math.round(total*stop.fraction);
    if(next<=last)return "Leave at least one travel minute between stops and the destination.";
    last=next;
  }
  return;
}

export function plannedTimings(total:number,stops:RouteStop[],start:number){
  let previous=0,time=start;
  return [...stops,{fraction:1,label:"Arrival",kind:"pause" as const}].map(stop=>{
    const work=Math.round(total*stop.fraction),travelMinutes=work-previous;previous=work;
    const arrival=time+travelMinutes;
    time=arrival;
    if(stop.kind==="overnight"){
      const earliest=arrival+480;
      time=Math.floor(earliest/1440)*1440+480;
      if(time<earliest)time+=1440;
    }
    return {...stop,travelMinutes,arrival,departure:time};
  });
}
