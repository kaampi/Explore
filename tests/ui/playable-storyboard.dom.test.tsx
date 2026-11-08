// @vitest-environment jsdom
import { act,useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { PlayableStoryboard } from '../../src/ui/studio/PlayableStoryboard';
import { connectedAdventureExample } from '../../src/library/playableCampaign';
import { parseCampaignTemplate } from '../../src/library/LibrarySchema';
import { startPlayableCampaign } from '../../src/session/adventureStart';
import { adventureOptions } from '../../src/game/AdventureEngine';
async function click(host:HTMLElement,text:string){const b=Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes(text));expect(b,text).toBeTruthy();await act(async()=>b!.click());}
it('adds an action to the selected scene from the visible toolbar and focuses its label',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const built=connectedAdventureExample(),host=document.createElement('div');document.body.append(host);const root=createRoot(host);let snapshot=built.campaign;
 function Harness(){const [campaign,setCampaign]=useState(built.campaign);snapshot=campaign;return <PlayableStoryboard campaign={campaign} places={built.places} characters={built.characters} objects={built.objects} busy={false} onChange={setCampaign} onPlay={()=>{}}/>;}
 try{await act(async()=>root.render(<Harness/>));await click(host,'02');const inspector=host.querySelector('.playable-storyboard__inspector')!;expect(inspector.textContent).toContain('A note at the watchtower');await click(host,'+ Action');expect(snapshot.scenes[0]!.encounter!.definition.interactions).toHaveLength(2);expect(snapshot.scenes[1]!.encounter!.definition.interactions).toHaveLength(2);expect((document.activeElement as HTMLInputElement).value).toBe('New action');await workflow(host,'Connections');await click(host,'Return to the village');expect(Array.from(inspector.querySelectorAll('button')).some(b=>b.textContent==='+ Action')).toBe(false);}
 finally{await act(async()=>root.unmount());host.remove();}
});
it('edits a connection with readable discoveries, preserves its IDs and tests the resulting campaign',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const built=connectedAdventureExample(),host=document.createElement('div');document.body.append(host);const root=createRoot(host),play=vi.fn();let snapshot=built.campaign;
 function Harness(){const [campaign,setCampaign]=useState(built.campaign);snapshot=campaign;return <PlayableStoryboard campaign={campaign} places={built.places} characters={built.characters} objects={built.objects} busy={false} onChange={setCampaign} onPlay={play}/>;}
 try{await act(async()=>root.render(<Harness/>));await workflow(host,'Connections');await click(host,'Follow the lead');expect(host.querySelector('.playable-storyboard__inspector fieldset')?.textContent).toContain('Ask Edda about the messenger · succeeded');const checkbox=host.querySelector<HTMLInputElement>('.playable-storyboard__inspector fieldset input')!;expect(checkbox.checked).toBe(true);await act(async()=>checkbox.click());expect(snapshot.sceneLinks[0]!.requiresFlags).toHaveLength(0);const reloaded=parseCampaignTemplate(JSON.parse(JSON.stringify(snapshot)));expect(reloaded.scenes[0]!.encounter!.definition.interactions[0]!.id).toBe(built.campaign.scenes[0]!.encounter!.definition.interactions[0]!.id);expect(adventureOptions(startPlayableCampaign(reloaded,reloaded.scenes[0]!,built.places,'edited'))).toHaveLength(1);await click(host,'01');await workflow(host,'Test');await click(host,'Test this scene');expect(play).toHaveBeenCalledTimes(1);}
 finally{await act(async()=>root.unmount());host.remove();}
});
it('renames an action without breaking its connector and exposes failure conditions only for rolled actions',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const built=connectedAdventureExample(),host=document.createElement('div');document.body.append(host);const root=createRoot(host);let snapshot=built.campaign;
 function Harness(){const [campaign,setCampaign]=useState(built.campaign);snapshot=campaign;return <PlayableStoryboard campaign={campaign} places={built.places} characters={built.characters} objects={built.objects} busy={false} onChange={setCampaign} onPlay={()=>{}}/>;}
 try{await act(async()=>root.render(<Harness/>));const action=Array.from(host.querySelectorAll('label')).find(l=>l.textContent==='Action label')!.querySelector('input')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(action,'Ask about the north road');action.dispatchEvent(new Event('input',{bubbles:true}));});const check=Array.from(host.querySelectorAll('label')).find(l=>l.textContent?.includes('Requires a skill roll'))!.querySelector('input')!;await act(async()=>check.click());await workflow(host,'Connections');await click(host,'Follow the lead');expect(host.querySelector('.playable-storyboard__inspector fieldset')!.textContent).toContain('Ask about the north road · succeeded');expect(host.querySelector('.playable-storyboard__inspector fieldset')!.textContent).toContain('Ask about the north road · failed');expect(snapshot.sceneLinks[0]!.requiresFlags[0]).toBe(built.campaign.sceneLinks[0]!.requiresFlags[0]);await click(host,'01');await act(async()=>Array.from(host.querySelectorAll('label')).find(l=>l.textContent?.includes('Requires a skill roll'))!.querySelector<HTMLInputElement>('input')!.click());expect(snapshot.scenes[0]!.encounter!.definition.interactions[0]!.check).toBeUndefined();const who=host.querySelector<HTMLSelectElement>('select[aria-label="Who this action concerns"]')!;await act(async()=>{who.value='';who.dispatchEvent(new Event('change',{bubbles:true}));});expect(snapshot.scenes[0]!.encounter!.definition.interactions[0]!.counterpartyId).toBeUndefined();await workflow(host,'Connections');await click(host,'Follow the lead');expect(host.querySelector('.playable-storyboard__inspector fieldset')!.textContent).not.toContain('· failed');}
 finally{await act(async()=>root.unmount());host.remove();}
});

async function workflow(host: HTMLElement, label: string) {
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Adventure workflow"] [aria-label="' + label + '"]')!.click());
}

it('leads from a missing arrival in review to the right scene and preserves the chosen test start', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample();
  built.campaign.scenes[1]!.encounter!.definition.description = '';
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  const play = vi.fn();
  function Harness() {
    const [campaign, setCampaign] = useState(built.campaign);
    return <PlayableStoryboard campaign={campaign} places={built.places} characters={built.characters}
      objects={built.objects} busy={false} onChange={setCampaign} onPlay={play} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    await workflow(host, 'Test');
    const testButton = () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Test this scene →')!;
    expect(testButton().disabled).toBe(true);
    await click(host, 'Describe the arrival in');
    const arrival = host.querySelector<HTMLTextAreaElement>('[data-storyboard-field="arrival"]')!;
    expect(document.activeElement).toBe(arrival);
    expect(host.querySelector('.storyboard-panel-heading h3')?.textContent).toBe(built.campaign.scenes[1]!.name);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(arrival, 'You arrive at the old watchtower.');
      arrival.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await workflow(host, 'Test');
    expect(testButton().disabled).toBe(false);
    expect(host.querySelector<HTMLSelectElement>('[aria-label="Start from"]')?.value).toBe(built.campaign.scenes[0]!.id);
    await click(host, 'Test this scene');
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ id: built.campaign.scenes[0]!.id }));
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
