import { interiorScale } from "../../library/interiorScale";
import { furnitureLayer } from "../../library/interiorFurniture";
import { InteriorFurniture,InteriorOpening } from "../studio/InteriorSymbols";
import { interiorEdges,nearestInteriorEdge } from "../../library/interior";
import { memo,useEffect,useRef,useState } from 'react';
import { mapBackgroundColor,type MapNode } from '../../library/worldMap';
import type { PlayMapModel } from '../../library/playMap';
import { mapPosition } from '../../library/mapGeometry';
import { rectanglePoints,shapePath } from '../../library/mapShapes';
import { smoothBrushPath } from '../../library/forestBrush';
import { openRoutePath,routePoints } from '../../library/mapRoutes';
import { settlementWorldContext } from '../../library/settlementContext';
import { BuildingSymbol,SettlementOverview } from '../studio/SettlementArtwork';
import { SettlementWorldContext } from '../studio/SettlementWorldContext';
import { Modal } from './Modal';
import './playMap.css';

const terrain=(n:MapNode)=>!n.symbol&&(n.isArea||['forest','lake','river','sea','ocean','mountain','region','marsh'].includes(n.kind.toLowerCase()));
const color=(n:MapNode)=>n.color??(/lake|river|sea|ocean/i.test(n.kind)?'#aacfdc':/forest|marsh/i.test(n.kind)?'#ced9ba':n.kind.toLowerCase()==='mountain'?'#cfcec3':'#e5d9bc');
const Outline=memo(function Outline({node}:{node:MapNode}){return <path d={node.brush?smoothBrushPath(node):shapePath(node.shape??rectanglePoints(),p=>mapPosition(node,p))} fill={color(node)} fillRule="evenodd" stroke="none"/>;});

function MapSurface({model,expanded=false,selected='',onSelect,zoom=1,pan={x:0,y:0},onPan,onZoom}:{model:PlayMapModel;expanded?:boolean;selected?:string;onSelect?:(id:string)=>void;zoom?:number;pan?:{x:number;y:number};onPan?:(p:{x:number;y:number})=>void;onZoom?:(zoom:number,point:{x:number;y:number})=>void}){
 const drag=useRef<{x:number;y:number;panX:number;panY:number}|null>(null),surface=useRef<SVGSVGElement>(null);
 const centre={x:400,y:300},house=model.map.nodes.find(n=>n.id===model.level),floor=house?.interior,metrics=floor&&house?interiorScale(house):null,floorScaleX=metrics?.scaleX??1,floorScaleY=metrics?.scaleY??1,background=floor?null:settlementWorldContext(model.map,model.level);
 useEffect(()=>{const svg=surface.current;if(!expanded||!svg||!onZoom)return;const wheel=(e:WheelEvent)=>{if(e.altKey)return;e.preventDefault();const rect=svg.getBoundingClientRect(),scale=Math.min(rect.width/800,rect.height/600);if(!scale)return;const point={x:(e.clientX-rect.left-(rect.width-800*scale)/2)/scale,y:(e.clientY-rect.top-(rect.height-600*scale)/2)/scale};onZoom(zoom+(e.deltaY<0?.25:-.25),point);};svg.addEventListener('wheel',wheel,{passive:false});return()=>svg.removeEventListener('wheel',wheel);},[expanded,onZoom,zoom]);
 const distanceScale=model.level?model.map.nodes.find(n=>n.id===model.level)?.distanceScale:model.map.distanceScale;
 const ruler=metrics?{value:80/(metrics.pxPerMetreX*metrics.scaleX*zoom),unit:'m'}:distanceScale?{value:distanceScale.value*2/zoom,unit:distanceScale.unit}:null;
 const byId=new Map(model.nodes.map(n=>[n.id,n])),places=model.nodes.filter(n=>!terrain(n)&&!n.isJunction),detailed=expanded?(zoom>=1.5||places.length<=160):places.length<=80;
 const inView=(n:MapNode)=>{const x=((n.x*8-400)*floorScaleX+400-centre.x)*zoom+400+pan.x,y=((n.y*6-300)*floorScaleY+300-centre.y)*zoom+300+pan.y,r=Math.max(25,Math.hypot((n.width??3)*8,(n.height??4)*6)/2+20)*zoom;return x+r>=0&&x-r<=800&&y+r>=0&&y-r<=600;};
 return <svg ref={surface} className="play-map__surface" viewBox="0 0 800 600" role={expanded?'group':'img'} aria-label={`${model.name} — known places`} onPointerDown={e=>{if(!expanded||e.button!==0||(e.target as Element).closest('[data-map-place]'))return;drag.current={x:e.clientX,y:e.clientY,panX:pan.x,panY:pan.y};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!drag.current||!onPan)return;const scale=800/e.currentTarget.getBoundingClientRect().width;onPan({x:drag.current.panX+(e.clientX-drag.current.x)*scale,y:drag.current.panY+(e.clientY-drag.current.y)*scale});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
  <rect width="800" height="600" fill={mapBackgroundColor(model.map,model.level)}/>
  <g transform={`translate(${400+pan.x} ${300+pan.y}) scale(${zoom}) translate(${-centre.x} ${-centre.y})`}>
   <g transform={`translate(400 300) scale(${floorScaleX} ${floorScaleY}) translate(-400 -300)`}>
   {background&&<SettlementWorldContext context={background}/>}
   {[...model.nodes].filter(terrain).sort((a,b)=>Number(/lake|river|sea|ocean/i.test(a.kind))-Number(/lake|river|sea|ocean/i.test(b.kind))).map(n=><Outline key={n.id} node={n}/>)}
   {!floor&&model.routes.map(r=>{const a=byId.get(r.from)!,b=byId.get(r.to)!;return <path key={r.id} d={openRoutePath(routePoints(r,a,b))} fill="none" stroke={r.type==='boat'||r.type==='ferry'?'#7198a8':'#bba77e'} strokeWidth={r.type==='path'?3:7} strokeDasharray={r.type==='path'?'6 4':undefined} strokeLinecap="round"/>;})}
   {places.filter(inView).map(n=><g key={n.id} data-map-place={n.id} {...(expanded?{role:'button',tabIndex:0,'aria-label':`Show ${n.name} on map`,onClick:()=>onSelect?.(n.id),onKeyDown:(e:React.KeyboardEvent)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect?.(n.id);}}}:{})} className={expanded?'play-map__place':undefined}>
    {n.kind.toLowerCase()==='settlement'?<SettlementOverview node={n} nodes={model.map.nodes} routes={model.map.routes} detailScale={expanded?1:.4} selected={selected===n.id}/>:<><path d={shapePath(n.shape??rectanglePoints(),p=>mapPosition(n,p))} fill={detailed&&n.symbol&&n.symbol!=='marker'?'transparent':color(n)} stroke={selected===n.id?'#86696d':detailed&&n.symbol&&n.symbol!=='marker'?'transparent':'#9b9276'} strokeWidth={selected===n.id?3:1}/>{detailed&&<BuildingSymbol node={n}/>}</>}
    {expanded&&<text x={n.x*8} y={n.y*6+(n.settlementMarker?27:((n.height??8)*3+13))} textAnchor="middle" className="play-map__label">{n.name.length>25?n.name.slice(0,24)+'…':n.name}</text>}
   </g>)}
   {floor&&house&&<g pointerEvents="none">{interiorEdges(model.nodes.filter(n=>n.roomPolygon)).map((e,i)=><line key={i} x1={e.a.x*8} y1={e.a.y*6} x2={e.b.x*8} y2={e.b.y*6} stroke="#756c55" strokeWidth="4"/>)}{floor.openings.filter(o=>o.kind==='door'&&model.map.routes.some(r=>r.id===o.routeId)).map(o=>{const edge=nearestInteriorEdge(model.map,model.level,o.position)?.edge;return edge?<InteriorOpening key={o.id} building={house} opening={o} edge={edge}/>:null;})}{model.map.nodes.filter(n=>n.furnitureType&&n.interiorPosition&&model.nodes.some(r=>r.id===n.parentId)).sort(furnitureLayer).map(n=><InteriorFurniture key={n.id} building={house} node={n}/>)}</g>}
   {model.anchor&&<g className="play-map__position" aria-label={`Your location: ${model.current.name}`} pointerEvents="none"><circle cx={model.anchor.x*8} cy={model.anchor.y*6} r="9" fill="#86696d" stroke="#fffaf0" strokeWidth="3"/><circle cx={model.anchor.x*8} cy={model.anchor.y*6} r="15" fill="none" stroke="#86696d" strokeWidth="2" opacity=".5"/></g>}
   </g>
  </g>
  {expanded&&ruler&&<g pointerEvents="none"><rect x="16" y="546" width="150" height="43" rx="5" fill="#f7f3e6" opacity=".9"/><path d="M24 574h80m-80-4v8m80-8v8" stroke="#6e705a" fill="none" strokeWidth="2"/><text x="24" y="562" fontSize="12" fill="#515646">0 — {Number(ruler.value.toPrecision(3))} {ruler.unit}</text></g>}
 </svg>;
}

export function PlayMapCard({model}:{model:PlayMapModel}){
 const [open,setOpen]=useState(false),[selected,setSelected]=useState(''),[zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0});
 const chosen=model.nodes.find(n=>n.id===selected);
 function changeZoom(value:number,point={x:400,y:300}){const next=Math.max(1,Math.min(4,value)),ratio=next/zoom;if(next===zoom)return;setPan(p=>({x:point.x-400-(point.x-400-p.x)*ratio,y:point.y-300-(point.y-300-p.y)*ratio}));setZoom(next);}
 return <div className="play-map-card">
  <header><div><span className="play-map-card__eyebrow">{model.local?'YOUR LOCAL MAP':'YOUR WORLD'}</span><h3>{model.name}</h3></div><button type="button" aria-label={`Open map of ${model.name}`} onClick={()=>setOpen(true)}>↗</button></header>
  <button type="button" className="play-map-card__preview" aria-label={`Expand ${model.name} map`} onClick={()=>setOpen(true)}><MapSurface model={model}/></button>
  <p className="play-map-card__where"><span aria-hidden="true">●</span>{model.current.name===model.name?`In ${model.name}`:model.current.name}</p>
  {open&&<Modal title={model.name+' · Player map'} wide onClose={()=>setOpen(false)}><div className="play-map-dialog">
   <div className="play-map-dialog__tools"><span>{model.worldName} · Known places</span><div><button type="button" aria-label="Zoom out player map" disabled={zoom<=1} onClick={()=>changeZoom(zoom-.5)}>−</button><span>{Math.round(zoom*100)}%</span><button type="button" aria-label="Zoom in player map" disabled={zoom>=4} onClick={()=>changeZoom(zoom+.5)}>+</button><button type="button" onClick={()=>{setZoom(1);setPan({x:0,y:0});setSelected('');}}>Fit map</button></div></div>
   <div className="play-map-dialog__layout"><MapSurface model={model} expanded selected={selected} onSelect={setSelected} zoom={zoom} pan={pan} onPan={setPan} onZoom={changeZoom}/><aside><small>YOUR LOCATION</small><h3>{model.current.name}</h3><p>{model.anchor?'The rose marker shows your current place.':'You are in this area. A more precise position has not been specified.'}</p><hr/><small>{chosen?'SELECTED PLACE':'EXPLORE THE MAP'}</small><h3>{chosen?.name??'Find your bearings'}</h3><p>{chosen?.kind??'Choose a place on the map. Zoom in for details and drag the map to look around.'}</p><p>Use the game’s actions to travel.</p></aside></div>
  </div></Modal>}
 </div>;
}
