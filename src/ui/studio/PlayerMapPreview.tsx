import { BrushTerrain } from "./ForestBrush";
import { useState } from "react";
import type { WorldMap } from "@library/worldMap";
import { knownMapNodes } from "@library/mapVisibility";
import { rectanglePoints,shapePath } from "@library/mapShapes";
import { mapPosition } from "@library/mapGeometry";
import { openRoutePath,routePoints } from "@library/mapRoutes";
export function PlayerMapPreview({map,level}:{map:WorldMap;level:string}){
 const [discovered,setDiscovered]=useState<Set<string>>(new Set());
 const known=knownMapNodes(map,discovered),nodes=known.filter(n=>(n.parentId??"")===level||n.isArea&&known.some(p=>p.id===n.parentId&&(p.parentId??"")===level));
 return <section className="world-map__workspace"><div className="world-map__canvas-heading"><strong>Player map preview</strong><span>Only known places are shown</span></div><svg viewBox="0 0 800 600" className="world-map__canvas" role="img" aria-label="Map showing only discovered places">
 {map.routes.map(r=>{const a=nodes.find(n=>n.id===r.from),b=nodes.find(n=>n.id===r.to);return a&&b&&r.access!=="hidden"?<path key={r.id} d={openRoutePath(routePoints(r,a,b))} stroke="#627068" fill="none" strokeWidth="2"/>:null;})}
 {nodes.map(n=><g key={n.id}>{n.brush?<BrushTerrain mountains={nodes.filter(m=>m.kind==='Mountain'&&m.brush)} node={n} {...(n.parentId&&map.nodes.find(p=>p.id===n.parentId)?{parent:map.nodes.find(p=>p.id===n.parentId)!}:{})} clearings={nodes.filter(c=>c.parentId===n.id&&c.kind==="Clearing"&&c.brush)}/>:<path d={shapePath(n.shape??rectanglePoints(),p=>mapPosition(n,p))} fill={n.color??"#d6dec9"} stroke="#526257" strokeWidth="1"/>}{n.kind==="Point of Interest"&&<text x={n.x*8} y={n.y*6+5} textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff">!</text>}<text x={n.x*8} y={n.y*6+(n.kind==="Point of Interest"?25:5)} textAnchor="middle" fontSize="13">{n.name}</text></g>)}
 </svg><details className="world-map__help"><summary>Simulate discovery (editor only)</summary><p>This previews visibility only. Arrival detection and story-triggered reveals in live play are not connected yet.</p>{map.nodes.filter(n=>n.visibility&&n.visibility!=="visible").map(n=><label key={n.id} style={{display:"flex",gap:8,margin:8}}><input type="checkbox" checked={discovered.has(n.id)} onChange={e=>setDiscovered(old=>{const next=new Set(old);e.target.checked?next.add(n.id):next.delete(n.id);return next;})}/>{n.name} — {n.visibility==="arrival"?"Discover on arrival":"Reveal by event"}</label>)}</details></section>;
}
