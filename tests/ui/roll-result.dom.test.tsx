// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { RollResult } from '../../src/ui/components/RollResult';
it.each([{roll:78,target:60,label:'Failed',outcome:'failure'},{roll:35,target:60,label:'Success',outcome:'success'},{roll:100,target:60,label:'Critical fail',outcome:'failure',degree:'severe' as const},{roll:1,target:60,label:'Critical success',outcome:'success',degree:'exceptional' as const}])('shows the actual resolved roll and target for $label, and confirms without rolling',async({roll,target,label,outcome,...props})=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');host.className='chat-panel';document.body.append(host);const root=createRoot(host),confirm=vi.fn(),random=vi.spyOn(Math,'random');
 try{await act(async()=>root.render(<RollResult roll={roll} target={target} {...props} onConfirm={confirm}/>));expect(host.querySelector('[role=status]')?.getAttribute('data-outcome')).toBe(outcome);expect(host.querySelector('strong')?.textContent).toBe(label);expect(host.textContent).toContain(`Needed ${target} or lower`);expect(host.textContent).toContain(`You got ${roll}`);const before=random.mock.calls.length;await act(async()=>host.querySelector('button')!.click());expect(confirm).toHaveBeenCalledTimes(1);expect(random.mock.calls.length).toBe(before);expect(host.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');}
 finally{await act(async()=>root.unmount());random.mockRestore();host.remove();}
});
