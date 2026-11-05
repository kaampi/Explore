// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { CombatEmbers } from '../../src/ui/combat/CombatEmbers';
it('limits resolution, uses its own visual randomness, pauses when hidden and releases animation resources',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const gradient={addColorStop:vi.fn()},ctx={createRadialGradient:()=>gradient,fillRect:vi.fn(),clearRect:vi.fn(),drawImage:vi.fn(),setTransform:vi.fn(),globalAlpha:1,globalCompositeOperation:'',fillStyle:gradient};
 const context=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx as never),rect=vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({x:0,y:0,top:0,left:0,right:200,bottom:300,width:200,height:300,toJSON:()=>({})});
 const frames=new Map<number,FrameRequestCallback>();let id=0,hidden=false;
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++id,callback);return id;});vi.stubGlobal('cancelAnimationFrame',(key:number)=>frames.delete(key));
 const visibility=vi.spyOn(document,'hidden','get').mockImplementation(()=>hidden),disconnect=vi.fn();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect=disconnect;});
 const motion={matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()};vi.stubGlobal('matchMedia',()=>motion);const dpr=vi.spyOn(window,'devicePixelRatio','get').mockReturnValue(4),random=vi.spyOn(Math,'random');
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<CombatEmbers/>));expect(host.querySelector('canvas')?.width).toBe(400);expect(host.querySelector('canvas')?.height).toBe(600);const randomCount=random.mock.calls.length;
  for(let time=0;time<=800;time+=40){const [key,callback]=Array.from(frames.entries())[0]!;frames.delete(key);callback(time);}
  expect(ctx.drawImage).toHaveBeenCalled();expect(random.mock.calls.length).toBe(randomCount);expect(frames.size).toBe(1);
  hidden=true;document.dispatchEvent(new Event('visibilitychange'));expect(frames.size).toBe(0);hidden=false;document.dispatchEvent(new Event('visibilitychange'));expect(frames.size).toBe(1);
  await act(async()=>root.unmount());expect(frames.size).toBe(0);expect(disconnect).toHaveBeenCalledTimes(1);expect(motion.removeEventListener).toHaveBeenCalled();
 }finally{host.remove();context.mockRestore();rect.mockRestore();visibility.mockRestore();dpr.mockRestore();random.mockRestore();vi.unstubAllGlobals();}
});
