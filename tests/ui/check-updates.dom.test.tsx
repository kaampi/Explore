// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { CheckUpdates } from '../../src/ui/home/CheckUpdates';
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>false}));
it('reports available updates, current builds and failed checks without installing anything',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const request=vi.fn();vi.stubGlobal('fetch',request);
 const el=document.createElement('div'),root=createRoot(el);
 try{await act(async()=>root.render(<CheckUpdates/>));
 request.mockResolvedValueOnce({ok:true,status:200,json:async()=>({ahead_by:2})});await act(async()=>{el.querySelector('button')!.click();});expect(el.textContent).toContain('A newer Explore version is available');expect(el.querySelector('a')?.href).toContain('kaampi/Explore/actions/workflows/desktop-build.yml');
 request.mockResolvedValueOnce({ok:true,status:200,json:async()=>({ahead_by:0})});await act(async()=>{el.querySelector('button')!.click();});expect(el.textContent).toContain('latest Explore code');
 request.mockResolvedValueOnce({ok:false,status:429});await act(async()=>{el.querySelector('button')!.click();});expect(el.textContent).toContain('temporarily limiting');expect(el.querySelector('button')!.disabled).toBe(false);
 }finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});
