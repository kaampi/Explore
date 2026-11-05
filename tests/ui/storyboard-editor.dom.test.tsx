// @vitest-environment jsdom
import { act,useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { StoryboardEditor } from '../../src/ui/studio/StoryboardEditor';
import { connectedAdventureExample } from '../../src/library/playableCampaign';
import { parseCampaignTemplate } from '../../src/library/LibrarySchema';

async function click(host:HTMLElement,text:string){const button=Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text);expect(button,text).toBeTruthy();await act(async()=>button!.click());}
it('keeps the context menu in the modal, edits the clicked scene, and preserves the draft on close and reopen',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 const built=connectedAdventureExample(),host=document.createElement('div');document.body.append(host);const root=createRoot(host),save=vi.fn(),play=vi.fn();let snapshot=built.campaign;
 function Harness(){const [campaign,setCampaign]=useState(built.campaign),[open,setOpen]=useState(true);snapshot=campaign;return <><button onClick={()=>setOpen(true)}>Reopen editor</button>{open&&<StoryboardEditor campaign={campaign} places={built.places} characters={built.characters} objects={built.objects} busy={false} onChange={setCampaign} onPlay={play} onSave={save} onClose={()=>setOpen(false)}/>}</>;}
 try{
  await act(async()=>root.render(<Harness/>));const dialog=host.querySelector('dialog')!;expect(dialog.open).toBe(true);
  const inlineStart=dialog.querySelector<HTMLButtonElement>('.playable-storyboard__test button')!;expect(inlineStart.disabled).toBe(false);await act(async()=>inlineStart.click());expect(play).toHaveBeenCalledWith(built.campaign.scenes[0]);
  const card=host.querySelector<HTMLElement>(`[data-scene-id="${built.campaign.scenes[1]!.id}"]`)!;
  await act(async()=>card.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:300,clientY:150})));
  const menu=dialog.querySelector('[role="menu"]')!;expect(menu.getAttribute('aria-label')).toBe('Storyboard actions');await act(async()=>menu.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));expect(dialog.open).toBe(true);expect(dialog.querySelector('[role="menu"]')).toBeNull();
  await act(async()=>card.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:300,clientY:150})));await click(dialog,'Add action');expect(snapshot.scenes[0]!.encounter!.definition.interactions).toHaveLength(2);expect(snapshot.scenes[1]!.encounter!.definition.interactions).toHaveLength(2);expect((document.activeElement as HTMLInputElement).value).toBe('New action');await click(dialog,'Save adventure');expect(save).toHaveBeenCalledTimes(1);
  await act(async()=>dialog.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!.click());expect(host.querySelector('dialog')).toBeNull();await click(host,'Reopen editor');expect(host.querySelector('dialog')!.open).toBe(true);expect(snapshot.scenes[1]!.encounter!.definition.interactions).toHaveLength(2);expect(parseCampaignTemplate(JSON.parse(JSON.stringify(snapshot))).scenes[1]!.encounter!.definition.interactions).toHaveLength(2);
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('creates a playable scene at the clicked canvas position and targets connection actions correctly',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 const built=connectedAdventureExample(),host=document.createElement('div');document.body.append(host);const root=createRoot(host);let snapshot=built.campaign;
 function Harness(){const [campaign,setCampaign]=useState(built.campaign);snapshot=campaign;return <StoryboardEditor campaign={campaign} places={built.places} characters={built.characters} objects={built.objects} busy={false} onChange={setCampaign} onPlay={()=>{}} onClose={()=>{}}/>;}
 try{await act(async()=>root.render(<Harness/>));await act(async()=>host.querySelector('.storyboard-board')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:460,clientY:300})));await click(host,'Add scene here');expect(snapshot.scenes).toHaveLength(3);expect(snapshot.scenes[2]!.position).toEqual({x:460,y:300});expect(snapshot.scenes[2]!.encounter!.definition.id).toBe(snapshot.scenes[2]!.id);const line=host.querySelector(`[data-link-id="${built.campaign.sceneLinks[1]!.id}"] path`)!;await act(async()=>line.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:270,clientY:260})));await click(host,'Remove connection');expect(snapshot.sceneLinks.map(l=>l.id)).toEqual([built.campaign.sceneLinks[0]!.id]);expect(snapshot.scenes).toHaveLength(3);}
 finally{await act(async()=>root.unmount());host.remove();}
});

it('anchors the context-menu connector to its source until the author chooses a destination, and cancels without edits',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 const built=connectedAdventureExample();built.campaign.scenes.push({...structuredClone(built.campaign.scenes[1]!),id:'cabin-scene',name:'Hunter’s cabin'});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let snapshot=built.campaign;
 function Harness(){const [campaign,setCampaign]=useState(built.campaign);snapshot=campaign;return <StoryboardEditor campaign={campaign} places={built.places} characters={built.characters} objects={built.objects} busy={false} onChange={setCampaign} onPlay={()=>{}} onClose={()=>{}}/>;}
 try{
  await act(async()=>root.render(<Harness/>));const source=host.querySelector<HTMLElement>('[data-scene-id="cabin-scene"]')!;
  const begin=async()=>{await act(async()=>source.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:400,clientY:230})));await click(host,'Connect to another scene');};
  await begin();expect(snapshot.sceneLinks).toHaveLength(2);expect(host.querySelector('.storyboard-line--draft')).not.toBeNull();expect(host.textContent).toContain('Connecting from Hunter’s cabin');
  await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));expect(snapshot.sceneLinks).toHaveLength(2);expect(host.querySelector('.storyboard-line--draft')).toBeNull();
  await begin();const destination=host.querySelector<HTMLElement>(`[data-scene-id="${built.campaign.scenes[1]!.id}"]`)!;
  const previousHitTest=Object.getOwnPropertyDescriptor(document,'elementFromPoint');Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>destination});
  try{const draft=host.querySelector('.storyboard-line--draft')!.getAttribute('d');await act(async()=>host.querySelector('.storyboard-board')!.dispatchEvent(new MouseEvent('pointermove',{bubbles:true,clientX:650,clientY:350})));expect(host.querySelector('.storyboard-line--draft')!.getAttribute('d')).not.toBe(draft);expect(destination.classList.contains('is-drop-target')).toBe(true);expect(snapshot.sceneLinks).toHaveLength(2);}finally{if(previousHitTest)Object.defineProperty(document,'elementFromPoint',previousHitTest);else Reflect.deleteProperty(document,'elementFromPoint');}
  await act(async()=>destination.dispatchEvent(new MouseEvent('pointerdown',{button:0,bubbles:true})));
  expect(snapshot.sceneLinks).toHaveLength(3);const created=snapshot.sceneLinks[2]!;expect(created.fromSceneId).toBe('cabin-scene');expect(created.toSceneId).toBe(built.campaign.scenes[1]!.id);expect(host.querySelector('.storyboard-line--draft')).toBeNull();
  expect(host.querySelector<HTMLSelectElement>('[aria-label="To"]')!.value).toBe(built.campaign.scenes[1]!.id);
  await act(async()=>{const select=host.querySelector<HTMLSelectElement>('[aria-label="To"]')!;select.value=built.campaign.scenes[0]!.id;select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(snapshot.sceneLinks[2]!.id).toBe(created.id);expect(snapshot.sceneLinks[2]!.toSceneId).toBe(built.campaign.scenes[0]!.id);
  await begin();await act(async()=>host.querySelector(`[data-scene-id="${built.campaign.scenes[0]!.id}"]`)!.dispatchEvent(new MouseEvent('pointerdown',{button:0,bubbles:true})));expect(snapshot.sceneLinks).toHaveLength(3);expect(host.querySelector('[aria-label="To"]')).not.toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();}
});
