import { useRef,useState } from "react";
import { createPortal } from "react-dom";
import { splitEdge,curvePoint,type ShapePoint,type XY } from "@library/mapShapes";
import { openRoutePath } from "@library/mapRoutes";
import { MapContextMenu } from "./MapContextMenu";

type RouteMenu={at:XY;point:XY;edge:number;t:number;nodeIndex?:number};
export function RouteDrawing({controlScale=1,points,active,type,onSelect,onConnectPoint,onStartConnection,onChange,label,settlement=false,controlsHost,movableEndpoints,onMoveEndpoint,onPlaceSettlement}:{
 controlScale?:number;points:ShapePoint[];active:boolean;type:string;onSelect:()=>void;
 onConnectPoint?:(point:XY)=>void;onStartConnection?:(point:XY)=>void;onChange:(p:ShapePoint[])=>void;label:string;
 settlement?:boolean;
 controlsHost?:SVGGElement|null;movableEndpoints?:readonly [boolean,boolean];onMoveEndpoint?:(end:0|1,point:XY)=>void;
 onPlaceSettlement?:(point:XY)=>void;
}){
 const root=useRef<SVGGElement>(null);
 const [selected,setSelected]=useState<number|null>(null),[menu,setMenu]=useState<RouteMenu|null>(null);
 const drag=useRef<{i:number;part:"point"|"incoming"|"outgoing"|"endpoint"}|null>(null);
 const local=(e:{clientX:number;clientY:number},svg:SVGSVGElement)=>{const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());return {x:p.x/8,y:p.y/6};};
 const color=type==="boat"||type==="ferry"?"#397b96":type==="bridge"?"#98683f":settlement?type==='road'?'#bca980':'#d3c4a6':"#627068";
 const connect=onStartConnection??onConnectPoint;
 function nodeMenu(event:{clientX:number;clientY:number;preventDefault:()=>void;stopPropagation:()=>void},index:number){
   event.preventDefault();event.stopPropagation();onSelect();setSelected(index);
   setMenu({at:{x:event.clientX,y:event.clientY},point:points[index]!,edge:Math.min(index,points.length-2),t:0,nodeIndex:index});
 }
 function changeMode(mode:"corner"|"smooth"|"free"){
   const index=menu?.nodeIndex;if(index===undefined||index<=0||index>=points.length-1)return;
   const next=structuredClone(points),p=next[index]!;p.mode=mode;
   if(mode==="corner"){delete p.incoming;delete p.outgoing;}
   else if(mode==="smooth"||(!p.incoming&&!p.outgoing)){
     const a=next[index-1]!,b=next[index+1]!;
     p.incoming={x:p.x-(b.x-a.x)/6,y:p.y-(b.y-a.y)/6};p.outgoing={x:p.x+(b.x-a.x)/6,y:p.y+(b.y-a.y)/6};
   }
   onChange(next);setMenu(null);
 }
 const controls=<g data-route-controls={label}>
   {(!settlement||active||onConnectPoint)&&[points[0]!,points[points.length-1]!].map((p,i)=>{const end=i as 0|1,movable=active&&movableEndpoints?.[end]&&onMoveEndpoint;return <circle key={"endpoint-"+i} cx={p.x*8} cy={p.y*6} r={(active?6:4)*controlScale} fill={movable?"#f8deb0":"#bacce1"} vectorEffect="non-scaling-stroke" stroke="#231f20" strokeWidth=".8"
     role={movable?"button":undefined} tabIndex={movable?0:undefined} aria-label={movable?`Move street junction (${i===0?'start':'end'})`:undefined} style={{touchAction:"none",cursor:movable?"move":undefined}}
     onPointerDown={e=>{if(!movable||e.button!==0)return;e.stopPropagation();e.preventDefault();drag.current={i:end,part:"endpoint"};e.currentTarget.setPointerCapture(e.pointerId);}}
     onPointerMove={e=>{if(drag.current?.part!=="endpoint"||drag.current.i!==end)return;onMoveEndpoint?.(end,local(e,e.currentTarget.ownerSVGElement!));}}
     onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}
     onKeyDown={e=>{if(!movable||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();const step=e.shiftKey?1:.25;onMoveEndpoint?.(end,{x:p.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),y:p.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0)});}}
     onContextMenu={e=>nodeMenu(e,i===0?0:points.length-1)} onClick={e=>{e.stopPropagation();if(onConnectPoint)onConnectPoint(p);else onSelect();}}><title>{movable?'Drag to move this junction and all connected streets.':'Connection endpoint — follows its place'}</title></circle>;})}
   {active&&points.map((p,i)=><g key={i}>
     {selected===i&&(["incoming","outgoing"] as const).map(part=>p[part]?<g key={part}>
       <line x1={p.x*8} y1={p.y*6} x2={p[part]!.x*8} y2={p[part]!.y*6} vectorEffect="non-scaling-stroke" strokeWidth=".6" stroke="#a85836" style={{pointerEvents:"none"}}/>
       <circle cx={p[part]!.x*8} cy={p[part]!.y*6} r={5*controlScale} fill="white" vectorEffect="non-scaling-stroke" strokeWidth=".75" stroke="#a85836" style={{touchAction:"none",cursor:"move"}}
         aria-label={`Route ${part} curve handle`}
         onPointerDown={e=>{if(e.button!==0)return;e.stopPropagation();drag.current={i,part};e.currentTarget.setPointerCapture(e.pointerId);}}
         onPointerMove={e=>{
           if(drag.current?.i!==i||drag.current.part!==part)return;
           const next=structuredClone(points),point=local(e,e.currentTarget.ownerSVGElement!);next[i]![part]=point;
           if(next[i]!.mode==="smooth")next[i]![part==="incoming"?"outgoing":"incoming"]={x:2*next[i]!.x-point.x,y:2*next[i]!.y-point.y};
           onChange(next);
         }} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}/>
     </g>:null)}
     {i>0&&i<points.length-1&&<circle cx={p.x*8} cy={p.y*6} r={6*controlScale} vectorEffect="non-scaling-stroke" stroke="#231f20" strokeWidth={selected===i?1.2:.8} fill="#bacce1" style={{touchAction:"none",cursor:"move"}}
       role="button" tabIndex={0} aria-label={`Route bend ${i}`}
       onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();const step=e.shiftKey?1:.25,dx=e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0,dy=e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0,next=structuredClone(points),p=next[i]!;p.x+=dx;p.y+=dy;for(const part of ['incoming','outgoing'] as const)if(p[part]){p[part]!.x+=dx;p[part]!.y+=dy;}setSelected(i);onChange(next);}}
       onContextMenu={e=>nodeMenu(e,i)} onClick={e=>{e.stopPropagation();setSelected(i);setMenu(null);}}
       onPointerDown={e=>{if(e.button!==0)return;e.stopPropagation();setSelected(i);drag.current={i,part:"point"};e.currentTarget.setPointerCapture(e.pointerId);}}
       onPointerMove={e=>{
         if(drag.current?.i!==i||drag.current.part!=="point")return;
         const q=local(e,e.currentTarget.ownerSVGElement!),next=structuredClone(points),old=next[i]!;
         for(const key of ["incoming","outgoing"] as const)if(old[key])old[key]={x:old[key]!.x+q.x-old.x,y:old[key]!.y+q.y-old.y};
         old.x=q.x;old.y=q.y;onChange(next);
       }} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}/>}
   </g>)}
 </g>;
 return <g ref={root}>
   <path d={openRoutePath(points)} stroke="transparent" strokeWidth="18" fill="none" role="button" tabIndex={0} aria-label={label}
     onClick={e=>{e.stopPropagation();if(onConnectPoint)onConnectPoint(local(e,e.currentTarget.ownerSVGElement!));else onSelect();}}
     onKeyDown={e=>{if(e.key==="Enter"){if(onConnectPoint)onConnectPoint(curvePoint(points[0]!,points[1]!,.5));else onSelect();}}}
     onContextMenu={e=>{
       e.preventDefault();e.stopPropagation();onSelect();const point=local(e,e.currentTarget.ownerSVGElement!);
       let hit={i:0,t:.5,d:Infinity};
       for(let i=0;i<points.length-1;i++)for(let j=1;j<100;j++){const v=curvePoint(points[i]!,points[i+1]!,j/100),d=Math.hypot((point.x-v.x)*8,(point.y-v.y)*6);if(d<hit.d)hit={i,t:j/100,d};}
       setMenu({at:{x:e.clientX,y:e.clientY},point:curvePoint(points[hit.i]!,points[hit.i+1]!,hit.t),edge:hit.i,t:hit.t});
     }}/>
   <path d={openRoutePath(points)} fill="none" stroke={color} strokeWidth={settlement?(type==='road'?active?11:9:active?5:3):active?4:type==="road"||type==="bridge"?3:2} strokeDasharray={(!settlement||type!=='path')&&["path","ferry","boat"].includes(type)?"7 5":undefined} strokeLinecap="round" style={{pointerEvents:"none"}}/>
   {active&&controlsHost?createPortal(controls,controlsHost):controls}
   {menu&&<MapContextMenu anchor={menu.at} scope={root.current} onClose={()=>setMenu(null)}>
     {menu.nodeIndex===undefined?<button type="button" role="menuitem" disabled={points.length>=200} onClick={()=>{onChange(splitEdge(points,menu.edge,menu.t));setSelected(menu.edge+1);}}>Add node</button>:
       menu.nodeIndex>0&&menu.nodeIndex<points.length-1?<>
         <button type="button" role="menuitem" onClick={()=>changeMode("corner")}>Make Sharp</button>
         <button type="button" role="menuitem" onClick={()=>changeMode("smooth")}>Make Smooth</button>
         <button type="button" role="menuitem" onClick={()=>changeMode("free")}>Make Free</button>
         <button type="button" role="menuitem" className="world-map__menu-danger" onClick={()=>{onChange(points.filter((_,i)=>i!==menu.nodeIndex));setSelected(null);}}>Delete</button>
       </>:null}
     {connect&&<button type="button" role="menuitem" onClick={()=>connect(menu.point)}>Start connection here</button>}
     {onPlaceSettlement&&<button type="button" role="menuitem" onClick={()=>onPlaceSettlement(menu.point)}>Build settlement here…</button>}
     <button type="button" role="menuitem" onClick={()=>setMenu(null)}>Cancel</button>
   </MapContextMenu>}
 </g>;
}
