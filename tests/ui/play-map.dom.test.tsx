// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it } from 'vitest';
import { PlayMapCard } from '../../src/ui/components/PlayMapCard';
import { playMapModel } from '../../src/library/playMap';
import { playMapFixture } from '../fixtures/play-map';

it('opens a larger player map, zooms and identifies known places without leaking private notes or offering teleportation',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 const f=playMapFixture();f.session.scene!.placeId=f.home.placeId;f.session.scene!.location=f.home.name;const model=playMapModel(f.session,[f.world])!,host=document.createElement('div');document.body.append(host);const root=createRoot(host),before=JSON.stringify(f.world);
 const click=async(label:string)=>act(async()=>{const element=Array.from(host.querySelectorAll<HTMLElement>('button,[role="button"]')).find(b=>b.getAttribute('aria-label')===label||b.textContent===label)!;expect(element,label).toBeTruthy();element.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
 try{await act(async()=>root.render(<PlayMapCard model={model}/>));expect(host.textContent).toContain('Riverside');expect(host.querySelector('[aria-label="Your location: Cottage"]')).not.toBeNull();expect(host.querySelector('image[href="/map-assets/houses/cottage.svg"]')).not.toBeNull();expect(host.querySelector('image[href="/map-assets/houses/longhouse.svg"]')).not.toBeNull();expect(host.querySelector('[data-map-place="secret"]')).toBeNull();expect(host.textContent).not.toContain('PRIVATE AUTHOR NOTE');
  await click('Open map of Riverside');expect(host.querySelector('dialog[open]')).not.toBeNull();await click('Zoom in player map');expect(host.textContent).toContain('150%');await click('Show Meeting hall on map');expect(host.querySelector('.play-map-dialog aside')!.textContent).toContain('Meeting hall');expect(host.querySelector('.play-map-dialog aside')!.textContent).not.toContain('PRIVATE AUTHOR NOTE');expect(host.querySelectorAll('[aria-label*="Secret hideout"]')).toHaveLength(0);expect(host.textContent).not.toContain('Go there');await click('Fit map');expect(host.textContent).toContain('100%');
  const surface=host.querySelector<SVGSVGElement>('.play-map-dialog .play-map__surface')!;
  surface.getBoundingClientRect=()=>({left:20,top:30,width:800,height:600,right:820,bottom:630,x:20,y:30,toJSON(){}});
  expect(surface.querySelector('rect')!.getAttribute('fill')).toBe('#d8e3ba');
  const wheel=new WheelEvent('wheel',{deltaY:-100,clientX:620,clientY:480,bubbles:true,cancelable:true});await act(async()=>surface.dispatchEvent(wheel));expect(wheel.defaultPrevented).toBe(true);expect(host.textContent).toContain('125%');
  expect(surface.children[1]!.getAttribute('transform')).toBe('translate(350 262.5) scale(1.25) translate(-400 -300)');
  await act(async()=>surface.dispatchEvent(new WheelEvent('wheel',{deltaY:100,clientX:620,clientY:480,bubbles:true,cancelable:true})));expect(surface.children[1]!.getAttribute('transform')).toBe('translate(400 300) scale(1) translate(-400 -300)');
  await click('Close dialog');expect(host.querySelector('dialog')).toBeNull();expect(JSON.stringify(f.world)).toBe(before);
 }finally{await act(async()=>root.unmount());host.remove();}
});
