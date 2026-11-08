// @vitest-environment jsdom
import { act,useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { InteriorEditor } from '../../src/ui/studio/InteriorEditor';
import { ensureInterior } from '../../src/library/interior';
import { interiorScale } from '../../src/library/interiorScale';
import { settlementPiece } from '../../src/library/settlement';
import type { WorldMap } from '../../src/library/worldMap';

it('clicks out a right-angled wall, previews it, commits only on completion and cancels corners without changing the map',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});SVGElement.prototype.setPointerCapture=()=>{};
 const initial=ensureInterior({nodes:[{...settlementPiece('cottage','',50,50),id:'house',placeId:'house-place'}],routes:[]},'house');let current=initial;const changed=vi.fn();
 function Editor(){const [map,setMap]=useState<WorldMap>(initial);current=map;return <InteriorEditor map={map} buildingId="house" onChange={next=>{changed(next);setMap(next);}}/>;}
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const click=async(label:string)=>{const b=Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.trim()===label)!;expect(b,label).toBeTruthy();await act(async()=>b.click());};
 let svg:SVGSVGElement;
 const pointer=async(type:string,x:number,y:number,shift=false)=>act(async()=>{const m=interiorScale(current.nodes[0]!),e=new MouseEvent(type,{bubbles:true,button:0,shiftKey:shift,clientX:(50+(x-50)*m.scaleX)*8,clientY:(50+(y-50)*m.scaleY)*6});Object.defineProperty(e,'pointerId',{value:1});svg.dispatchEvent(e);});
 const press=async(x:number,y:number,shift=false)=>{await pointer('pointerdown',x,y,shift);await pointer('pointerup',x,y,shift);};
 try{
  await act(async()=>root.render(<Editor/>));svg=host.querySelector('[aria-label="House floor plan"]')!;svg.getBoundingClientRect=()=>({left:0,top:0,x:0,y:0,width:800,height:600,right:800,bottom:600,toJSON(){}});
  await click('╱Wall');await press(10,40);await press(30,42,true);await pointer('pointermove',32,90,true);const preview=host.querySelector('[aria-label="Wall preview"]')!.getAttribute('points')!.split(/[ ,]/).map(Number);expect(preview).toHaveLength(6);[80,240,240,240,240,540].forEach((value,i)=>expect(preview[i]).toBeCloseTo(value));expect(changed).not.toHaveBeenCalled();
  await press(32,90,true);expect(current.nodes.filter(n=>n.kind==='Room')).toHaveLength(4);expect(changed).toHaveBeenCalledTimes(1);expect(host.querySelector('[aria-label="Wall preview"]')).toBeNull();await click('↶ Undo');expect(current).toEqual(initial);
  await press(10,40);await press(30,40);await act(async()=>svg.dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true})));expect(host.querySelector('[aria-label="Wall preview"]')?.getAttribute('points')).toBe('80,240');const escape=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});await act(async()=>svg.dispatchEvent(escape));expect(escape.defaultPrevented).toBe(true);expect(host.querySelector('[aria-label="Wall preview"]')).toBeNull();expect(current).toEqual(initial);expect(changed).toHaveBeenCalledTimes(2);
 }finally{await act(async()=>root.unmount());host.remove();}
});
