// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { PlayerInventory } from '../../src/ui/components/PlayerInventory';
import { innVisitExample } from '../../src/scenarios/innVisit';
import { startPlayableCampaign } from '../../src/session/adventureStart';
import { StateEngine } from '../../src/state/StateEngine';
import { EventLog } from '../../src/events/EventLog';
import { adventureOptions } from '../../src/game/AdventureEngine';
import type { Session } from '../../src/state/StateSchema';
import type { EncounterAction } from '../../src/game/EncounterSchema';
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};});
afterEach(()=>vi.useRealTimers());
function fixture(){const built=innVisitExample(),engine=new StateEngine(startPlayableCampaign(built.campaign,built.campaign.scenes[1]!,built.places,'pack-ui',[built.realm]),new EventLog());const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const dispatch=(action:EncounterAction)=>{const s=engine.getSession();engine.executeEncounterAction({id:crypto.randomUUID(),expectedRevision:s.encounter!.state.revision,expectedSceneId:s.sceneId!,action});};const render=async(snapshot:Session=engine.getSession())=>act(async()=>root.render(<PlayerInventory session={snapshot} onAction={dispatch}/>));const click=async(label:string)=>{const button=Array.from(host.querySelectorAll('button')).find(b=>b.getAttribute('aria-label')===label||b.textContent===label);expect(button,label).toBeDefined();await act(async()=>button!.click());};return {built,engine,host,dispatch,render,click,close:async()=>{await act(async()=>root.unmount());host.remove();}};}
it('makes a collected key visible, announces it once, and uses it through the game engine',async()=>{
 const ui=fixture();try{await ui.render();expect(ui.host.textContent).toContain('Your inventory is empty');expect(ui.host.querySelector('[role="status"]')!.textContent).toBe('');ui.dispatch({kind:'interaction',interactionId:'take-key'});await ui.render();expect(ui.host.querySelector('[role="status"]')!.textContent).toBe('Added to inventory: Brass key');expect(ui.host.querySelector('.player-inventory__new')!.textContent).toBe('New');await ui.click('Inspect Brass key');expect(ui.host.querySelector('dialog')!.textContent).toContain('“Store”');await ui.click('Unlock · Store room door');expect(ui.engine.getSession().encounter!.state.barriers[ui.built.storeDoorId]!.locked).toBe(false);expect(ui.host.querySelector('dialog')).toBeNull();await ui.render();await act(async()=>vi.advanceTimersByTimeAsync(6100));expect(ui.host.querySelector('[role="status"]')!.textContent).toBe('');expect(ui.host.querySelector('.player-inventory__new')).toBeNull();}finally{await ui.close();}
});
it('does not announce pre-existing possessions as new on reload and never changes the save by inspecting',async()=>{
 const ui=fixture();try{ui.dispatch({kind:'interaction',interactionId:'take-key'});await ui.render();expect(ui.host.querySelector('[role="status"]')!.textContent).toBe('');const before=structuredClone(ui.engine.getSession());await ui.click('Inspect Brass key');expect(ui.engine.getSession()).toEqual(before);await ui.click('Close');expect(ui.engine.getSession()).toEqual(before);}finally{await ui.close();}
});
it('keeps the guest ledger readable after a return visit and clears selected items when the conversation changes',async()=>{
 const ui=fixture();try{ui.dispatch({kind:'interaction',interactionId:'take-key'});ui.dispatch({kind:'interact',barrierId:ui.built.storeDoorId,operation:'unlock'});ui.dispatch({kind:'interact',barrierId:ui.built.storeDoorId,operation:'open'});const s=ui.engine.getSession();ui.engine.transitionAdventure({id:'store',linkId:adventureOptions(s).find(o=>o.label==='Go to store room')!.id,expectedStateVersion:s.stateVersion});ui.dispatch({kind:'interaction',interactionId:'take-ledger'});await ui.render();await ui.click('Inspect Guest ledger');expect(ui.host.querySelector('dialog')!.textContent).toContain('pencilled note');const next={...structuredClone(ui.engine.getSession()),id:'another-conversation'};next.encounter!.state.actors.player!.inventory=[];await ui.render(next);expect(ui.host.querySelector('dialog')).toBeNull();expect(ui.host.textContent).not.toContain('Guest ledger');expect(ui.host.querySelector('[role="status"]')!.textContent).toBe('');}finally{await ui.close();}
});
