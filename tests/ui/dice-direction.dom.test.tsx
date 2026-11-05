// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach,afterEach,expect,it,vi } from 'vitest';
import { DiceTray } from '../../src/ui/components/DiceTray';
const fake=vi.hoisted(()=>({requests:[] as {notation:string;vector:{x:number;y:number};boost:number;distance:number}[],rolls:[] as string[]}));
vi.mock('@3d-dice/dice-box-threejs',()=>({default:class {
 display={currentWidth:1000,currentHeight:600};strength=1;running=false;rolling=false;resizeWorld=()=>{};startClickThrow=(_notation:string)=>({});
 scene={traverse:()=>{}};renderer={dispose:()=>{},forceContextLoss:()=>{}};
 async initialize(){} setDimensions(){}
 getNotationVectors(notation:string,vector:{x:number;y:number},boost:number,distance:number){fake.requests.push({notation,vector,boost,distance});return {};}
 async roll(notation:string){fake.rolls.push(notation);return this.startClickThrow(notation);}
}}));
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});fake.requests=[];fake.rolls=[];vi.useFakeTimers();vi.stubGlobal('matchMedia',()=>({matches:false}));vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it.each([{side:'left' as const,sign:1},{side:'right' as const,sign:-1},{side:undefined,sign:-1}])('launches from $side while retaining the resolved percentile roll',async({side,sign})=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),settled=vi.fn();
 try{
  await act(async()=>root.render(<DiceTray roll={37} sound={null} onSettled={settled} {...(side?{throwFrom:side}:{})}/>));
  expect(fake.requests).toHaveLength(1);expect(Math.sign(fake.requests[0]!.vector.x)).toBe(sign);expect(fake.requests[0]!.boost).toBeGreaterThan(0);expect(fake.rolls).toEqual(['1d100+1d10@30,7']);expect(settled).toHaveBeenCalledTimes(1);
  await act(async()=>root.render(<DiceTray roll={37} sound={null} onSettled={settled} {...(side?{throwFrom:side}:{})}/>));expect(fake.requests).toHaveLength(1);
 }finally{await act(async()=>root.unmount());await vi.advanceTimersByTimeAsync(200);host.remove();}
});
