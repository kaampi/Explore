// @vitest-environment jsdom
import { act,useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { InteriorEditor } from '../../src/ui/studio/InteriorEditor';
import { addInteriorOpening, ensureInterior } from '../../src/library/interior';
import { settlementPiece } from '../../src/library/settlement';
import { interiorScale } from '../../src/library/interiorScale';
import { WorldMapSchema, type WorldMap } from '../../src/library/worldMap';

it('previews placement at real scale without changing data, deletes selected objects safely and can undo door deletion',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});SVGElement.prototype.setPointerCapture=()=>{};
 const initial=ensureInterior({nodes:[{...settlementPiece('cottage','',50,50),id:'house',placeId:'house-place'}],routes:[]},'house');let current=initial;const changed=vi.fn();
 function Editor(){const [map,setMap]=useState<WorldMap>(initial);current=map;return <InteriorEditor map={map} buildingId="house" onChange={next=>{changed(next);setMap(next);}}/>;}
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const click=async(name:string)=>{const button=Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.trim()===name);expect(button,name).toBeTruthy();await act(async()=>button!.click());};
 const pointer=async(type:string,x:number,y:number,target:Element=host.querySelector('svg')!)=>act(async()=>{const m=interiorScale(current.nodes[0]!),event=new MouseEvent(type,{bubbles:true,button:0,clientX:(50+(x-50)*m.scaleX)*8,clientY:(50+(y-50)*m.scaleY)*6});Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event);});
 const key=async(element:Element,name:string)=>act(async()=>element.dispatchEvent(new KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true})));
 try{
  await act(async()=>root.render(<Editor/>));const svg=host.querySelector<SVGSVGElement>('[aria-label="House floor plan"]')!;svg.getBoundingClientRect=()=>({left:0,top:0,x:0,y:0,width:800,height:600,right:800,bottom:600,toJSON(){}});
  const before=JSON.stringify(initial);await click('▰Bed');await pointer('pointermove',75,35);const ghost=host.querySelector('.interior-editor__ghost')!;expect(ghost.getAttribute('pointer-events')).toBe('none');expect(ghost.getAttribute('data-placement-valid')).toBe('true');expect(ghost.querySelector('[data-furniture-depth-m]')!.getAttribute('data-furniture-depth-m')).toBe('2');expect(changed).not.toHaveBeenCalled();expect(JSON.stringify(current)).toBe(before);
  await pointer('pointermove',89,11);expect(host.querySelector('.interior-editor__ghost')!.getAttribute('data-placement-valid')).toBe('false');expect(changed).not.toHaveBeenCalled();
  await pointer('pointermove',75,35);await pointer('pointerdown',75,35);expect(current.nodes.filter(n=>n.furnitureType)).toHaveLength(1);await click('↖Select');expect(host.querySelector('.interior-editor__ghost')).toBeNull();
  const bed=host.querySelector('[aria-label="Select furniture Bed"]')!;await key(bed,'Enter');const name=host.querySelector<HTMLInputElement>('.interior-editor__details input')!;await key(name,'Delete');expect(current.nodes.some(n=>n.furnitureType==='bed')).toBe(true);await key(bed,'Delete');expect(current.nodes.some(n=>n.furnitureType==='bed')).toBe(false);await click('↶ Undo');expect(current.nodes.some(n=>n.furnitureType==='bed')).toBe(true);
  await click('▯Door');await pointer('pointermove',35,10);expect(host.querySelector('.interior-editor__ghost')!.getAttribute('data-placement-valid')).toBe('true');const moves=changed.mock.calls.length;await pointer('pointermove',35,15);expect(changed.mock.calls).toHaveLength(moves);await pointer('pointermove',10,10);expect(host.querySelector('.interior-editor__ghost')!.getAttribute('data-placement-valid')).toBe('false');await key(svg,'Escape');expect(host.querySelector('.interior-editor__ghost')).toBeNull();
  const opening=current.nodes[0]!.interior!.openings[0]!,route=current.routes.find(r=>r.id===opening.routeId)!;const door=host.querySelector('[aria-label="Select open door"]')!;await key(door,'Enter');await key(door,'Delete');expect(current.routes.some(r=>r.id===route.id)).toBe(false);expect(current.nodes[0]!.interior!.openings.some(o=>o.id===opening.id)).toBe(false);await click('↶ Undo');expect(current.routes.find(r=>r.id===route.id)).toEqual(route);
  const roomCount=current.nodes.filter(n=>n.kind==='Room').length;await key(host.querySelector('[data-interior-room]')!,'Enter');await key(svg,'Delete');expect(current.nodes.filter(n=>n.kind==='Room')).toHaveLength(roomCount);
 }finally{await act(async()=>root.unmount());host.remove();}
});

it('rotates a dining set in the preview and after placement, and shows a snapped window while dragging', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  SVGElement.prototype.setPointerCapture = () => {};
  const empty = { nodes: [{ ...settlementPiece('cottage', '', 50, 50), id: 'house' }], routes: [] };
  const initial = addInteriorOpening(ensureInterior(empty, 'house'), 'house', { x: 10, y: 30 }, 'window');
  let current = initial;
  function Editor() {
    const [map, setMap] = useState(initial);
    current = map;
    return <InteriorEditor map={map} buildingId="house" onChange={setMap} />;
  }
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Editor />));
    const svg = host.querySelector<SVGSVGElement>('[aria-label="House floor plan"]')!;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, x: 0, y: 0, width: 800, height: 600, right: 800, bottom: 600, toJSON() {} });
    const metrics = interiorScale(initial.nodes[0]!);
    async function pointer(type: string, x: number, y: number, target: Element = svg) {
      const event = new MouseEvent(type, { bubbles: true, button: 0,
        clientX: (50 + (x - 50) * metrics.scaleX) * 8, clientY: (50 + (y - 50) * metrics.scaleY) * 6 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      await act(async () => target.dispatchEvent(event));
    }
    async function tool(label: string) {
      await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent?.endsWith(label))!.click());
    }
    async function rotate() {
      const event = new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true });
      await act(async () => svg.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true);
    }
    await tool('Table & chairs');
    await pointer('pointermove', 35, 40);
    await rotate();
    expect(svg.querySelector('.interior-editor__ghost [data-furniture-type="dining-set"]')?.getAttribute('transform')).toContain('rotate(15)');
    await pointer('pointerdown', 35, 40);
    await tool('Select');
    const diningSet = svg.querySelector('[aria-label="Select furniture Table & chairs"]')!;
    expect(diningSet.querySelectorAll('[data-dining-seat]')).toHaveLength(4);
    await act(async () => diningSet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await rotate();
    expect(WorldMapSchema.parse(current).nodes.filter(node => node.furnitureType === 'dining-set')).toMatchObject([{ rotation: 30 }]);

    const window = svg.querySelector('[aria-label="Select open window"]')!;
    const opening = () => current.nodes[0]!.interior!.openings.find(item => item.kind === 'window')!;
    await pointer('pointerdown', 10, 32, window);
    await pointer('pointermove', 12, 47);
    const preview = svg.querySelector('[data-moving-opening="true"]')!;
    expect(preview.getAttribute('data-placement-valid')).toBe('true');
    expect(preview.firstElementChild?.getAttribute('transform')).toContain('translate(80 270)');
    expect(opening().position).toEqual({ x: 10, y: 30 });
    await pointer('pointerup', 12, 47);
    expect(opening().position.x).toBeCloseTo(10);
    expect(opening().position.y).toBeCloseTo(45);
    expect(svg.querySelector('[data-moving-opening="true"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
