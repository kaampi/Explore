// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect,it,vi } from "vitest";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { newRealmTemplate } from "../../src/library/LibrarySchema";
import { MapLibrary } from "../../src/ui/studio/MapLibrary";
it("opens the map library, protects unsaved work and saves before returning to cards",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.stubGlobal("ResizeObserver",class{observe(){}disconnect(){}});
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","");};
 HTMLDialogElement.prototype.close=function(){this.removeAttribute("open");};
 const repo=new IndexedDBRepository(new IDBFactory(),"map-library-modal");
 const world=newRealmTemplate({name:"Test world",note:"",source:"player",worldMap:{nodes:[],routes:[],mapType:"world"}});await repo.saveRealm(world);
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 const settle=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});};
 const click=async(text:string)=>{const button=Array.from(el.querySelectorAll("button")).find(b=>b.textContent?.includes(text));expect(button).toBeTruthy();await act(async()=>button!.click());await settle();};
 try{
 await act(async()=>root.render(<MapLibrary repo={repo}/>));await settle();expect(el.querySelectorAll(".map-library__card")).toHaveLength(1);expect(el.querySelector("dialog[open]")).toBeNull();
 await click("Open Map Studio");expect(el.querySelector(".map-studio-window")).toBeTruthy();await act(async()=>{(el.querySelector('button[aria-label="Terrain brush"]') as HTMLButtonElement).click();});await settle();expect(el.querySelector('[aria-label="Terrain painting"]')).toBeTruthy();
 await click('Low mountain');expect(el.querySelector('[aria-label="Terrain painting"]')).toBeNull();
 const view=el.querySelector('.world-map__viewport')!;const size=el.querySelector('input[type="range"]') as HTMLInputElement;const initialSize=Number(size.value);
 await act(async()=>{view.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,altKey:true,deltaY:-100}));});expect(Number(size.value)).toBeGreaterThan(initialSize);
 await act(async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',bubbles:true,cancelable:true}));});expect(view.classList.contains('is-panning')).toBe(true);
 await act(async()=>{window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',bubbles:true}));});expect(view.classList.contains('is-panning')).toBe(false);
 await click("Generate regions");
 await act(async()=>{(el.querySelector('button[aria-label="Close dialog"]') as HTMLButtonElement).click();});await settle();expect(el.textContent).toContain("Unsaved map changes");
 await click("Keep editing");expect(el.querySelector(".map-studio-window")).toBeTruthy();
 await act(async()=>{(el.querySelector('button[aria-label="Close dialog"]') as HTMLButtonElement).click();});await settle();await click("Save & close");
 expect(el.querySelector(".map-studio-window")).toBeNull();expect((await repo.loadRealm(world.id)).worldMap?.nodes.length).toBeGreaterThan(0);expect(el.querySelectorAll(".map-library__card").length).toBeGreaterThan(0);
 }finally{await act(async()=>root.unmount());el.remove();vi.unstubAllGlobals();}
});
