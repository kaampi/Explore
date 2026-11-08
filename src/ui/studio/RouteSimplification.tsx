import { useState } from 'react';
import { simplifyRoute } from '@library/routeSimplify';
import type { ShapePoint } from '@library/mapShapes';

// Anchoring endpoints can introduce harmless floating point differences during a map render.
const signatureOf=(points:ShapePoint[])=>{const round=(n:number)=>Math.round(n*1e7);return JSON.stringify(points.map(p=>[round(p.x),round(p.y),p.mode??null,p.incoming?[round(p.incoming.x),round(p.incoming.y)]:null,p.outgoing?[round(p.outgoing.x),round(p.outgoing.y)]:null]));};
export function RouteSimplification({points,onChange}:{points:ShapePoint[];onChange:(points:ShapePoint[])=>void}){
 const [tolerance,setTolerance]=useState(3),[undo,setUndo]=useState<{before:ShapePoint[];after:string}|null>(null);
 const signature=signatureOf(points),canUndo=undo?.after===signature;
 return <fieldset className="world-map__route-simplify"><legend>Route shape · {points.length} points</legend>
  <p>Keep the shape with fewer editable points. Endpoints and connections stay attached.</p>
  <label>Simplification strength<select value={tolerance} onChange={e=>setTolerance(Number(e.target.value))}><option value={1.5}>Gentle · keep small details</option><option value={3}>Balanced</option><option value={6}>Stronger · fewer points</option></select></label>
  <button type="button" disabled={points.length<=2} onClick={()=>{const next=simplifyRoute(points,tolerance);setUndo({before:structuredClone(points),after:signatureOf(next)});onChange(next);}}>Simplify route</button>
  {canUndo&&<><p role="status">{undo.before.length>points.length?`${undo.before.length} → ${points.length} points. The route remains editable.`:'The current shape needs these points at this strength.'}</p><button type="button" onClick={()=>{onChange(undo.before);setUndo(null);}}>Undo simplification</button></>}
 </fieldset>;
}
