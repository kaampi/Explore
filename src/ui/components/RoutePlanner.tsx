import { plannerRoutes, samplePlannerRoute, type PlannerRoute } from "@library/plannerRoutes";
import { useEffect, useMemo, useRef, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import type { RealmTemplate } from "@library/LibrarySchema";
import type { Session } from "@state/StateSchema";
import { formatGameTime } from "@state/gameClock";
import { findCrossings } from "@library/mapCrossings";
import { mapPosition } from "@library/mapGeometry";
import { shapePath, rectanglePoints } from "@library/mapShapes";
import { openRoutePath, routePoints } from "@library/mapRoutes";
import { plannedTimings, pointOnPlannedRoute, projectToPlannedRoute, validatePlannedStops, type RoutePlan, type RouteStop } from "@library/routePlan";
import "./routePlanner.css";

type EditStop = RouteStop & {key:string};
const cleanStops=(stops:EditStop[]):RouteStop[]=>stops.map(({key:_key,...stop})=>stop);

export function RoutePlanner({repo,session,onClose,onStart}: {
  repo:IndexedDBRepository; session:Session; onClose:()=>void;
  onStart:(destinationId:string,destinationName:string,plan:RoutePlan)=>void;
}) {
  const dialog=useRef<HTMLDialogElement>(null),svg=useRef<SVGSVGElement>(null);
  const dragging=useRef<string|null>(null),drawing=useRef(false);
  const [world,setWorld]=useState<RealmTemplate|null>(null),[loaded,setLoaded]=useState(false);
  const [routeId,setRouteId]=useState(""),[stops,setStops]=useState<EditStop[]>([]),[selected,setSelected]=useState("");
  const [message,setMessage]=useState(""),[drawTo,setDrawTo]=useState<{x:number;y:number}|null>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  useEffect(()=>{let active=true;void repo.listRealms().then(worlds=>{
    if(active){setWorld(worlds.find(w=>w.worldMap?.nodes.some(n=>n.placeId===session.scene?.placeId))??null);setLoaded(true);}
  }).catch(()=>{if(active){setMessage("Could not load the map.");setLoaded(true);}});return()=>{active=false;};},[repo,session.scene?.placeId]);
  const map=world?.worldMap,origin=map?.nodes.find(n=>n.placeId===session.scene?.placeId);
  const nodes=map?.nodes.filter(n=>n.parentId===origin?.parentId&&(!n.visibility||n.visibility==="visible"||n.id===origin?.id))??[];
  const visibleIds=new Set(nodes.map(n=>n.id));
  const routes=map&&origin?.placeId?plannerRoutes(map,origin.placeId):[];
  const route=routes.find(r=>r.id===routeId),destination=route&&map?.nodes.find(n=>n.id===(route.from===origin?.id?route.to:route.from));
  const total=route?.workMinutes;
  const samples=useMemo(()=>map&&origin&&route?samplePlannerRoute(map,route):[],[map,origin,routeId]);
  const selectedRouteIds=new Set(route?.legs.map(l=>l.routeId)??[]);
  const reachableRouteIds=new Set(routes.flatMap(r=>r.legs.map(l=>l.routeId)));
  const crossings=map?findCrossings(map).filter(c=>reachableRouteIds.has(c.routeId)&&(!route||selectedRouteIds.has(c.routeId))):[];
  const allCrossings=map?findCrossings(map).filter(c=>reachableRouteIds.has(c.routeId)):[];
  const optionForRoute=(id:string)=>routes.filter(r=>r.legs.some(l=>l.routeId===id)).sort((a,b)=>a.legs.length-b.legs.length||a.workMinutes-b.workMinutes)[0];
  const start=session.gameClock?.totalMinutes??480;
  const timings=total?plannedTimings(total,cleanStops(stops),start):[];
  const error=total?validatePlannedStops(stops,total):"Choose a route with an explicit travel time.";
  const selectedStop=stops.find(s=>s.key===selected);

  function chooseRoute(id:string){
    const chosen=routes.find(r=>r.id===id);setRouteId(id);setSelected("");setMessage("");
    const work=chosen?.workMinutes;
    const suggested:EditStop[]=[];
    if(work)for(let minute=480;minute<work&&suggested.length<100;minute+=480)suggested.push({key:crypto.randomUUID(),fraction:minute/work,label:`Overnight stop ${suggested.length+1}`,kind:"overnight"});
    setStops(suggested);
  }
  function coordinates(event:{clientX:number;clientY:number}){
    const matrix=svg.current?.getScreenCTM();
    if(!matrix)return {x:0,y:0};
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    return {x:point.x/8,y:point.y/6};
  }
  function addStop(point:{x:number;y:number},choice:PlannerRoute|undefined=route,base:EditStop[]=stops){
    const total=choice?.workMinutes;if(!map||!choice||!total||base.length>=100)return;
    const samples=samplePlannerRoute(map,choice),crossings=allCrossings.filter(c=>choice.legs.some(l=>l.routeId===c.routeId));
    let projected=projectToPlannedRoute(samples,point),label=`Stop ${base.length+1}`,description:string|undefined;
    const crossing=crossings.find(c=>Math.hypot((c.x-projected.x)*8,(c.y-projected.y)*6)<15);
    if(crossing&&map){
      projected=projectToPlannedRoute(samples,crossing);
      const info=map.crossings?.find(c=>c.id===crossing.id),river=map.nodes.find(n=>n.id===crossing.riverId)?.name??"river";
      label=`${info?.type==="bridge"?"Bridge":info?.type==="ferry"?"Ferry":"Crossing"} at ${river}`;
      description=info?.description;
    }
    const fraction=Math.max(1/total,Math.min(1-1/total,projected.fraction));
    const key=crypto.randomUUID();
    const next=[...base.filter(s=>Math.abs(s.fraction-fraction)*total>=1),{key,fraction,label,kind:"pause" as const,...(description?{description}: {})}].sort((a,b)=>a.fraction-b.fraction);
    if(validatePlannedStops(next,total)){setMessage("This stop is too close to another stop or an endpoint.");return;}
    setRouteId(choice.id);setStops(next);setSelected(key);dragging.current=key;setMessage("");
  }
  function addCrossing(id:string){
    const crossing=allCrossings.find(c=>c.id===id);if(!crossing)return;
    const choice=route?.legs.some(l=>l.routeId===crossing.routeId)?route:optionForRoute(crossing.routeId);
    if(!choice)return;
    const base=choice.id===routeId?stops:[];
    addStop(crossing,choice,base);dragging.current=null;
  }
  function updateStop(change:Partial<RouteStop>){setStops(current=>current.map(s=>s.key===selected?{...s,...change}:s));}

  return <dialog ref={dialog} className="route-planner" aria-labelledby="route-planner-title" onCancel={e=>{e.preventDefault();onClose();}}>
    <header><div><span className="route-planner__eyebrow">YOUR NEXT JOURNEY</span><h2 id="route-planner-title">Plan your route</h2><p>Drag from your position to a connected destination. Add stops on the selected route and drag them to adjust each stage.</p></div><button type="button" onClick={onClose} aria-label="Close route planner">Close ×</button></header>
    {!loaded?<p>Loading map…</p>:!map||!origin?<p>No saved map is connected to your current place.</p>:<div className="route-planner__layout">
      <div className="route-planner__canvas">
        <svg ref={svg} viewBox="0 0 800 600" role="group" aria-label="Journey planning map" onPointerMove={e=>{
          const point=coordinates(e);
          if(drawing.current){setDrawTo(point);return;}
          if(!dragging.current||!total)return;
          const fraction=Math.max(1/total,Math.min(1-1/total,projectToPlannedRoute(samples,point).fraction));
          setStops(current=>{const next=current.map(s=>s.key===dragging.current?{...s,fraction}:s).sort((a,b)=>a.fraction-b.fraction);return validatePlannedStops(next,total)?current:next;});
        }} onPointerUp={e=>{
          if(drawing.current){
            const point=coordinates(e);
            const target=routes.find(r=>{const n=map.nodes.find(n=>n.id===(r.from===origin.id?r.to:r.from));return n&&Math.hypot((n.x-point.x)*8,(n.y-point.y)*6)<45;});
            if(target)chooseRoute(target.id);else setMessage("Drop on a destination connected to your current place.");
          }
          dragging.current=null;drawing.current=false;setDrawTo(null);
        }} onPointerCancel={()=>{dragging.current=null;drawing.current=false;setDrawTo(null);}}>
          <defs><pattern id="route-plan-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" opacity=".06"/></pattern></defs>
          <rect width="800" height="600" fill={map.background??"#f6f4ec"}/><rect width="800" height="600" fill="url(#route-plan-grid)"/>
          {nodes.map(n=><g key={n.id}><path d={shapePath(n.shape??rectanglePoints(),p=>mapPosition(n,p))} fill={n.color??(/forest/i.test(n.kind)?"#c4d7b0":/river|lake/i.test(n.kind)?"#aacfdc":"#e8e2d2")} stroke="#8d9585" strokeWidth="1"/>{n.isJunction?<circle cx={n.x*8} cy={n.y*6} r="4" fill="#bacce1" stroke="#231f20"/>:<text x={n.x*8} y={n.y*6} textAnchor="middle" className="route-planner__map-label">{n.name}</text>}</g>)}
          {map.routes.filter(r=>visibleIds.has(r.from)&&visibleIds.has(r.to)).map(r=>{const a=map.nodes.find(n=>n.id===r.from)!,b=map.nodes.find(n=>n.id===r.to)!,path=openRoutePath(routePoints(r,a,b)),available=Boolean(optionForRoute(r.id));return <g key={r.id}>
            <path d={path} fill="none" stroke={selectedRouteIds.has(r.id)?"#866064":"#92998b"} strokeWidth={selectedRouteIds.has(r.id)?4:2} strokeDasharray={r.access==="open"?undefined:"6 5"}/>
            {available&&<path d={path} fill="none" stroke="transparent" strokeWidth="20" role="button" tabIndex={0} aria-label={`Plan route via ${map.nodes.find(n=>n.id===optionForRoute(r.id)?.to)?.name}`} onKeyDown={e=>{if(e.key==="Enter"){const option=optionForRoute(r.id);if(option)chooseRoute(option.id);}}} onPointerDown={e=>{e.stopPropagation();if(!selectedRouteIds.has(r.id)){const option=optionForRoute(r.id);if(option)chooseRoute(option.id);return;}addStop(coordinates(e));svg.current?.setPointerCapture(e.pointerId);}}/>}
          </g>;})}
          {crossings.map(c=><g key={c.id} role="button" tabIndex={0} aria-label={`Add stop: ${map.crossings?.find(info=>info.id===c.id)?.type??"crossing"}`} onKeyDown={e=>{if(e.key==="Enter"){addCrossing(c.id);dragging.current=null;}}} onPointerDown={e=>{e.stopPropagation();addCrossing(c.id);svg.current?.setPointerCapture(e.pointerId);}}><circle cx={c.x*8} cy={c.y*6} r="9" fill="#fff" stroke="#49788c" strokeWidth="2"/><path d={`M ${c.x*8-5} ${c.y*6} h 10`} stroke="#49788c" strokeWidth="2"/></g>)}
          {drawTo&&<path d={`M ${origin.x*8} ${origin.y*6} L ${drawTo.x*8} ${drawTo.y*6}`} stroke="#866064" strokeWidth="3" strokeDasharray="6 4" fill="none" pointerEvents="none"/>}
          <g onPointerDown={e=>{e.stopPropagation();drawing.current=true;setDrawTo({x:origin.x,y:origin.y});svg.current?.setPointerCapture(e.pointerId);}}><circle cx={origin.x*8} cy={origin.y*6} r="12" fill="#367561" stroke="#fff" strokeWidth="3"/><title>You are here — drag to a connected destination</title></g>
          {stops.map((s,i)=>{const p=pointOnPlannedRoute(samples,s.fraction);return <g key={s.key} className="route-planner__stop" role="button" tabIndex={0} aria-label={`Stop ${i+1}: ${s.label}`} onKeyDown={e=>{if(e.key==="Enter")setSelected(s.key);}} onPointerDown={e=>{e.stopPropagation();setSelected(s.key);dragging.current=s.key;svg.current?.setPointerCapture(e.pointerId);}}><circle cx={p.x*8} cy={p.y*6} r={selected===s.key?13:11} fill={s.kind==="overnight"?"#866064":"#fff"} stroke="#866064" strokeWidth="2"/><text x={p.x*8} y={p.y*6+4} textAnchor="middle" fill={s.kind==="overnight"?"#fff":"#654a4d"} fontSize="12" pointerEvents="none">{i+1}</text></g>;})}
        </svg>
        <p className="route-planner__legend">● You are here · Numbered points are stops · Click a crossing to stop there</p>
      </div>
      <aside>
        <label>Destination<select value={routeId} onChange={e=>chooseRoute(e.target.value)}><option value="">Choose a connected route</option>{routes.map(r=>{const target=map.nodes.find(n=>n.id===(r.from===origin.id?r.to:r.from));return <option key={r.id} value={r.id}>{target?.name} · {r.via?`via ${r.via} · `:""}{r.type??r.mode} · {r.duration||"time unspecified"}</option>;})}{nodes.filter(n=>n.placeId&&n.id!==origin.id&&!routes.some(r=>r.to===n.id)).map(n=><option key={n.id} disabled value={`unreachable:${n.id}`}>{n.name} — no available mapped route</option>)}</select></label>
        {allCrossings.length>0&&<label>Add a crossing stop<select value="" onChange={e=>addCrossing(e.target.value)}><option value="">Choose a bridge, ferry or crossing</option>{allCrossings.map(c=><option key={c.id} value={c.id}>{map.crossings?.find(info=>info.id===c.id)?.type==="ferry"?"Ferry":map.crossings?.find(info=>info.id===c.id)?.type==="bridge"?"Bridge":"Crossing"} at {map.nodes.find(n=>n.id===c.riverId)?.name??"river"}</option>)}</select></label>}
        {!routes.length&&<p>No visible connections at this map level. Add and save a connection in Map Studio first.</p>}
        {route&&<><p>Departure: <strong>{formatGameTime(start)}</strong></p><p>{route.description||"No surroundings have been described for this route."}</p>
          {selectedStop&&<fieldset><legend>Edit stop</legend><label>Name<input value={selectedStop.label} maxLength={120} onChange={e=>updateStop({label:e.target.value})}/></label><label>Stop type<select value={selectedStop.kind} onChange={e=>updateStop({kind:e.target.value as RouteStop["kind"]})}><option value="pause">Pause — continue when ready</option><option value="overnight">Overnight — rest before continuing</option></select></label><label>Position along route<input type="range" aria-label="Stop position" min="1" max="99" step="0.1" value={selectedStop.fraction*100} onChange={e=>{const fraction=Number(e.target.value)/100;const next=stops.map(s=>s.key===selected?{...s,fraction}:s).sort((a,b)=>a.fraction-b.fraction);if(total&&!validatePlannedStops(next,total))setStops(next);}}/></label><button type="button" onClick={()=>{setStops(stops.filter(s=>s.key!==selected));setSelected("");}}>Remove stop</button></fieldset>}
          <ol className="route-planner__stages">{timings.map((t,i)=><li key={i}><button type="button" onClick={()=>setSelected(stops[i]?.key??"")}><strong>{i===stops.length?destination?.name:t.label}</strong><span>{Math.round(t.travelMinutes/6)/10} h travel · {formatGameTime(t.arrival)}</span>{t.kind==="overnight"&&<span>Overnight · depart {formatGameTime(t.departure)}</span>}{t.travelMinutes>480&&<span className="route-planner__warning">Long stage: over 8 hours without a planned stop</span>}</button>{stops[i]&&<button type="button" className="route-planner__remove" aria-label={`Remove stop: ${t.label}`} onClick={()=>{setStops(current=>current.filter(stop=>stop.key!==stops[i]?.key));if(selected===stops[i]?.key)setSelected("");}}>Remove stop</button>}</li>)}</ol>
          <button type="button" onClick={()=>{if(total){const next:EditStop[]=[];for(let m=480;m<total&&next.length<100;m+=480)next.push({key:crypto.randomUUID(),fraction:m/total,label:`Overnight stop ${next.length+1}`,kind:"overnight"});setStops(next);setSelected("");}}}>Suggest daily stops</button>
          <p className="route-planner__note">Times are estimates. Overnight estimates include rest until 08:00, with at least 8 hours of rest. Waiting or talking at a stop can change the actual schedule.</p>
          {route.access!=="open"&&<p role="alert">This route is {route.access}. Change its access in Map Studio before travelling.</p>}
        </>}
        {message&&<p role="status">{message}</p>}{route&&error&&<p role="alert">{error}</p>}
        <button className="route-planner__start" type="button" disabled={!route||route.access!=="open"||!destination?.placeId||Boolean(error)||stops.some(s=>!s.label.trim())} onClick={()=>{
          if(!world||!origin?.placeId||!destination?.placeId)return;
          onStart(destination.placeId,destination.name,{worldId:world.id,routeId:route!.legs[0]!.routeId,fromPlaceId:origin.placeId,legs:route!.legs,stops:cleanStops(stops)});
        }}>Start journey</button>
      </aside>
    </div>}
  </dialog>;
}
