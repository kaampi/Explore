// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { it,expect,vi } from 'vitest';
import { ForestBrushInput,type TerrainBrushMode } from '../../src/ui/studio/ForestBrush';
import type { WorldMap } from '../../src/library/worldMap';
it('paints a forest, authors a child clearing, and erases without creating a new place',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.stubGlobal('DOMPoint',class{constructor(public x:number,public y:number){}matrixTransform(){return this;}});
 const el=document.createElement('div');document.body.append(el);const root=createRoot(el);let map:WorldMap={nodes:[],routes:[]},selected='',changes=0;
 const render=async(mode:TerrainBrushMode)=>{await act(async()=>root.render(<svg><ForestBrushInput map={map} selected={selected} level="" mode={mode} radius={40} onSelect={id=>{selected=id;}} onChange={m=>{map=m;changes++;}}/></svg>));const svg=el.querySelector('svg')!;Object.assign(svg,{getScreenCTM:()=>({inverse:()=>({})})});};
 const stroke=async()=>{const rect=el.querySelector('rect')!;Object.assign(rect,{setPointerCapture:()=>{}});await act(async()=>{const e=new Event('pointerdown',{bubbles:true});Object.assign(e,{button:0,clientX:400,clientY:300,pointerId:1});const before=changes;rect.dispatchEvent(e);expect(changes).toBe(before);rect.dispatchEvent(new Event('pointerup',{bubbles:true}));expect(changes).toBe(before+1);});};
 try{await render('forest');await stroke();expect(map.nodes).toHaveLength(1);const forestId=selected;expect(map.nodes[0]!.brush?.[0]?.erase).toBe(false);
 await render('clearing');await stroke();expect(map.nodes).toHaveLength(2);expect(map.nodes[1]).toMatchObject({kind:'Clearing',parentId:forestId,isArea:true});
 await render('erase');await stroke();expect(map.nodes).toHaveLength(2);expect(map.nodes[1]!.brush?.at(-1)?.erase).toBe(true);
 await render('lake');await stroke();expect(map.nodes.at(-1)?.kind).toBe('Lake');
 await render('low');await stroke();expect(map.nodes.at(-1)?.kind).toBe('Mountain');expect(map.nodes.at(-1)?.brush?.at(-1)?.height).toBe(1);
 const mountainId=selected;await render('peak');await stroke();expect(selected).toBe(mountainId);expect(map.nodes.at(-1)?.brush?.at(-1)?.height).toBe(3);
 }finally{await act(async()=>root.unmount());el.remove();vi.unstubAllGlobals();}
});
