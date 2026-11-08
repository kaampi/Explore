// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { IndexedDBRepository } from '../../src/persistence/IndexedDBRepository';
import { newRealmTemplate } from '../../src/library/LibrarySchema';
import { generateSettlement,settlementPiece } from '../../src/library/settlement';
import { routePoints,openRoutePath } from '../../src/library/mapRoutes';
import { WorldMapSchema } from '../../src/library/worldMap';
import { WorldMapStudio } from '../../src/ui/studio/WorldMapStudio';
import { PlayerMapPreview } from '../../src/ui/studio/PlayerMapPreview';

async function click(host:Element,text:string){const button=Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.trim()===text);expect(button,text).toBeTruthy();await act(async()=>button!.click());}
async function select(host:Element,label:string,value:string){const element=Array.from(host.querySelectorAll('label')).find(l=>l.textContent?.startsWith(label))!.querySelector('select')!;await act(async()=>{element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}));});}
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,60));});

it('previews without changing the map, applies real places, saves and shows their actual layout in the overview',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 const repo=new IndexedDBRepository(new IDBFactory(),'settlement-flow'),town={...settlementPiece('settlement','',50,50),id:'town',placeId:'town-place',name:'Willowbrook'},world=newRealmTemplate({name:'Builder world',note:'',source:'player',worldMap:{mapType:'world',nodes:[town],routes:[]}});await repo.saveRealm(world);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<WorldMapStudio repo={repo} initialWorldId={world.id}/>));await flush();await act(async()=>host.querySelector('[aria-label="Willowbrook"]')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));await click(host,'Build settlement →');await click(host,'Generate layout…');
  expect(host.querySelector('.settlement-plan')).not.toBeNull();expect((await repo.loadRealm(world.id)).worldMap!.nodes).toHaveLength(1);await click(host.querySelector('.settlement-builder')!,'Cancel');expect(host.querySelector('.settlement-builder')).toBeNull();
  await click(host,'Generate layout…');const builder=host.querySelector('.settlement-builder')!;await select(builder,'Settlement size','town');await select(builder,'Street pattern','crossroads');await select(builder,'Landmark on the outskirts','hall');expect(builder.textContent).toContain('Community');await click(builder,'Use this layout');expect(host.querySelector('.settlement-builder')).toBeNull();expect((await repo.loadRealm(world.id)).worldMap!.nodes).toHaveLength(1);
  await click(host,'Save map *');await flush();const saved=await repo.loadRealm(world.id),children=saved.worldMap!.nodes.filter(n=>n.parentId==='town');expect(children.some(n=>n.name==='Community hall')).toBe(true);expect(children.filter(n=>n.kind==='Building').length).toBeGreaterThan(18);expect(saved.worldMap!.routes.length).toBeGreaterThan(20);
  const originalIds=children.map(n=>n.id);await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Map location"] button')!.click());expect(host.querySelector('[data-settlement-overview="town"]')).not.toBeNull();
  await act(async()=>root.unmount());const second=createRoot(host);try{await act(async()=>second.render(<WorldMapStudio repo={repo} initialWorldId={world.id}/>));await flush();expect(host.querySelector('[data-settlement-overview="town"]')).not.toBeNull();expect((await repo.loadRealm(world.id)).worldMap!.nodes.filter(n=>n.parentId==='town').map(n=>n.id)).toEqual(originalIds);}finally{await act(async()=>second.unmount());}
 }finally{host.remove();vi.unstubAllGlobals();}
});

it('allows manual placement with keyboard confirmation and cancels placement without creating a place',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 const repo=new IndexedDBRepository(new IDBFactory(),'settlement-manual'),world=newRealmTemplate({name:'Manual town',note:'',source:'player',worldMap:{mapType:'settlement',nodes:[],routes:[]}});await repo.saveRealm(world);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<WorldMapStudio repo={repo} initialWorldId={world.id}/>));await flush();await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Place cottage"]')!.click());expect(host.querySelector('[aria-label="Place cottage on map"]')).not.toBeNull();await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));expect(host.querySelector('[aria-label="Place cottage on map"]')).toBeNull();
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Place inn"]')!.click());await act(async()=>host.querySelector('[aria-label="Place inn on map"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));expect(Array.from(host.querySelectorAll('label')).find(l=>l.textContent?.startsWith('Default entrance'))!.querySelector('select')!.value).toBe('open');await select(host,'Default entrance','locked');await click(host,'Save map *');await flush();const saved=(await repo.loadRealm(world.id)).worldMap!;expect(saved.nodes).toHaveLength(1);expect(saved.nodes[0]!.symbol).toBe('inn');expect(saved.nodes[0]!.contentType).toBe('interior');expect(saved.nodes[0]!.entrance).toBe('locked');
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});

it('does not reveal hidden building locations through the player settlement overview',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const town={...settlementPiece('settlement','',50,50),id:'town',settlementMarker:false,width:18,height:14},home=settlementPiece('cottage','town',20,50),secret={...settlementPiece('inn','town',80,20),visibility:'hidden' as const};const host=document.createElement('div'),root=createRoot(host);
 try{await act(async()=>root.render(<PlayerMapPreview map={{nodes:[town,home,secret],routes:[]}} level=""/>));expect(host.querySelector('[data-settlement-overview="town"]')!.getAttribute('aria-label')).toContain('1 buildings');expect(host.querySelectorAll('image')).toHaveLength(1);}finally{await act(async()=>root.unmount());}
});

it('edits generated street junctions and smooth bends above places, preserves connectivity and saves the geometry',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 vi.stubGlobal('DOMPoint',class{constructor(public x:number,public y:number){}matrixTransform(){return this;}});
 const layout=generateSettlement({size:'village',layout:'crossroads',landmark:'worship'}),road=layout.routes.find(r=>r.type==='road'&&layout.nodes.find(n=>n.id===r.from)?.isJunction&&layout.nodes.find(n=>n.id===r.to)?.isJunction&&layout.routes.filter(other=>other.from===r.from||other.to===r.from).length>1)!,junction=layout.nodes.find(n=>n.id===road.from)!,other=layout.nodes.find(n=>n.id===road.to)!;
 const repo=new IndexedDBRepository(new IDBFactory(),'settlement-street-edit'),world=newRealmTemplate({name:'Editable streets',note:'',source:'player',worldMap:layout});await repo.saveRealm(world);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const pointer=async(target:Element,type:string,x:number,y:number)=>{Object.assign(target,{setPointerCapture:()=>{}});await act(async()=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.assign(event,{button:0,clientX:x,clientY:y,pointerId:1});target.dispatchEvent(event);});};
 try{
  await act(async()=>root.render(<WorldMapStudio repo={repo} initialWorldId={world.id}/>));await flush();
  const svg=host.querySelector('[data-route-edit-layer]')!.closest('svg')!;Object.assign(svg,{getScreenCTM:()=>({inverse:()=>({})})});
  const line=Array.from(host.querySelectorAll('path[aria-label^="Select connection:"]')).find(p=>p.getAttribute('d')===openRoutePath(routePoints(road,junction,other)))!;expect(line).toBeTruthy();await act(async()=>line.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  const layer=host.querySelector('[data-route-edit-layer]')!,start=layer.querySelector('[aria-label="Move street junction (start)"]')!;
  expect(start).toBeTruthy();expect(layer.compareDocumentPosition(line)&Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  const x=Number(start.getAttribute('cx')),y=Number(start.getAttribute('cy'));
  await pointer(start,'pointerdown',x,y);await pointer(start,'pointermove',x,y+24);await pointer(start,'pointerup',x,y+24);
  await click(host,'Add bend');const bend=layer.querySelector('[aria-label="Route bend 1"]')!;expect(bend).toBeTruthy();
  const bx=Number(bend.getAttribute('cx')),by=Number(bend.getAttribute('cy'));await pointer(bend,'pointerdown',bx,by);await pointer(bend,'pointermove',bx+8,by+18);await pointer(bend,'pointerup',bx+8,by+18);
  await act(async()=>bend.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:bx+8,clientY:by+18})));await click(host,'Make Smooth');
  const handle=layer.querySelector('[aria-label="Route outgoing curve handle"]')!;expect(handle).toBeTruthy();const hx=Number(handle.getAttribute('cx')),hy=Number(handle.getAttribute('cy'));await pointer(handle,'pointerdown',hx,hy);await pointer(handle,'pointermove',hx+12,hy-6);await pointer(handle,'pointerup',hx+12,hy-6);
  await click(host,'Save map *');await flush();const saved=(await repo.loadRealm(world.id)).worldMap!,moved=saved.nodes.find(n=>n.id===junction.id)!,edited=saved.routes.find(r=>r.id===road.id)!;
  expect(moved.x).toBe(junction.x);expect(moved.y).toBe(junction.y+4);expect(saved.nodes.filter(n=>n.kind==='Building')).toEqual(layout.nodes.filter(n=>n.kind==='Building'));
  expect(saved.routes.map(r=>[r.id,r.from,r.to])).toEqual(layout.routes.map(r=>[r.id,r.from,r.to]));expect(edited.geometry).toHaveLength(3);expect(edited.geometry![1]!.mode).toBe('smooth');
  const mid=edited.geometry![1]!;expect(mid.incoming!.x+mid.outgoing!.x).toBeCloseTo(2*mid.x);expect(mid.incoming!.y+mid.outgoing!.y).toBeCloseTo(2*mid.y);
  const connected=saved.routes.filter(r=>r.from===moved.id||r.to===moved.id);expect(connected.length).toBeGreaterThan(1);
  for(const r of connected){const a=saved.nodes.find(n=>n.id===r.from)!,b=saved.nodes.find(n=>n.id===r.to)!;expect(routePoints(r,a,b)).not.toEqual(routePoints(layout.routes.find(old=>old.id===r.id)!,layout.nodes.find(n=>n.id===r.from)!,layout.nodes.find(n=>n.id===r.to)!));}
  expect(openRoutePath(routePoints(edited,moved,other))).not.toBe(openRoutePath(routePoints(road,junction,other)));
  // A building entrance remains attached to its building rather than becoming an independently movable endpoint.
  const approach=layout.routes.find(r=>r.type==='path')!,building=layout.nodes.find(n=>n.id===approach.from)!,access=layout.nodes.find(n=>n.id===approach.to)!;
  await act(async()=>host.querySelector(`[aria-label="Select connection: ${building.name} to ${access.name}"]`)!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  expect(layer.querySelector('[aria-label="Move street junction (start)"]')).toBeNull();expect(layer.querySelector('[aria-label="Move street junction (end)"]')).not.toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});

it('simplifies an existing drawn route in the inspector, can undo, and saves its conditions and fewer curve points',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 const geometry=Array.from({length:100},(_,i)=>({x:10+80*i/99,y:50+20*Math.sin(i/99*Math.PI)}));
 const map=WorldMapSchema.parse({nodes:[{id:'a',name:'West',kind:'Settlement',x:10,y:50},{id:'b',name:'East',kind:'Settlement',x:90,y:50}],routes:[{id:'r',from:'a',to:'b',fromAnchor:{x:.5,y:.5},toAnchor:{x:.5,y:.5},geometry,type:'road',mode:'Walk',duration:'30 minutes',manualTime:true,access:'locked',bothWays:false,description:'Keep the guarded road'}]});
 const repo=new IndexedDBRepository(new IDBFactory(),'route-simplify-save'),world=newRealmTemplate({name:'Curved road',note:'',source:'player',worldMap:map});await repo.saveRealm(world);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<WorldMapStudio repo={repo} initialWorldId={world.id}/>));await flush();await act(async()=>host.querySelector('[aria-label="Select connection: West to East"]')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await click(host,'Simplify route');expect(host.querySelectorAll('[aria-label^="Route bend "]').length).toBeLessThan(5);await click(host,'Undo simplification');expect(host.querySelectorAll('[aria-label^="Route bend "]')).toHaveLength(98);
  await click(host,'Simplify route');await click(host,'Save map *');await flush();const saved=(await repo.loadRealm(world.id)).worldMap!,r=saved.routes[0]!;expect(r.geometry!.length).toBeLessThanOrEqual(4);expect(r.from).toBe('a');expect(r.to).toBe('b');expect(r.manualTime).toBe(true);expect(r.duration).toBe('30 minutes');expect(r.access).toBe('locked');expect(r.bothWays).toBe(false);expect(r.description).toBe('Keep the guarded road');expect(saved.nodes).toEqual(map.nodes);
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});

it('builds a location marker at the right-click position, cancels cleanly, and keeps legacy settlements until explicitly converted',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('DOMPoint',class{constructor(public x:number,public y:number){}matrixTransform(){return this;}});HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 const legacy={...settlementPiece('settlement','',20,20),id:'legacy',placeId:'legacy-place',name:'Old town',settlementMarker:false,width:18,height:14},home=settlementPiece('cottage','legacy',50,50),forest={...settlementPiece('square','',50,50),id:'wood',placeId:'wood-place',name:'Old wood',kind:'Forest',width:70,height:70};
 const repo=new IndexedDBRepository(new IDBFactory(),'settlement-location'),world=newRealmTemplate({name:'Location world',note:'',source:'player',worldMap:{mapType:'world',nodes:[forest,legacy,home],routes:[]}});await repo.saveRealm(world);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const rightClick=async()=>act(async()=>{host.querySelector('[aria-label="Old wood"]')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:600,clientY:420}));});
 try{
  await act(async()=>root.render(<WorldMapStudio repo={repo} initialWorldId={world.id}/>));await flush();Object.assign(host.querySelector('svg.world-map__canvas')!,{getScreenCTM:()=>({inverse:()=>({})})});
  await click(host,'＋ Settlement');const placement=host.querySelector('[aria-label="Place settlement on map"]')!;await act(async()=>{const move=new Event('pointermove',{bubbles:true});Object.assign(move,{clientX:600,clientY:420});placement.dispatchEvent(move);});expect(placement.parentElement!.querySelector('[data-settlement-marker]')).not.toBeNull();expect(placement.parentElement!.querySelectorAll('rect')).toHaveLength(1);await click(host,'Cancel placement');
  await rightClick();await click(host,'Build settlement here…');expect(host.querySelector('[aria-label="Build settlement here"]')).not.toBeNull();expect((await repo.loadRealm(world.id)).worldMap!.nodes).toHaveLength(3);await click(host.querySelector('dialog')!,'Cancel');expect(host.querySelector('dialog')).toBeNull();
  await rightClick();await click(host,'Build settlement here…');await act(async()=>{const input=host.querySelector<HTMLInputElement>('[placeholder="Name your village or city"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Willowbrook');input.dispatchEvent(new Event('input',{bubbles:true}));});await click(host,'Build settlement');expect(host.querySelector('[aria-label="Settlement building tools"]')).not.toBeNull();expect(host.textContent).toContain('Generate layout…');
  await click(host,'Save map *');await flush();let saved=(await repo.loadRealm(world.id)).worldMap!,created=saved.nodes.find(n=>n.name==='Willowbrook')!;expect(created.x).toBe(75);expect(created.y).toBe(70);expect(created.settlementMarker).toBe(true);expect(created.width).toBeUndefined();expect(saved.nodes.find(n=>n.id==='legacy')).toEqual(legacy);
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Map location"] button')!.click());expect(host.querySelector(`[data-settlement-marker="${created.id}"]`)).not.toBeNull();await act(async()=>host.querySelector('[aria-label="Old town"]')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));await click(host,'Show as location marker');expect(host.querySelector('[data-settlement-marker="legacy"]')).not.toBeNull();expect(host.querySelector('[aria-label="Resize Old town"]')).toBeNull();await click(host,'Save map *');await flush();saved=(await repo.loadRealm(world.id)).worldMap!;expect(saved.nodes.find(n=>n.id===home.id)).toEqual(home);expect(saved.nodes.find(n=>n.id==='legacy')!.settlementMarker).toBe(true);expect(saved.nodes.find(n=>n.id==='legacy')!.placeId).toBe('legacy-place');
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});

it('shows parent roads and water as a locked, scaled underlay in the editor and generator without copying or changing geography',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 const town={...settlementPiece('settlement','',50,50),id:'town',name:'Riverside',distanceScale:{value:25,unit:'m',kmPerUnit:.001}},west={...settlementPiece('settlement','',10,50),id:'west',name:'West'},lake={...settlementPiece('square','',51,50),id:'lake',name:'World lake',kind:'Lake',width:1,height:3};
 const approach={id:'approach',from:'west',to:'town',type:'road' as const,mode:'Walk',duration:'30 minutes',manualTime:true,access:'open' as const,bothWays:true};
 const repo=new IndexedDBRepository(new IDBFactory(),'settlement-context'),world=newRealmTemplate({name:'Context world',note:'',source:'player',worldMap:{mapType:'world',distanceScale:{value:1,unit:'km',kmPerUnit:1},nodes:[town,west,lake],routes:[approach]}});await repo.saveRealm(world);const before=structuredClone(world.worldMap!);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<WorldMapStudio repo={repo} initialWorldId={world.id} initialLevel="town"/>));await flush();let underlay=host.querySelector('[data-world-context="town"]')!;expect(underlay).not.toBeNull();expect(underlay.getAttribute('pointer-events')).toBe('none');expect(underlay.querySelector('[data-context-route="approach"]')).not.toBeNull();expect(underlay.querySelector('[data-context-terrain="lake"]')).not.toBeNull();expect(underlay.querySelector('[data-context-projection]')!.getAttribute('transform')).toBe('matrix(40 0 0 40 -15600 -11700)');expect(underlay.querySelectorAll('button,[role="button"],[tabindex]')).toHaveLength(0);expect(host.querySelector('[aria-label="World lake"]')).toBeNull();
  const toggle=host.querySelector<HTMLInputElement>('.settlement-world-context input')!;await act(async()=>toggle.click());expect(host.querySelector('[data-world-context]')).toBeNull();await act(async()=>toggle.click());expect(host.querySelector('[data-world-context]')).not.toBeNull();expect((await repo.loadRealm(world.id)).worldMap).toEqual(before);
  await click(host,'Generate layout…');expect(host.querySelector('.settlement-plan [data-world-context="town"]')).not.toBeNull();await click(host.querySelector('.settlement-builder')!,'Cancel');
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Place cottage"]')!.click());await act(async()=>host.querySelector('[aria-label="Place cottage on map"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));await click(host,'Save map *');await flush();const saved=(await repo.loadRealm(world.id)).worldMap!;expect(saved.nodes.find(n=>n.id==='lake')).toEqual(lake);expect(saved.routes.find(r=>r.id==='approach')).toEqual(approach);expect(saved.nodes.filter(n=>n.parentId==='town')).toHaveLength(1);expect(saved.nodes.filter(n=>n.kind==='Lake')).toHaveLength(1);
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});

it('places settlement objects and blocks dry-land docks and attempts to drag docks away from the shoreline',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('DOMPoint',class{constructor(public x:number,public y:number){}matrixTransform(){return this;}});
 const water={...settlementPiece('square','',80,50),id:'water',kind:'Lake',name:'Lake',width:20,height:70},repo=new IndexedDBRepository(new IDBFactory(),'settlement-objects'),world=newRealmTemplate({name:'Harbour',note:'',source:'player',worldMap:{mapType:'settlement',nodes:[water],routes:[]}});await repo.saveRealm(world);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const choose=async(value:string)=>act(async()=>{const select=host.querySelector<HTMLSelectElement>('[aria-label="Settlement object"]')!;select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});
 const pointer=async(target:Element,type:string,x:number,y:number)=>{Object.assign(target,{setPointerCapture:()=>{}});await act(async()=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.assign(event,{button:0,clientX:x,clientY:y,pointerId:1});target.dispatchEvent(event);});};
 try{await act(async()=>root.render(<WorldMapStudio repo={repo} initialWorldId={world.id}/>));await flush();Object.assign(host.querySelector('svg.world-map__canvas')!,{getScreenCTM:()=>({inverse:()=>({})})});
  for(const piece of ['fields','cattle','well']){await choose(piece);await act(async()=>host.querySelector(`[aria-label="Place ${piece} on map"]`)!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));expect(host.querySelector(`image[href="/map-assets/houses/${piece}.svg"]`)).not.toBeNull();}
  await choose('docks');const placement=host.querySelector('[aria-label="Place docks on map"]')!;await act(async()=>placement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));expect(host.textContent).toContain('Docks need water');expect(host.querySelector('[aria-label="Place docks on map"]')).not.toBeNull();
  await pointer(placement,'pointerdown',560,300);expect(host.querySelector('[aria-label="Place docks on map"]')).toBeNull();const dock=host.querySelector('[role="button"][aria-label="Docks"]')!;expect(dock).toBeTruthy();await pointer(dock,'pointerdown',560,300);await pointer(dock,'pointermove',240,300);await pointer(dock,'pointerup',240,300);await click(host,'Save map *');await flush();const saved=(await repo.loadRealm(world.id)).worldMap!,placed=saved.nodes.find(n=>n.name==='Docks')!;expect(placed.x).toBe(70);expect(placed.placementRule).toBe('shoreline');expect(saved.nodes.filter(n=>['fields','cattle','well','docks'].includes(n.symbol??''))).toHaveLength(4);expect(saved.nodes.find(n=>n.id==='water')).toEqual(water);
  await click(host,'From template…');await flush();await act(async()=>Array.from(host.querySelectorAll<HTMLButtonElement>('.blueprints nav button')).find(b=>b.querySelector('strong')?.textContent==='Police station')!.click());await click(host,'Add to map');await click(host,'Save map *');await flush();expect((await repo.loadRealm(world.id)).worldMap!.nodes.some(n=>n.name==='Police station'&&n.kind==='Building')).toBe(true);
  await click(host,'From template…');await flush();await act(async()=>Array.from(host.querySelectorAll<HTMLButtonElement>('.blueprints nav button')).find(b=>b.querySelector('strong')?.textContent==='Docks')!.click());await click(host,'Add to map');const templateDock=host.querySelector('[aria-label="Place Docks on map"]')!;expect(templateDock).toBeTruthy();await act(async()=>templateDock.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));expect(host.querySelector('[aria-label="Place Docks on map"]')).not.toBeNull();await click(host,'Cancel placement');expect((await repo.loadRealm(world.id)).worldMap!.nodes.filter(n=>n.symbol==='docks')).toHaveLength(1);
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
