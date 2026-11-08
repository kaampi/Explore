// @vitest-environment jsdom
import { act,useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it } from 'vitest';
import { RouteSimplification } from '../../src/ui/studio/RouteSimplification';
import type { ShapePoint } from '../../src/library/mapShapes';

it('shows point reduction, restores the exact original on undo and does not offer stale undo after another edit',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const input:ShapePoint[]=Array.from({length:100},(_,i)=>({x:10+i*.8,y:50+Math.sin(i/99*Math.PI)*20}));let latest:ShapePoint[]=input;
 function Harness(){const [points,setPoints]=useState(input);latest=points;return <><RouteSimplification points={points} onChange={setPoints}/><button onClick={()=>setPoints(p=>p.map((point,i)=>i===0?{...point,x:point.x+1}:point))}>Other edit</button></>;}
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),click=async(text:string)=>act(async()=>{Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!.click();});
 try{await act(async()=>root.render(<Harness/>));expect(host.textContent).toContain('100 points');await click('Simplify route');expect(latest.length).toBeLessThan(10);expect(host.querySelector('[role="status"]')!.textContent).toContain(`100 → ${latest.length}`);await click('Undo simplification');expect(latest).toEqual(input);await click('Simplify route');await click('Other edit');expect(host.textContent).not.toContain('Undo simplification');}finally{await act(async()=>root.unmount());host.remove();}
});
