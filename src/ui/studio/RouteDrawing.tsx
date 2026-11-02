import { useRef,useState } from "react";
import { splitEdge,curvePoint,type ShapePoint,type XY } from "@library/mapShapes";
import { openRoutePath } from "@library/mapRoutes";
import { MapContextMenu } from "./MapContextMenu";

type RouteMenu={at:XY;point:XY;edge:number;t:number;nodeIndex?:number};
export function RouteDrawing({controlScale=1,points,active,type,onSelect,onConnectPoint,onStartConnection,onChange,label}:{
 controlScale?:number;points:ShapePoint[];active:boolean;type:string;onSelect:()=>void;
 onConnectPoint?:(point:XY)=>void;onStartConnection?:(point:XY)=>void;onChange:(p:ShapePoint[])=>void;label:string;
}){
 const root=useRef<SVGGElement>(null);
 const [selected,setSelected]=useState<number|null>(null),[menu,setMenu]=useState<RouteMenu|null>(null);
 const drag=useRef<{i:number;part:"point"|"incoming"|"outgoing"}|null>(null);
 const local=(e:{clientX:number;clientY:number},svg:SVGSVGElement)=>{const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());return {x:p.x/8,y:p.y/6};};
 const color=type==="boat"||type==="ferry"?"#397b96":type==="bridge"?"#98683f":"#627068";
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
   <path d={openRoutePath(points)} fill="none" stroke={color} strokeWidth={active?4:type==="road"||type==="bridge"?3:2} strokeDasharray={["path","ferry","boat"].includes(type)?"7 5":undefined} style={{pointerEvents:"none"}}/>
   {[points[0]!,points[points.length-1]!].map((p,i)=><circle key={"endpoint-"+i} cx={p.x*8} cy={p.y*6} r={4*controlScale} fill="#bacce1" vectorEffect="non-scaling-stroke" stroke="#231f20" strokeWidth=".8"
     onContextMenu={e=>nodeMenu(e,i===0?0:points.length-1)} onClick={e=>{e.stopPropagation();if(onConnectPoint)onConnectPoint(p);else onSelect();}}><title>Connection endpoint</title></circle>)}
   {active&&points.map((p,i)=><g key={i}>
     {selected===i&&(["incoming","outgoing"] as const).map(part=>p[part]?<g key={part}>
       <line x1={p.x*8} y1={p.y*6} x2={p[part]!.x*8} y2={p[part]!.y*6} vectorEffect="non-scaling-stroke" strokeWidth=".6" stroke="#a85836"/>
       <circle cx={p[part]!.x*8} cy={p[part]!.y*6} r={4*controlScale} fill="white" vectorEffect="non-scaling-stroke" strokeWidth=".75" stroke="#a85836" style={{touchAction:"none"}}
         onPointerDown={e=>{e.stopPropagation();drag.current={i,part};e.currentTarget.setPointerCapture(e.pointerId);}}
         onPointerMove={e=>{
           if(drag.current?.i!==i||drag.current.part!==part)return;
           const next=structuredClone(points),point=local(e,e.currentTarget.ownerSVGElement!);next[i]![part]=point;
           if(next[i]!.mode==="smooth")next[i]![part==="incoming"?"outgoing":"incoming"]={x:2*next[i]!.x-point.x,y:2*next[i]!.y-point.y};
           onChange(next);
         }} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}/>
     </g>:null)}
     {i>0&&i<points.length-1&&<circle cx={p.x*8} cy={p.y*6} r={4*controlScale} vectorEffect="non-scaling-stroke" stroke="#231f20" strokeWidth={selected===i?1.2:.8} fill="#bacce1" style={{touchAction:"none",cursor:"move"}}
       onContextMenu={e=>nodeMenu(e,i)} onClick={e=>{e.stopPropagation();setSelected(i);setMenu(null);}}
       onPointerDown={e=>{if(e.button!==0)return;e.stopPropagation();setSelected(i);drag.current={i,part:"point"};e.currentTarget.setPointerCapture(e.pointerId);}}
       onPointerMove={e=>{
         if(drag.current?.i!==i||drag.current.part!=="point")return;
         const q=local(e,e.currentTarget.ownerSVGElement!),next=structuredClone(points),old=next[i]!;
         for(const key of ["incoming","outgoing"] as const)if(old[key])old[key]={x:old[key]!.x+q.x-old.x,y:old[key]!.y+q.y-old.y};
         old.x=q.x;old.y=q.y;onChange(next);
       }} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}/>}
   </g>)}
   {menu&&<MapContextMenu anchor={menu.at} scope={root.current} onClose={()=>setMenu(null)}>
     {menu.nodeIndex===undefined?<button type="button" role="menuitem" onClick={()=>{onChange(splitEdge(points,menu.edge,menu.t));setSelected(menu.edge+1);}}>Add node</button>:
       menu.nodeIndex>0&&menu.nodeIndex<points.length-1?<>
         <button type="button" role="menuitem" onClick={()=>changeMode("corner")}>Make Sharp</button>
         <button type="button" role="menuitem" onClick={()=>changeMode("smooth")}>Make Smooth</button>
         <button type="button" role="menuitem" onClick={()=>changeMode("free")}>Make Free</button>
         <button type="button" role="menuitem" className="world-map__menu-danger" onClick={()=>{onChange(points.filter((_,i)=>i!==menu.nodeIndex));setSelected(null);}}>Delete</button>
       </>:null}
     {connect&&<button type="button" role="menuitem" onClick={()=>connect(menu.point)}>Start connection here</button>}
     <button type="button" role="menuitem" onClick={()=>setMenu(null)}>Cancel</button>
   </MapContextMenu>}
 </g>;
}
