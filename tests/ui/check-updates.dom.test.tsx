// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CheckUpdates } from '../../src/ui/home/CheckUpdates';
import { UPDATE_CACHE_KEY, UPDATE_DOWNLOADS, UPDATE_INTERVAL, UpdateProvider } from '../../src/ui/home/UpdateProvider';
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>false}));
const request=vi.fn();
const response=(ahead_by:number)=>({ok:true,status:200,json:async()=>({ahead_by})});
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});localStorage.clear();request.mockReset();request.mockResolvedValue(response(0));vi.stubGlobal('fetch',request);});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();});
function mount(){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);return {host,root,render:()=>act(async()=>root.render(<CheckUpdates/>)),close:async()=>{await act(async()=>root.unmount());host.remove();}};}
it('checks quietly at startup and changes the button to a download action when an update is available',async()=>{
 request.mockResolvedValue(response(2));const ui=mount(),open=vi.spyOn(window,'open').mockImplementation(()=>null);
 try{await ui.render();expect(request).toHaveBeenCalledTimes(1);expect(ui.host.querySelector('button')?.textContent).toBe('Update available');expect(ui.host.querySelector('[role=status]')).toBeNull();await act(async()=>ui.host.querySelector('button')!.click());expect(open).toHaveBeenCalledWith(UPDATE_DOWNLOADS,'_blank','noopener,noreferrer');expect(request).toHaveBeenCalledTimes(1);}
 finally{await ui.close();}
});
it('checks manually, reports current builds and handles rate limits without a stuck button',async()=>{
 const ui=mount();try{await ui.render();expect(ui.host.textContent).toBe('Check for updates');await act(async()=>ui.host.querySelector('button')!.click());expect(ui.host.textContent).toContain('latest Explore code');expect(ui.host.querySelector('a')?.href).toBe(UPDATE_DOWNLOADS);
 request.mockResolvedValue({ok:false,status:429});await act(async()=>ui.host.querySelector('button')!.click());expect(ui.host.textContent).toContain('temporarily limiting');expect(ui.host.querySelector('button')!.disabled).toBe(false);
 }finally{await ui.close();}
});
it('checks every thirty minutes even while the home button is unmounted and restores the label on return',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-04T18:00:00Z'));const host=document.createElement('div'),root=createRoot(host);
 try{await act(async()=>root.render(<UpdateProvider><CheckUpdates/></UpdateProvider>));expect(request).toHaveBeenCalledTimes(1);
 await act(async()=>root.render(<UpdateProvider><div>Playing</div></UpdateProvider>));request.mockResolvedValue(response(3));await act(async()=>vi.advanceTimersByTimeAsync(UPDATE_INTERVAL));expect(request).toHaveBeenCalledTimes(2);
 await act(async()=>root.render(<UpdateProvider><CheckUpdates/></UpdateProvider>));expect(host.textContent).toBe('Update available');expect(request).toHaveBeenCalledTimes(2);
 }finally{await act(async()=>root.unmount());}
});
it('uses a revision-specific cache instead of checking on every visit',async()=>{
 localStorage.setItem(UPDATE_CACHE_KEY,JSON.stringify({available:true,lastChecked:Date.now()}));const ui=mount();try{await ui.render();expect(ui.host.textContent).toBe('Update available');expect(request).not.toHaveBeenCalled();}finally{await ui.close();}
});
it('keeps a known update after a quiet background failure, and stops checking after unmount',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-04T18:00:00Z'));request.mockResolvedValue(response(2));const ui=mount();
 await ui.render();request.mockRejectedValue(new Error('Offline'));await act(async()=>vi.advanceTimersByTimeAsync(UPDATE_INTERVAL));expect(ui.host.textContent).toBe('Update available');expect(ui.host.querySelector('[role=status]')).toBeNull();await ui.close();const calls=request.mock.calls.length;await vi.advanceTimersByTimeAsync(UPDATE_INTERVAL);expect(request).toHaveBeenCalledTimes(calls);
});
it('aborts a timed-out check without announcing background errors',async()=>{
 vi.useFakeTimers();request.mockImplementation((_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')))));const ui=mount();try{await ui.render();await act(async()=>vi.advanceTimersByTimeAsync(15_000));expect(ui.host.textContent).toBe('Check for updates');expect(ui.host.querySelector('[role=status]')).toBeNull();}finally{await ui.close();}
});
