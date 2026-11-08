import { interiorScale,houseSizeMeters,furnitureSizeMeters,openingWidthMeters,roomAreaMeters } from "../../library/interiorScale";
import { InteriorFurniture,InteriorOpening } from "./InteriorSymbols";
import { useEffect,useMemo,useRef,useState } from 'react';
import type { MapNode,WorldMap } from '../../library/worldMap';
import { WorldMapSchema } from '../../library/worldMap';
import { addInteriorOpening,extendInterior,inheritedMapImage,interiorEdges,interiorRooms,moveInteriorVertex,nearestInteriorEdge,interiorOpeningPlacement,placeInteriorFurniture,polygonContains,furnitureFits,moveInteriorFurniture,resizeInterior,openingFits,moveInteriorOpening,removeInteriorWall,splitInteriorRoomPath,updateInteriorOpening } from '../../library/interior';
import { furnitureLayer, furnitureTypes, interiorFurniture, isFurnitureType, type FurnitureType } from '../../library/interiorFurniture';
import type { XY } from '../../library/mapShapes';
import { sceneImagesFromFile } from './portrait';
import { MapContextMenu } from './MapContextMenu';
import './interior.css';

const path=(p:XY[])=>'M'+p.map(v=>`${v.x*8},${v.y*6}`).join('L')+'Z';
const buildTools = {
  select: { label: 'Select', icon: '↖' }, wall: { label: 'Wall', icon: '╱' }, erase: { label: 'Remove wall', icon: '⌫' },
  door: { label: 'Door', icon: '▯' }, window: { label: 'Window', icon: '⊞' }
} as const;
type BuildTool = keyof typeof buildTools;
type Tool = BuildTool | FurnitureType;
const toolList: Tool[] = [...Object.keys(buildTools) as BuildTool[], ...furnitureTypes];
const toolInfo = (tool: Tool) => isFurnitureType(tool) ? interiorFurniture[tool] : buildTools[tool];
const turn = (rotation: number, delta: number) => ((rotation + delta) % 360 + 360) % 360;
export function InteriorEditor({map,buildingId,onChange,protectedPlaceIds=[]}:{map:WorldMap;buildingId:string;protectedPlaceIds?:string[];onChange:(map:WorldMap)=>void}){
 const building=map.nodes.find(n=>n.id===buildingId)!,plan=building.interior!,rooms=useMemo(()=>interiorRooms(map,buildingId),[map,buildingId]),edges=useMemo(()=>interiorEdges(rooms),[rooms]);
 const [tool,setTool]=useState<Tool>('select'),[selected,setSelected]=useState(rooms[0]?.id??''),[openingId,setOpeningId]=useState(''),[start,setStart]=useState<XY|null>(null),[corners,setCorners]=useState<XY[]>([]),[preview,setPreview]=useState<XY|null>(null),[hover,setHover]=useState<XY|null>(null),[error,setError]=useState(''),[uploading,setUploading]=useState(false),[historyCount,setHistoryCount]=useState(0),[context,setContext]=useState<{x:number;y:number;point:XY}|null>(null);
 const [placementRotation, setPlacementRotation] = useState(0);
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const drawing=useRef<SVGGElement>(null),metrics=interiorScale(building),{scaleX,scaleY}=metrics;
 const [widthDraft,setWidthDraft]=useState(String(metrics.size.width)),[depthDraft,setDepthDraft]=useState(String(metrics.size.depth));
 useEffect(()=>{setWidthDraft(String(metrics.size.width));setDepthDraft(String(metrics.size.depth));},[metrics.size.width,metrics.size.depth]);
 const svg=useRef<SVGSVGElement>(null),scope=useRef<HTMLDivElement>(null),latest=useRef(map),history=useRef<WorldMap[]>([]),drag=useRef<{kind:'vertex'|'furniture'|'opening';point:XY;id?:string;offset?:XY}|null>(null);latest.current=map;
 const node=map.nodes.find(n=>n.id===selected),opening=plan.openings.find(o=>o.id===openingId),room=node?.kind==='Room'?node:undefined;
 function commit(next:WorldMap){if(next===map)return;WorldMapSchema.parse(next);history.current=[...history.current.slice(-19),map];setHistoryCount(history.current.length);onChange(next);setError('');}
 function attempt(fn:()=>WorldMap){try{commit(fn());return true;}catch(e){setError(e instanceof Error?e.message:String(e));return false;}}
 function patch(change:Partial<MapNode>){if(change.rotation!==undefined&&node?.furnitureType&&node.interiorPosition){attempt(()=>moveInteriorFurniture(map,buildingId,node.id,node.interiorPosition!,change.rotation));return;}commit({...map,nodes:map.nodes.map(n=>n.id===selected?{...n,...change}:n)});}
 function chooseTool(t:Tool){setTool(t);setStart(null);setCorners([]);setPreview(null);setHover(null);setOpeningId('');setPlacementRotation(0);setError('');}
 function removeSelected(){
  if(uploading)return;
  if(opening){attempt(()=>updateInteriorOpening(map,buildingId,opening.id,null));setOpeningId('');}
  else if(node?.kind==='Furniture'&&node.furnitureType){attempt(()=>({...map,nodes:map.nodes.filter(n=>n.id!==node.id)}));setSelected('');}
  drag.current=null;setPreview(null);
 }
 useEffect(()=>{const key=(e:KeyboardEvent)=>{
  if(e.key==='Escape'){if(!(e.target instanceof Element)||!scope.current?.contains(e.target)||context)return;if(tool!=='select'||start||drag.current){e.preventDefault();e.stopPropagation();}setStart(null);setCorners([]);setPreview(null);setHover(null);setContext(null);setTool('select');drag.current=null;return;}
  if(e.key==='Backspace'&&tool==='wall'&&start&&e.target instanceof Element&&scope.current?.contains(e.target)&&!e.target.closest('input,textarea,select,button,[contenteditable]')){e.preventDefault();undoCorner();return;}
  if(e.key!=='Delete'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||uploading||context)return;
  const target=e.target;if(!(target instanceof Element)||!scope.current?.contains(target)||target.closest('input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],[role="menu"]'))return;
  if(!opening&&!(node?.kind==='Furniture'&&node.furnitureType))return;
  e.preventDefault();e.stopPropagation();removeSelected();svg.current?.focus();
 };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[map,selected,openingId,uploading,context,start,corners,tool]);
 useEffect(() => {
   const canvas = svg.current;
   if (!canvas || uploading) return;
   const wheel = (event: WheelEvent) => {
     if (!event.ctrlKey || !event.deltaY || drag.current || context) return;
     const delta = event.deltaY < 0 ? 15 : -15;
     if (isFurnitureType(tool)) {
       event.preventDefault();
       setPlacementRotation(angle => turn(angle, delta));
     } else if (tool === 'select' && node?.furnitureType && node.interiorPosition) {
       event.preventDefault();
       patch({ rotation: turn(node.rotation ?? 0, delta) });
     }
   };
   canvas.addEventListener('wheel', wheel, { passive: false });
   return () => canvas.removeEventListener('wheel', wheel);
 }, [map, selected, tool, uploading, context]);
 function point(e:{clientX:number;clientY:number}):XY{const el=svg.current!,matrix=drawing.current?.getScreenCTM?.();if(matrix&&typeof DOMPoint!=='undefined'){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return {x:p.x/8,y:p.y/6};}const r=el.getBoundingClientRect(),scale=Math.min(r.width/800,r.height/600);return {x:50+((e.clientX-r.left-(r.width-800*scale)/2)/scale/8-50)/scaleX,y:50+((e.clientY-r.top-(r.height-600*scale)/2)/scale/6-50)/scaleY};}
 function startObjectDrag(event: React.PointerEvent, kind: 'furniture' | 'opening', id: string, position: XY) {
   const pointer = point(event);
   drag.current = { kind, id, point: position, offset: { x: position.x - pointer.x, y: position.y - pointer.y } };
   svg.current?.setPointerCapture(event.pointerId);
 }
 function movedPoint(pointer: XY, offset?: XY) {
   return offset ? { x: pointer.x + offset.x, y: pointer.y + offset.y } : pointer;
 }
 function undoCorner(){if(corners.length)setCorners(v=>v.slice(0,-1));else setStart(null);setPreview(null);setError('');}
 function wallPoint(e:{clientX:number;clientY:number;shiftKey?:boolean}):XY{const p=point(e),last=corners.at(-1)??start;if(!last||!e.shiftKey)return p;return Math.abs((p.x-last.x)*metrics.metresPerUnitX)>=Math.abs((p.y-last.y)*metrics.metresPerUnitY)?{x:p.x,y:last.y}:{x:last.x,y:p.y};}
 function place(p:XY,t=tool){
  if(t==='wall'){
   const hit=nearestInteriorEdge(map,buildingId,p,false,edges);
   if(!start){if(!hit||hit.distance>3){setError('Start the wall on an existing boundary.');return;}setStart(hit.point);setCorners([]);setPreview(hit.point);return;}
   if(hit&&hit.distance<=3){if(attempt(()=>splitInteriorRoomPath(map,buildingId,[start,...corners,hit.point]))){setStart(null);setCorners([]);setPreview(null);}return;}
   if(corners.length>=30){setError('Finish this wall before adding more corners.');return;}
   if(!rooms.some(r=>polygonContains(r.roomPolygon!,start)&&polygonContains(r.roomPolygon!,p))){setError('Keep the wall inside the same room.');return;}
   const last=corners.at(-1)??start;if(Math.hypot(last.x-p.x,last.y-p.y)<.25)return;
   setCorners(v=>[...v,p]);setPreview(p);setError('');return;
  }
  if(t==='erase'){attempt(()=>removeInteriorWall(map,buildingId,p,protectedPlaceIds));return;}
  if(t==='door'||t==='window'){attempt(()=>addInteriorOpening(map,buildingId,p,t));return;}
  if(t!=='select'){attempt(()=>placeInteriorFurniture(map,buildingId,p,t,placementRotation));return;}
  const r=rooms.find(r=>polygonContains(r.roomPolygon!,p));setSelected(r?.id??'');setOpeningId('');
 }
 async function upload(file:File){const roomId=selected;if(file.size>10*1024*1024){setError('Choose a picture under 10 MB.');return;}setUploading(true);setError('');try{const image=await sceneImagesFromFile(file),current=latest.current;if(!mounted.current)return;commit({...current,nodes:current.nodes.map(n=>n.id===roomId?{...n,imageDataUrl:image.imageDataUrl,images:[image.imageDataUrl]}:n)});}catch(e){if(mounted.current)setError(String(e));}finally{if(mounted.current)setUploading(false);}}
 const vertexKey=(p:XY)=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`,vertices=[...new Map(edges.flatMap(e=>[e.a,e.b]).map(p=>[vertexKey(p),p])).values()].filter(p=>!plan.outline.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<.001));
 const invalidOpenings=plan.openings.filter(o=>{const edge=nearestInteriorEdge(map,buildingId,o.position,false,edges)?.edge;return !edge||!openingFits(building,o,edge);});
 const furniture=map.nodes.filter(n=>n.kind==='Furniture'&&rooms.some(r=>r.id===n.parentId)&&n.interiorPosition).sort(furnitureLayer),invalidFurniture=furniture.filter(n=>!furnitureFits(building,rooms.find(r=>r.id===n.parentId)!,n));
 const placementType = isFurnitureType(tool) ? tool : null;
 const ghostFurniture: MapNode | null = hover && placementType && !drag.current && !uploading ? {
   id: 'placement-preview', name: '', kind: 'Furniture', x: 50, y: 50, description: '', population: '', characterIds: [],
   furnitureType: placementType, furnitureSizeMeters: interiorFurniture[placementType], interiorPosition: hover, rotation: placementRotation
 } : null;
 const ghostRoom=ghostFurniture?rooms.find(r=>polygonContains(r.roomPolygon!,hover!)):undefined,ghostFurnitureValid=!!ghostFurniture&&!!ghostRoom&&furnitureFits(building,ghostRoom,ghostFurniture);
 const movingOpening = drag.current?.kind === 'opening' && preview
   ? plan.openings.find(item => item.id === drag.current?.id) : undefined;
 const ghostKind = movingOpening?.kind ?? (tool === 'door' || tool === 'window' ? tool : null);
 const openingPoint = movingOpening ? preview : drag.current ? null : hover;
 const ghostOpening = openingPoint && ghostKind && !uploading
   ? interiorOpeningPlacement(map, buildingId, openingPoint, ghostKind, movingOpening, edges) : null;
 function toolButton(t: Tool) {
   const { label, icon } = toolInfo(t);
   return <button key={t} type="button" aria-pressed={tool === t} onClick={() => chooseTool(t)}><span aria-hidden="true">{icon}</span>{label}</button>;
 }
 return <div ref={scope} className="interior-editor">
  <header className="interior-editor__intro"><div><small>INSIDE {building.name.toUpperCase()}</small><h2>A place for every story.</h2><p>Shape the rooms, connect their doors, and add the details that matter.</p></div><span>{metrics.size.width.toFixed(1)} × {metrics.size.depth.toFixed(1)} m · {rooms.length} rooms</span></header>
  <fieldset disabled={uploading} className="interior-editor__body">
   <nav className="interior-editor__tools" aria-label="Interior tools">
    <small>BUILD</small>{(Object.keys(buildTools) as BuildTool[]).map(toolButton)}
    <hr/><small>FURNITURE</small>{furnitureTypes.filter(type => interiorFurniture[type].category === 'furnish').map(toolButton)}
    <hr/><small>FIXTURES & LIGHTING</small>{furnitureTypes.filter(type => interiorFurniture[type].category === 'fixture').map(toolButton)}
    <hr/><small>ROOMS</small>{rooms.map(r=><button key={r.id} type="button" className="interior-editor__room-link" aria-current={selected===r.id?'true':undefined} onClick={()=>{setSelected(r.id);setOpeningId('');chooseTool('select');}}>{r.name}</button>)}<button type="button" disabled={!historyCount&&!start} onClick={()=>{if(start){undoCorner();return;}const previous=history.current.pop();if(previous){onChange(previous);setHistoryCount(history.current.length);setStart(null);setOpeningId('');setError('');}}}>{start?'↶ Undo corner':'↶ Undo'}</button></nav>
   <main className="interior-editor__drawing"><div className="interior-editor__hint">{tool==='wall'?(start?'Click to add corners. Finish on an existing wall. Shift: horizontal/vertical. Backspace: undo corner. Escape: cancel.':'Start on a wall, click out corners, and finish on an existing wall. You can also drag a straight partition.'):tool==='select'?'Drag objects to move them. Ctrl + scroll rotates selected furniture. Delete removes the selection.':tool==='erase'?'Choose a partition to merge its rooms. Authored room details are protected.':tool==='door'?'Place a door on a wall to create a real passage.':tool==='window'?'Place a window on an outside wall.':`Move to preview ${toolInfo(tool).label}. Ctrl + scroll rotates. Click to place, or press Escape to cancel.`}<span>Right-click for tools</span></div>
    <svg ref={svg} viewBox="0 0 800 600" aria-label="House floor plan" tabIndex={0} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setContext({x:e.clientX,y:e.clientY,point:point(e)});}} onPointerDown={e=>{if(e.button!==0||drag.current)return;e.currentTarget.focus();if(tool==='wall'){const p=wallPoint(e);if(start){place(p);return;}const hit=nearestInteriorEdge(map,buildingId,p);if(hit&&hit.distance<=3){setStart(hit.point);setCorners([]);setPreview(hit.point);drag.current={kind:'vertex',point:hit.point,id:'new-wall'};e.currentTarget.setPointerCapture(e.pointerId);}else setError('Start the wall on an existing boundary.');}else place(point(e));}} onPointerMove={e=>{const p=tool==='wall'?wallPoint(e):point(e);if(start||drag.current)setPreview(movedPoint(p,drag.current?.offset));else if(!uploading&&(isFurnitureType(tool)||tool==='door'||tool==='window'))setHover(p);}} onPointerLeave={()=>setHover(null)} onPointerUp={e=>{const active=drag.current;if(!active)return;drag.current=null;const p=active.id==='new-wall'?wallPoint(e):movedPoint(point(e),active.offset);if(active.id!=='new-wall'&&Math.hypot(p.x-active.point.x,p.y-active.point.y)<.05){setPreview(null);return;}if(active.id==='new-wall'){if(Math.hypot(p.x-active.point.x,p.y-active.point.y)>3){place(p,'wall');}setPreview(null);return;}if(active.kind==='opening')attempt(()=>moveInteriorOpening(map,buildingId,active.id!,p));else if(active.kind==='vertex')attempt(()=>moveInteriorVertex(map,buildingId,active.point,p));else {const target=rooms.find(r=>polygonContains(r.roomPolygon!,p));if(!target){setError('Keep furniture inside a room.');return;}attempt(()=>moveInteriorFurniture(map,buildingId,active.id!,p));}setPreview(null);}} onPointerCancel={()=>{drag.current=null;setPreview(null);setHover(null);setStart(null);setCorners([]);}} onLostPointerCapture={()=>{if(drag.current){drag.current=null;setPreview(null);}}}>
     <defs><pattern id="interior-grid" width={metrics.pxPerMetreX} height={metrics.pxPerMetreY} patternUnits="userSpaceOnUse"><path d={`M${metrics.pxPerMetreX} 0H0V${metrics.pxPerMetreY}`} fill="none" stroke="#756b4f12"/></pattern></defs><rect width="800" height="600" fill="#e4e4d0"/><g ref={drawing} transform={`translate(400 300) scale(${scaleX} ${scaleY}) translate(-400 -300)`}><path d={path(plan.outline)} fill="#faf4e5"/><path d={path(plan.outline)} fill="url(#interior-grid)"/>
     {rooms.map(r=><g key={r.id} data-interior-room={r.id} role="button" tabIndex={0} aria-label={`Select room ${r.name}`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(r.id);setOpeningId('');}}}><path d={path(r.roomPolygon!)} fill={selected===r.id?'#eadac2':r.color??'#f4eada'} fillOpacity=".65"/><text x={r.x*8} y={r.y*6} textAnchor="middle" fill="#6a5a43" fontSize="13" pointerEvents="none">{r.name}</text></g>)}
     {edges.map((edge,i)=><line key={i} x1={edge.a.x*8} y1={edge.a.y*6} x2={edge.b.x*8} y2={edge.b.y*6} stroke={edge.rooms.length===1?'#655b46':'#92856b'} strokeWidth={edge.rooms.length===1?7:4} strokeLinecap="round" pointerEvents="none"/>)}
     {plan.openings.map(o=>{const hit=nearestInteriorEdge(map,buildingId,o.position);return hit?<InteriorOpening key={o.id} building={building} opening={o} edge={hit.edge} selected={o.id===openingId} invalid={!openingFits(building,o,hit.edge)} role="button" tabIndex={0} aria-label={`Select ${o.access} ${o.kind}`} opacity={movingOpening?.id===o.id?0.2:1} onPointerDown={event=>{if(tool!=='select'||event.button!==0)return;event.stopPropagation();event.currentTarget.focus();setOpeningId(o.id);setSelected('');startObjectDrag(event,'opening',o.id,o.position);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setOpeningId(o.id);setSelected('');}}}/>:null;})}
     {furniture.map(n=>{const p=drag.current?.id===n.id&&preview?preview:n.interiorPosition!;return <InteriorFurniture key={n.id} building={building} node={{...n,interiorPosition:p}} selected={selected===n.id} invalid={invalidFurniture.some(v=>v.id===n.id)} role="button" tabIndex={0} aria-label={`Select furniture ${n.name}`} onPointerDown={e=>{if(tool!=='select'||e.button!==0)return;e.stopPropagation();e.currentTarget.focus();setSelected(n.id);setOpeningId('');startObjectDrag(e,'furniture',n.id,p);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(n.id);setOpeningId('');}}}/>;})}
     {ghostFurniture&&<g className="interior-editor__ghost" data-placement-valid={ghostFurnitureValid} pointerEvents="none" aria-hidden="true"><InteriorFurniture building={building} node={ghostFurniture} invalid={!ghostFurnitureValid}/></g>}
     {ghostOpening&&ghostKind&&<g className="interior-editor__ghost" data-moving-opening={!!movingOpening} data-placement-valid={ghostOpening.valid} pointerEvents="none" aria-hidden="true"><InteriorOpening building={building} opening={{id:'placement-preview',kind:ghostKind,position:ghostOpening.position,access:movingOpening?.access??'open',widthMeters:ghostOpening.widthMeters}} edge={ghostOpening.edge} selected={!!movingOpening} invalid={!ghostOpening.valid}/></g>}
     {tool==='select'&&vertices.map(p=><circle key={vertexKey(p)} aria-label="Move wall junction" role="button" tabIndex={0} cx={p.x*8} cy={p.y*6} r="5" fill="#f7f0df" stroke="#86696d" strokeWidth="2" onPointerDown={e=>{e.stopPropagation();drag.current={kind:'vertex',point:p};svg.current?.setPointerCapture(e.pointerId);}} onKeyDown={e=>{const delta:Record<string,XY>={ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}};const d=delta[e.key];if(d){e.preventDefault();attempt(()=>moveInteriorVertex(map,buildingId,p,{x:p.x+d.x,y:p.y+d.y}));}}}/>)}
     {start&&<polyline aria-label="Wall preview" points={[start,...corners,...(preview?[preview]:[])].map(p=>`${p.x*8},${p.y*6}`).join(' ')} fill="none" stroke="#86696d" strokeWidth="4" strokeDasharray="8 5" pointerEvents="none"/>}
     <g pointerEvents="none" aria-label="Metre scale"><path d={`M80 570v8m0-4h${metrics.pxPerMetreX*2}m0-4v8`} stroke="#655b46" fill="none" strokeWidth="1.5"/><text x="80" y="562" fontSize="11" fill="#655b46">2 m · grid 1 m</text></g>
    </g></svg><footer>{error?<p role="alert">{error}</p>:invalidFurniture.length||invalidOpenings.length?<p role="status">{invalidFurniture.length} furniture item(s) and {invalidOpenings.length} opening(s) do not fit at real scale. Move the red-marked objects inside their room or along their wall.</p>:<p>One floor · Rooms and doors are saved with the world map. Empty rooms do not create residents or story events.</p>}</footer>
   </main>
   <aside className="interior-editor__details"><small>{opening?'OPENING':room?'ROOM DETAILS':node?.kind==='Furniture'?'FURNITURE':'HOUSE'}</small>
    {opening?<><h3>{opening.kind==='door'?'Door':'Window'}</h3><p>{openingWidthMeters(opening)} m wide</p>{opening.kind==='door'&&<label>Access<select value={opening.access} onChange={e=>attempt(()=>updateInteriorOpening(map,buildingId,opening.id,e.target.value as 'open'|'locked'|'hidden'))}><option value="open">Open</option><option value="locked">Locked</option><option value="hidden">Hidden</option></select></label>}<p>{opening.kind==='door'?'Drag along the wall to reposition. This is a real map connection; its access rules apply when the player travels.':'Windows provide a view; they do not create a traversable doorway.'}</p><button type="button" onClick={removeSelected}>Remove {opening.kind}</button></>:node?<><label>{room?'Room name':'Object name'}<input value={node.name} onChange={e=>{if(e.target.value.trim())patch({name:e.target.value});}}/></label><label>Description<textarea rows={4} value={node.description} onChange={e=>patch({description:e.target.value})}/></label>{room?<><p className="interior-editor__measurement">Floor area: {roomAreaMeters(building,room).toFixed(1)} m²</p><label>Arrival text<textarea rows={3} value={room.intro??''} onChange={e=>patch({intro:e.target.value})}/></label><label>Player visibility<select value={room.visibility??'visible'} onChange={e=>patch({visibility:e.target.value as 'visible'|'arrival'|'hidden'})}><option value="visible">Visible</option><option value="arrival">Discover on arrival</option><option value="hidden">Hidden</option></select></label><section className="interior-editor__picture"><h4>Room background</h4>{inheritedMapImage(map,room.id)?<img src={inheritedMapImage(map,room.id)} alt="Room background preview"/>:<div>No room picture</div>}<p>{room.imageDataUrl?'This picture is used when the player enters this room.':'Uses the house or surrounding place’s picture when available. A story scene can override it.'}</p><label>Add room picture<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void upload(file);}}/></label>{room.imageDataUrl&&<button type="button" onClick={()=>patch({imageDataUrl:'',images:[]})}>Use inherited picture</button>}</section><p>To split this room, draw a wall between its boundaries. Click inside the room to add corners before finishing on a wall. Existing room facts and images stay with the larger part.</p></>:<><p className="interior-editor__measurement">{furnitureSizeMeters(node).width} × {furnitureSizeMeters(node).depth} m</p><label>Rotation<input type="range" min="0" max="360" step="15" value={node.rotation??0} onChange={e=>patch({rotation:Number(e.target.value)})}/></label><button type="button" onClick={removeSelected}>Remove furniture</button></>}</>:<p>Select a room, door, window or item to edit it.</p>}
    <section className="interior-editor__size"><h4>House size · metres</h4><p>Starter dimensions. Change them to match your building; furniture keeps its real size.</p><label>Width (m)<input type="number" min="2" max="500" step="0.5" value={widthDraft} onChange={e=>setWidthDraft(e.target.value)}/></label><label>Depth (m)<input type="number" min="2" max="500" step="0.5" value={depthDraft} onChange={e=>setDepthDraft(e.target.value)}/></label><button type="button" onClick={()=>attempt(()=>resizeInterior(map,buildingId,{width:Number(widthDraft),depth:Number(depthDraft)}))}>Apply house size</button></section>
    <section className="interior-editor__extend"><h4>Extend building</h4><p>Add a wing, then place a door through the shared wall. The larger footprint also appears on the settlement map.</p><div>{(['left','right','top','bottom'] as const).map(side=><button key={side} type="button" aria-label={`Extend building ${side}`} onClick={()=>attempt(()=>extendInterior(map,buildingId,side))}>{({left:'←',right:'→',top:'↑',bottom:'↓'})[side]}</button>)}</div><p>Extensions are checked against nearby buildings and streets.</p></section>
   </aside>
  </fieldset>
  {context&&<MapContextMenu anchor={context} scope={scope.current} onClose={()=>setContext(null)}>{toolList.map(t=><button key={t} role="menuitem" type="button" onClick={()=>chooseTool(t)}>{toolInfo(t).label}</button>)}</MapContextMenu>}
 </div>;
}
