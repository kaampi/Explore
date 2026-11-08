import { interiorScale } from "../../src/library/interiorScale";
// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { IndexedDBRepository } from '../../src/persistence/IndexedDBRepository';
import { newRealmTemplate } from '../../src/library/LibrarySchema';
import { settlementPiece } from '../../src/library/settlement';
import { WorldMapStudio } from '../../src/ui/studio/WorldMapStudio';
vi.mock('../../src/ui/studio/portrait',()=>({sceneImagesFromFile:vi.fn(async()=>({imageDataUrl:'data:image/jpeg;base64,ROOM',thumbDataUrl:'data:image/jpeg;base64,THUMB'}))}));

it('opens a house by double-click, draws a partition, furnishes and pictures rooms, edits door access and reloads the saved interior',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});SVGElement.prototype.setPointerCapture=()=>{};
 const repo=new IndexedDBRepository(new IDBFactory(),'interior-ui'),building={...settlementPiece('cottage','',50,50),id:'house',placeId:'house-place',name:'Test cottage'},world=newRealmTemplate({name:'Interior test',source:'player',note:'',worldMap:{mapType:'settlement',nodes:[building],routes:[]}});await repo.saveRealm(world);
 const host=document.createElement('div');document.body.append(host);let root=createRoot(host);
 const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,70));});
 const click=async(text:string)=>{const button=Array.from(host.querySelectorAll<HTMLButtonElement>('.interior-editor button, .world-map__worldbar button')).find(b=>b.textContent?.trim()===text);expect(button,text).toBeTruthy();await act(async()=>button!.click());};
 const pointer=async(element:Element,type:string,x:number,y:number)=>act(async()=>{const event=new MouseEvent(type,{bubbles:true,button:0,clientX:(50+(x-50)*interiorScale(building).scaleX)*8,clientY:(50+(y-50)*interiorScale(building).scaleY)*6});Object.defineProperty(event,'pointerId',{value:1});element.dispatchEvent(event);});
 try{
  await act(async()=>root.render(<WorldMapStudio repo={repo} initialWorldId={world.id}/>));await flush();await act(async()=>host.querySelector('[aria-label="Test cottage"]')!.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})));await flush();
  expect(host.querySelector('.interior-editor')).not.toBeNull();expect(host.querySelectorAll('[data-interior-room]')).toHaveLength(3);expect((await repo.loadRealm(world.id)).worldMap!.nodes).toHaveLength(1);
  const plan=host.querySelector<SVGSVGElement>('[aria-label="House floor plan"]')!;plan.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,width:800,height:600,right:800,bottom:600,toJSON(){}});
  await click('╱Wall');await pointer(plan,'pointerdown',10,45);await pointer(plan,'pointerup',60,45);expect(host.querySelectorAll('[data-interior-room]')).toHaveLength(4);
  await click('▤Table');await pointer(plan,'pointerdown',20,20);expect(host.querySelector('[aria-label="Select furniture Table"]')).not.toBeNull();
  await click('▰Bed');await pointer(plan,'pointerdown',75,30);const bed=host.querySelector('[aria-label="Select furniture Bed"]')!;expect(bed.getAttribute('data-furniture-width-m')).toBe('0.9');expect(bed.getAttribute('data-furniture-depth-m')).toBe('2');expect(host.querySelector('[aria-label="Metre scale"]')).not.toBeNull();
  const widthInput=host.querySelector<HTMLInputElement>('.interior-editor__size input')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(widthInput,'10');widthInput.dispatchEvent(new Event('input',{bubbles:true}));});await click('Apply house size');expect(host.querySelector('.interior-editor__intro')!.textContent).toContain('10.0 × 7.0 m');
  await click('↖Select');const room=host.querySelector('[data-interior-room]')!;await act(async()=>room.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  const upload=host.querySelector<HTMLInputElement>('.interior-editor input[type=file]')!;Object.defineProperty(upload,'files',{configurable:true,value:[new File(['picture'],'room.jpg',{type:'image/jpeg'})]});await act(async()=>upload.dispatchEvent(new Event('change',{bubbles:true})));await flush();expect(host.querySelector<HTMLImageElement>('.interior-editor__picture img')?.src).toContain('ROOM');
  const door=host.querySelector('[aria-label="Select open door"]')!;await act(async()=>door.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));const access=host.querySelector<HTMLSelectElement>('.interior-editor__details select')!;await act(async()=>{access.value='locked';access.dispatchEvent(new Event('change',{bubbles:true}));});
  await click('Save map *');await flush();const saved=(await repo.loadRealm(world.id)).worldMap!,ids=saved.nodes.filter(n=>n.kind==='Room').map(n=>n.id);expect(ids).toHaveLength(4);expect(saved.nodes.some(n=>n.furnitureType==='table')).toBe(true);expect(saved.nodes.some(n=>n.imageDataUrl?.includes('ROOM'))).toBe(true);expect(saved.routes.some(r=>r.access==='locked')).toBe(true);expect((await repo.listPlaces()).filter(p=>ids.includes(p.id))).toHaveLength(4);
  await act(async()=>root.unmount());root=createRoot(host);await act(async()=>root.render(<WorldMapStudio repo={repo} initialWorldId={world.id} initialLevel="house"/>));await flush();expect(host.querySelectorAll('[data-interior-room]')).toHaveLength(4);expect((await repo.loadRealm(world.id)).worldMap!.nodes.filter(n=>n.kind==='Room').map(n=>n.id)).toEqual(ids);
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
