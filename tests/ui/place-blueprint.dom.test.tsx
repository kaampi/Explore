// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it } from 'vitest';
import { PlaceBlueprintStudio } from '../../src/ui/studio/PlaceBlueprintStudio';
import { IndexedDBRepository } from '../../src/persistence/IndexedDBRepository';
it('shows the guided editor, saves a template, and places a saved independent copy',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const repo=new IndexedDBRepository(new IDBFactory(),'blueprint-ui'),el=document.createElement('div');document.body.append(el);const root=createRoot(el);let used='';
 const settle=()=>act(async()=>{await new Promise(r=>setTimeout(r,25));});
 const click=async(text:string)=>{const b=Array.from(el.querySelectorAll('button')).find(b=>b.textContent?.includes(text));expect(b).toBeTruthy();await act(async()=>b!.click());};
 try{await act(async()=>root.render(<PlaceBlueprintStudio repo={repo} onUse={t=>{used=t.id;}}/>));await settle();await click('Ruin');expect(el.textContent).toContain('1 · What kind of place?');expect(el.textContent).toContain('3 · Appearance & settings');await click('Add to map');expect(used).toBe('starter-ruin');
 const form=el.querySelector('form')!;await act(async()=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});await settle();expect(el.textContent).toContain('Template saved. Existing places are unchanged.');
 }finally{await act(async()=>root.unmount());el.remove();}
});
