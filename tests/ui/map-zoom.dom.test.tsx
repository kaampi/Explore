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

it('keeps the map point under the pointer fixed during zoom and opens the local settlement separately',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 const repo=new IndexedDBRepository(new IDBFactory(),'pointer-zoom'),town={...settlementPiece('settlement','',50,50),id:'town',name:'Willowbrook'},world=newRealmTemplate({name:'Zoom world',note:'',source:'player',worldMap:{nodes:[town],routes:[]}});
 await repo.saveRealm(world);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<WorldMapStudio repo={repo} initialWorldId={world.id}/>));await act(async()=>{await new Promise(resolve=>setTimeout(resolve,60));});
  const viewport=host.querySelector<HTMLDivElement>('.world-map__viewport')!;
  viewport.getBoundingClientRect=()=>({left:10,top:20,width:800,height:500,right:810,bottom:520,x:10,y:20,toJSON(){}});
  Object.defineProperties(viewport,{clientWidth:{value:800},clientHeight:{value:500}});viewport.scrollLeft=100;viewport.scrollTop=50;
  const svg=host.querySelector<SVGSVGElement>('[aria-label="Places and routes"]')!;expect(svg.style.background).toBe('rgb(216, 227, 186)');
  const wheel=new WheelEvent('wheel',{ctrlKey:true,deltaY:-100,clientX:210,clientY:170,bubbles:true,cancelable:true});await act(async()=>svg.dispatchEvent(wheel));
  expect(wheel.defaultPrevented).toBe(true);expect(svg.style.width).toBe('125%');
  expect((viewport.scrollLeft+200)/1000).toBeCloseTo((100+200)/800);expect((viewport.scrollTop+150)/750).toBeCloseTo((50+150)/600);
  expect(host.querySelector('[aria-label="Build settlement"]')).toBeNull();
  await act(async()=>host.querySelector('[aria-label="Willowbrook"]')!.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})));
  expect(parseFloat(svg.style.width)).toBeCloseTo(500/600*100);expect(viewport.scrollLeft).toBe(0);expect(viewport.scrollTop).toBe(0);
  expect(host.textContent).toContain('Village / city');expect(host.querySelector('[aria-label="Place cottage"]')).not.toBeNull();
  expect((await repo.loadRealm(world.id)).worldMap!.nodes).toHaveLength(1);
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
