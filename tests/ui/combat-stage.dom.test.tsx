// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { CombatStage } from '../../src/ui/combat/CombatStage';
import { silhouetteForAnatomy } from '../../src/ui/combat/CombatSilhouette';
import type { Fighter } from '../../src/ui/combat/fighters';
const player: Fighter = {id:'p',name:'Player',hp:18,maxHp:20,position:'Road',status:[],anatomyId:'builtin-humanoid'};
const opponents: Fighter[] = [{id:'a',name:'Guard',hp:10,maxHp:16,position:'Road',status:[],anatomyId:'builtin-humanoid'}, {id:'b',name:'Archer',hp:10,maxHp:10,position:'Wall · +6 m',status:[],anatomyId:'builtin-humanoid'}];
it('changes the selected combatant without executing an attack and retains authoritative disabled actions',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true}); const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let selected='a',attempts=0;
 const render=()=>root.render(<CombatStage player={player} opponents={opponents} selectedId={selected} onSelect={id=>{selected=id;render();}} round={1} range={selected==='a'?'Within melee reach':'Out of melee reach'} busy={false} actions={[{id:'sword',label:'Sword',blocked:selected==='b'?'Too far':undefined,run:()=>attempts++}]}/>);
 try{await act(async()=>render());expect(host.querySelector('[aria-label="Guard combatant"]')).not.toBeNull();await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Select Archer"]')!.click());expect(host.querySelector('[aria-label="Archer combatant"]')?.textContent).toContain('+6 m');expect(host.querySelector('.combat-stage__controls button')?.hasAttribute('disabled')).toBe(true);expect(host.querySelector<HTMLProgressElement>('[aria-label="Player health"]')?.value).toBe(18);expect(attempts).toBe(0);}finally{await act(async()=>root.unmount());host.remove();}
});
it('uses supplied figures and falls back safely when an image is unavailable',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<CombatStage player={{...player,image:'missing.png'}} opponents={opponents} selectedId="a" onSelect={()=>{}} round={1} range="Within melee reach" busy={false} actions={[]}/>));expect(host.querySelector('img[alt="Player full-body figure"]')).not.toBeNull();await act(async()=>host.querySelector('img[alt="Player full-body figure"]')!.dispatchEvent(new Event('error')));expect(host.querySelector('.combat-fighter--player [data-silhouette="humanoid"]')).not.toBeNull();}finally{await act(async()=>root.unmount());host.remove();}
});
it('supports anatomy-specific silhouettes without assuming every actor is human',()=>{
 expect(silhouetteForAnatomy('builtin-equine')).toBe('quadruped');expect(silhouetteForAnatomy('builtin-dragon')).toBe('winged');expect(silhouetteForAnatomy('mechanical-drone')).toBe('drone');expect(silhouetteForAnatomy('custom',['left_hand','left_foot'])).toBe('humanoid');expect(silhouetteForAnatomy()).toBe('unknown');
});
