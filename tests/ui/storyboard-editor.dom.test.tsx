// @vitest-environment jsdom
import { act,useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { StoryboardEditor } from '../../src/ui/studio/StoryboardEditor';
import { connectedAdventureExample } from '../../src/library/playableCampaign';
import { parseCampaignTemplate } from '../../src/library/LibrarySchema';

it('groups selected scenes inside an act and preserves their separate entrances through collapse and save', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  const built = connectedAdventureExample();
  const [arrival, cellar] = built.campaign.scenes;
  const trail = { ...structuredClone(arrival!), id: 'trail', name: 'Forest trail', position: { x: 700, y: 65 } };
  built.campaign.scenes.push(trail);
  built.campaign.sceneLinks.push(...[arrival!, cellar!].map((scene, index) => ({
    id: `entrance-${index}`, fromSceneId: trail.id, toSceneId: scene.id,
    requiresFlags: [`route-${index}`], requiresAbsentFlags: [], setsFlags: [], label: ''
  })));
  const originalLinks = structuredClone(built.campaign.sceneLinks);
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  let snapshot = built.campaign;
  function Harness() {
    const [campaign, setCampaign] = useState(built.campaign);
    snapshot = campaign;
    return <StoryboardEditor campaign={campaign} places={built.places} characters={built.characters}
      objects={built.objects} busy={false} onChange={setCampaign} onPlay={() => {}} onClose={() => {}} />;
  }
  const board = () => host.querySelector<HTMLElement>('.storyboard-board')!;
  const outline = () => host.querySelector<HTMLElement>('.storyboard-outline')!;
  const sceneButton = (name: string) => Array.from(outline().querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.includes(name))!;
  const sectionCard = (id: string) => board().querySelector<HTMLElement>(`[data-section-id="${id}"]`)!;
  async function assignAct(name: string, actId: string) {
    await act(async () => sceneButton(name).click());
    const field = Array.from(host.querySelectorAll('label')).find(label => label.textContent?.startsWith('Belongs to'))!;
    await act(async () => {
      const select = field.querySelector('select')!;
      select.value = actId;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  async function toggle(id: string) {
    await act(async () => sectionCard(id).querySelector<HTMLButtonElement>('[aria-expanded]')!.click());
  }
  try {
    await act(async () => root.render(<Harness />));
    await click(host, '+ Act');
    const actId = snapshot.storyboardSections![0]!.id;
    await assignAct(arrival!.name, actId);
    await assignAct(cellar!.name, actId);
    await act(async () => sceneButton(arrival!.name).dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true })));
    await click(host, 'Group selected scenes (2)');
    const group = snapshot.storyboardSections![1]!;
    expect(group).toMatchObject({ kind: 'group', actId });
    expect(snapshot.scenes.slice(0, 2).map(scene => scene.storyboardSectionId)).toEqual([group.id, group.id]);
    expect(snapshot.scenes[2]!.storyboardSectionId).toBeUndefined();
    expect(sectionCard(actId)).not.toBeNull();
    await toggle(group.id);
    expect(board().querySelectorAll('[data-scene-id]')).toHaveLength(1);
    expect(board().querySelectorAll('[data-link-id]')).toHaveLength(2);
    const endpoints = Array.from(board().querySelectorAll('[data-link-id] .storyboard-line-hit')).map(path => path.getAttribute('d')!.split(' ').at(-1));
    expect(new Set(endpoints).size).toBe(2);
    await act(async () => board().querySelector<SVGPathElement>('[data-link-id="entrance-1"] .storyboard-line-hit')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(host.querySelector<HTMLSelectElement>('[aria-label="To"]')!.value).toBe(cellar!.id);
    await toggle(actId);
    expect(sectionCard(group.id)).toBeNull();
    expect(sectionCard(actId).classList.contains('is-folded')).toBe(true);
    const saved = parseCampaignTemplate(JSON.parse(JSON.stringify(snapshot)));
    expect(saved.storyboardSections).toEqual(snapshot.storyboardSections);
    expect(saved.sceneLinks).toEqual(originalLinks);
    await toggle(actId);
    await toggle(group.id);
    expect(board().querySelectorAll('[data-scene-id]')).toHaveLength(3);
    const card = sectionCard(group.id);
    const handle = card.querySelector<HTMLElement>('.storyboard-section__header')!;
    handle.setPointerCapture = () => {};
    const x = parseFloat(card.style.left) + 80;
    const y = parseFloat(card.style.top) + 20;
    await act(async () => handle.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true, clientX: x, clientY: y })));
    await act(async () => board().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: x + 50, clientY: y + 30 })));
    await act(async () => board().dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    expect(snapshot.scenes[0]!.position).toEqual({ x: arrival!.position!.x + 50, y: arrival!.position!.y + 30 });
    expect(snapshot.scenes[1]!.position).toEqual({ x: cellar!.position!.x + 50, y: cellar!.position!.y + 30 });
    expect(snapshot.scenes[2]!.position).toEqual(trail.position);
    const initialSize = { width: parseFloat(card.style.width), height: parseFloat(card.style.height) };
    await click(host, '+');
    const resize = card.querySelector<HTMLButtonElement>('.storyboard-section__resize')!;
    resize.setPointerCapture = () => {};
    const resizeX = (parseFloat(card.style.left) + initialSize.width - 8) * 1.25;
    const resizeY = (parseFloat(card.style.top) + initialSize.height - 8) * 1.25;
    await act(async () => resize.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true, clientX: resizeX, clientY: resizeY })));
    await act(async () => board().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: resizeX + 125, clientY: resizeY + 75 })));
    await act(async () => board().dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    const enlarged = { width: initialSize.width + 100, height: initialSize.height + 60 };
    expect(snapshot.storyboardSections!.find(item => item.id === group.id)).toMatchObject({ size: enlarged });
    expect(parseCampaignTemplate(JSON.parse(JSON.stringify(snapshot))).storyboardSections).toEqual(snapshot.storyboardSections);
    await toggle(group.id);
    await toggle(group.id);
    expect(parseFloat(sectionCard(group.id).style.width)).toBe(enlarged.width);
    await click(host, 'Fit frame to scenes');
    expect(parseFloat(sectionCard(group.id).style.width)).toBe(initialSize.width);
    expect(parseFloat(sectionCard(group.id).style.height)).toBe(initialSize.height);
    await act(async () => sectionCard(group.id).querySelector<HTMLButtonElement>('.storyboard-section__title')!.click());
    await click(host, 'Ungroup scenes');
    expect(snapshot.scenes.slice(0, 2).map(scene => scene.storyboardSectionId)).toEqual([actId, actId]);
    expect(snapshot.sceneLinks).toEqual(originalLinks);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('fits distant scenes and keeps editing coordinates aligned when zoomed', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  const built = connectedAdventureExample();
  built.campaign.scenes[1]!.position = { x: 3800, y: 2500 };
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  let snapshot = built.campaign;
  function Harness() {
    const [campaign, setCampaign] = useState(built.campaign);
    snapshot = campaign;
    return <StoryboardEditor campaign={campaign} places={built.places} characters={built.characters}
      objects={built.objects} busy={false} onChange={setCampaign} onPlay={() => {}} onClose={() => {}} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    const board = host.querySelector<HTMLDivElement>('.storyboard-board')!;
    Object.defineProperties(board, { clientWidth: { value: 600 }, clientHeight: { value: 480 } });
    board.scrollLeft = 100;
    board.scrollTop = 80;
    const wheel = new WheelEvent('wheel', {
      ctrlKey: true, deltaY: -100, clientX: 200, clientY: 180, bubbles: true, cancelable: true
    });
    await act(async () => board.dispatchEvent(wheel));
    expect(wheel.defaultPrevented).toBe(true);
    expect(board.scrollLeft).toBe(175);
    expect(board.scrollTop).toBe(145);
    await act(async () => board.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, clientX: 300, clientY: 200
    })));
    await click(host, 'Add scene here');
    expect(snapshot.scenes.at(-1)!.position).toEqual({ x: 380, y: 276 });

    await click(host, 'Fit all');
    const layer = host.querySelector<HTMLDivElement>('.storyboard-content')!;
    const scale = Number(layer.style.transform.slice('scale('.length, -1));
    const lineViewBox = host.querySelector('.storyboard-lines')!.getAttribute('viewBox')!.split(' ').map(Number);
    expect(lineViewBox[2]).toBeGreaterThan(4000);
    expect(lineViewBox[3]).toBeGreaterThan(2624);
    expect(scale).toBeLessThan(0.2);
    for (const card of Array.from(board.querySelectorAll<HTMLElement>('[data-scene-id]'))) {
      const x = parseFloat(card.style.left) * scale - board.scrollLeft;
      const y = parseFloat(card.style.top) * scale - board.scrollTop;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + parseFloat(card.style.width) * scale).toBeLessThanOrEqual(board.clientWidth);
      expect(y + parseFloat(card.style.height) * scale).toBeLessThanOrEqual(board.clientHeight);
    }
    const card = board.querySelector<HTMLElement>(`[data-scene-id="${built.campaign.scenes[1]!.id}"]`)!;
    card.setPointerCapture = () => {};
    const x = 3820 * scale - board.scrollLeft;
    const y = 2520 * scale - board.scrollTop;
    await act(async () => card.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true, clientX: x, clientY: y })));
    await act(async () => board.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: x - 40 * scale, clientY: y - 20 * scale })));
    await act(async () => board.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    expect(snapshot.scenes[1]!.position?.x).toBeCloseTo(3760);
    expect(snapshot.scenes[1]!.position?.y).toBeCloseTo(2480);
    expect(snapshot.sceneLinks).toEqual(built.campaign.sceneLinks);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

async function click(host:HTMLElement,text:string){const button=Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text);expect(button,text).toBeTruthy();await act(async()=>button!.click());}
it('keeps the context menu in the modal, edits the clicked scene, and preserves the draft on close and reopen',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 const built=connectedAdventureExample(),host=document.createElement('div');document.body.append(host);const root=createRoot(host),save=vi.fn(),play=vi.fn();let snapshot=built.campaign;
 function Harness(){const [campaign,setCampaign]=useState(built.campaign),[open,setOpen]=useState(true);snapshot=campaign;return <><button onClick={()=>setOpen(true)}>Reopen editor</button>{open&&<StoryboardEditor campaign={campaign} places={built.places} characters={built.characters} objects={built.objects} busy={false} onChange={setCampaign} onPlay={play} onSave={save} onClose={()=>setOpen(false)}/>}</>;}
 try{
  await act(async()=>root.render(<Harness/>));const dialog=host.querySelector('dialog')!;expect(dialog.open).toBe(true);
  await act(async()=>dialog.querySelector<HTMLButtonElement>('[aria-label="Test"]')!.click());await click(dialog,'Test this scene →');expect(play).toHaveBeenCalledWith(built.campaign.scenes[0]);
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
  await begin();
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Test"]')!.click());
  expect(host.querySelector('.storyboard-line--draft')).toBeNull();
  expect(snapshot.sceneLinks).toHaveLength(2);
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
