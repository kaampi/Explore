import { CombatStage } from '../combat/CombatStage';
import { projectFighters } from '../combat/fighters';
import { useCombatPlayback } from '../combat/useCombatPlayback';
import { CombatPlaybackOverlay } from '../combat/CombatPlaybackOverlay';
import { gateLineOfSight } from '../../checks/gateGeometry';
import { CombatLog,gateCombatLog,isCombatRecord } from './CombatLog';
import { HealthMeter } from './HealthMeter';
export { HealthMeter } from './HealthMeter';
import { combatOrder,ACTOR_NAMES } from '../../checks/gateCombat';
import { useEffect, useRef, useState } from 'react';
import { interpretGateIntent } from '../../checks/gateIntent';
import { useEngine } from '../EngineStore';
import { gateActionBlock, gateActionLabel, gateActionPreview, POSITION_NAMES, type GateAction, type GateRequest, type GateCheck } from '../../checks/gateEncounter';
import { MessageMenu } from './MessageMenu';
import type { Session } from '../../state/StateSchema';
import type { IndexedDBRepository } from '../../persistence/IndexedDBRepository';
import { captureIdea, type Idea } from '../../ideas/IdeaSchema';
import { IdeaEditor } from '../ideas/IdeaEditor';

const GOOD=(check:GateCheck)=>check.degree==='success'||check.degree==='exceptional';
const degreeLabel={exceptional:'Exceptional success',success:'Success',failure:'Setback',severe:'Severe setback'};
export function GateScenePanel({onHome,repo}:{onHome:(session:Session)=>void;repo?:IndexedDBRepository}){
 const {useSession,executeGateAction,saveGateScene,interpretGateText,setCombatArtwork}=useEngine(),session=useSession(),s=session.gateEncounter!;
 const [selectedTarget,setSelectedTarget]=useState<'mona'|'archer'>('mona');
 const [say,setSay]=useState(''),[action,setAction]=useState(''),[pending,setPending]=useState<GateRequest|null>(null),[notice,setNotice]=useState('');
 const [working,setWorking]=useState(false),lock=useRef(false),log=useRef<HTMLDivElement>(null);
 const [saveFailed,setSaveFailed]=useState(false);
 const [interpreting,setInterpreting]=useState(false),[sequence,setSequence]=useState<GateAction[]>([]),[intentSource,setIntentSource]=useState('');
 const interpretation=useRef<AbortController|null>(null),currentScene=useRef(s);currentScene.current=s;
 const [soundOn,setSoundOn]=useState(false);
 const [menu,setMenu]=useState<{x:number;y:number;text:string;turn:number}|null>(null),[inspect,setInspect]=useState(false);
 const [idea,setIdea]=useState<Idea|null>(null);
 const playback=useCombatPlayback(session,()=>{
   const now=currentScene.current;
   if(now.phase==='combat'&&now.actionUsed&&!saveFailed){void run({id:`auto-pass:${now.revision}`,expectedRevision:now.revision,action:{kind:'end-turn'}});return true;}
   return false;
 });
 const arena=s.phase==='combat'||playback.combat;
 const turnLabel=playback.actorId==='player'?'Your turn':`${ACTOR_NAMES[playback.actorId as 'mona'|'archer']??playback.actorId}’s turn`;
 const shownTarget=playback.active&&playback.actorId!=='player'?playback.actorId as 'mona'|'archer':selectedTarget;
 const ended=['entered','escaped','defeated'].includes(s.phase),blockedUI=working||playback.active||interpreting||saveFailed;
 const visibleTurns=session.conversation.filter((_turn,index)=>index===0||!isCombatRecord(s.history[Math.floor((index-1)/2)])).length;
 useEffect(()=>{log.current?.scrollTo?.({top:log.current.scrollHeight,behavior:'smooth'});},[visibleTurns]);
 useEffect(()=>()=>{interpretation.current?.abort();},[]);
 const mona=Object.values(session.characters)[0],history=session.conversation as {turn:number;role:string;content:string}[];
 async function run(request:GateRequest){
   if(lock.current)return;if(request.action.kind==='attack')setSelectedTarget(request.action.target);lock.current=true;setWorking(true);setPending(null);setNotice('');
   try{await executeGateAction(request);setSaveFailed(false);setSay('');setAction('');setSequence(steps=>steps.length&&gateActionLabel(steps[0]!)===gateActionLabel(request.action)?steps.slice(1):[]);}
   catch(error){setSequence([]);setSaveFailed(true);setNotice(`The action may be resolved in memory, but could not be saved. Use Retry save before reloading. ${error instanceof Error?error.message:''}`);}
   finally{setWorking(false);lock.current=false;}
 }
 // Resume an exhausted turn from older saves; new turns advance atomically in the reducer.
 useEffect(()=>{
   if(!blockedUI&&!saveFailed&&s.phase==='combat'&&s.actionUsed)void run({id:`auto-pass:${s.revision}`,expectedRevision:s.revision,action:{kind:'end-turn'}});
 },[s.revision,s.phase,s.actionUsed,s.moveUsed,blockedUI,saveFailed]);
 function choose(a:GateAction){
   if(blockedUI||ended)return;setSequence([]);setIntentSource('');const preview=gateActionPreview(s,a);if(preview.blocked){setNotice(preview.blocked);return;}
   const request={id:crypto.randomUUID(),expectedRevision:s.revision,action:a};setNotice('');
   if(a.kind==='attack'&&(a.target==='mona'?s.monaDisposition:s.archerDisposition)==='surrendered'){setPending(request);return;}
   void run(request);
 }
 async function doText(){
   if(blockedUI||ended)return;
   const controller=new AbortController();interpretation.current?.abort();interpretation.current=controller;
   setInterpreting(true);setPending(null);setSequence([]);setNotice('');const text=action.trim(),revision=s.revision;
   try{
     const result=interpretGateText?await interpretGateText(text,controller.signal):await interpretGateIntent(text,s,undefined,controller.signal);
     if(controller.signal.aborted)return;
     if(currentScene.current.revision!==revision||result.revision!==revision){setNotice('The scene changed while interpreting. Review your intention again.');return;}
     if(result.status!=='proposal'){setNotice(result.status==='unavailable'?'I could not interpret that reliably. The scene is unchanged. Try a clearer description or use an action button. AI assistance is available when your configured model is connected.':'Please make the target and intention clearer. Unsupported actions do not create new objects or change the rules.');return;}
     setSequence(result.steps);setIntentSource(result.source==='model'?'AI-assisted interpretation · rules checked by the game':'Understood from your description');
     setPending({id:crypto.randomUUID(),expectedRevision:revision,action:result.steps[0]!,intention:text});
   }catch{if(!controller.signal.aborted)setNotice('Could not interpret this action. No changes were made.');}
   finally{if(interpretation.current===controller){interpretation.current=null;setInterpreting(false);}}
 }
 function continuePlan(){if(!sequence.length||blockedUI)return;const step=sequence[0]!,reason=gateActionBlock(s,step);if(reason){setNotice(reason);return;}void run({id:crypto.randomUUID(),expectedRevision:s.revision,action:step});}
 const commands:GateAction[]=[{kind:'look'},{kind:'tip-wagon'},...(s.wagonTipped?[{kind:'clear-wagon'} as GateAction]:[]),{kind:'inspect-gate'},{kind:'persuade'},{kind:'search-wall'},{kind:'pick-lock'},{kind:'force'},{kind:'take-key'},{kind:'unlock'},{kind:'open'},...(s.posternFound?[{kind:'postern'} as GateAction]:[]),...(s.position==='courtyard'?[{kind:'finish'} as GateAction]:[])];
 const preview=pending?gateActionPreview(s,pending.action):null;
 const fighters=projectFighters(session,playback.actors),targetPosition=shownTarget==='mona'?s.monaPosition:s.archerPosition;
 const fightRange=s.position===targetPosition?'Within melee reach':gateLineOfSight(s,s.position,targetPosition)?'Out of melee reach':'Line of sight blocked · Out of melee reach';
 const fightActions=(['sword','bow'] as const).map(weapon=>{const action:GateAction={kind:'attack',target:selectedTarget,weapon};return {id:weapon,label:weapon==='sword'?'Sword':'Bow',blocked:gateActionBlock(s,action),run:()=>choose(action)};});

 return <>
  <div className={`chat-panel gate-scene-panel${arena?' gate-scene-panel--combat':''}`}>
   {menu&&<MessageMenu x={menu.x} y={menu.y} onClose={()=>setMenu(null)} items={[...(repo?[{label:'Save as idea',action:()=>setIdea(captureIdea(session,[menu.turn],'The gatehouse'))}]:[]),{label:'Copy',action:()=>{void navigator.clipboard?.writeText(menu.text);}},{label:'Inspect scene state',action:()=>setInspect(true)}]}/>}
   {idea&&repo&&<IdeaEditor idea={idea} repo={repo} onClose={()=>setIdea(null)} onSaved={()=>{setIdea(null);setNotice('Idea saved in My ideas.');}}/>}
   <div className="gate-scene-status"><span>{fighters.player.position} · {arena?`Combat · round ${playback.round??s.round}`:ended?'Test complete':'Exploration'}</span><span>{playback.active?turnLabel:s.phase==='combat'?`Action ${s.actionUsed?'used':'ready'} · Move ${s.moveUsed?'used':'ready'}`:'Gatehouse · rules test'}</span>{s.phase==='combat'&&<span>Order: {combatOrder(s).map(id=>ACTOR_NAMES[id]).join(' → ')} · {turnLabel}</span>}</div>
   <div className={`chat-stage${arena?' chat-stage--combat':''}`}>{arena&&<CombatStage player={fighters.player} opponents={fighters.opponents} selectedId={shownTarget} onSelect={id=>setSelectedTarget(id as 'mona'|'archer')} activeId={playback.actorId} turnLabel={turnLabel} round={playback.round??s.round} range={fightRange} actions={fightActions} busy={blockedUI} onArtwork={setCombatArtwork}/>}<div className="chat-log" ref={log} hidden={arena}>
    {history.map((turn,index)=>{const player=turn.role==='player',entry=index>0?s.history[Math.floor((index-1)/2)]:undefined;if(isCombatRecord(entry))return null;const monaSpeaking=!player&&(index===0||entry?.speaker==='mona'||(!entry?.speaker&&entry?.action==='Persuade Mona'));const face=player?session.player?.portraitDataUrl:index===0?mona?.portraitDataUrl:entry?.checks.some(c=>c.actor==='Traveller'&&c.stat==='Persuasion'&&GOOD(c))?'/examples/mona/image-1.png':entry?.checks.some(c=>c.actor==='Traveller'&&c.stat==='Persuasion'&&!GOOD(c))?'/examples/mona/stressed.png':'/examples/mona/neutral.png';return <div key={turn.turn} className={`message message--${player?'player':'character'}${!player&&!monaSpeaking?' message--narrator':''}`} onContextMenu={event=>{event.preventDefault();setMenu({x:event.clientX,y:event.clientY,text:turn.content,turn:turn.turn});}}>
      <span className="message__attribution">{player?session.player?.name||'Traveller':monaSpeaking?'Mona Sanchez':'Narrator'} <button type="button" className="message__act" aria-label="Message actions" onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();setMenu({x:rect.left,y:rect.bottom,text:turn.content,turn:turn.turn});}}>⋯</button></span>
      <div className={`message__bubble${player||monaSpeaking?' message__bubble--portrait':''}`}>{(player||monaSpeaking)&&<img className="message__portrait" src={face} alt=""/>}<div className="message__content"><span className="message__body">{turn.content}</span>{!player&&entry?.checks.map((c,i)=><div className="gate-check-summary" key={i}>{c.actor} · {c.stat}: {c.roll} / {c.target} · {degreeLabel[c.degree]}{c.damage?` · ${c.damage} damage`:''}</div>)}</div></div>
    </div>;})}
   </div></div>
   <div className="gate-scene-composer">
    {notice&&<p role="status" className="gate-scene-notice">{notice}</p>}
    {saveFailed&&<button type="button" onClick={async()=>{try{await saveGateScene();setSaveFailed(false);setNotice('Saved. You can continue.');}catch{setNotice('Saving is still unavailable. Keep this page open and retry.');}}}>Retry save</button>}
    {interpreting&&<p role="status">Understanding your intention… <button type="button" onClick={()=>{interpretation.current?.abort();setInterpreting(false);}}>Cancel</button></p>}
    {sequence.length>0&&!pending&&!interpreting&&<div className="gate-plan-next"><span>Next: {gateActionLabel(sequence[0]!)}</span><button type="button" disabled={blockedUI} onClick={continuePlan}>Do next step</button><button type="button" onClick={()=>setSequence([])}>Discard plan</button></div>}
    {preview&&pending&&<div className="gate-action-preview" role="region" aria-label="Review your attempt"><small>{intentSource}</small><strong>{preview.label}</strong>{sequence.length>1&&<ol className="gate-intent-steps">{sequence.map((step,i)=><li key={i}>{gateActionLabel(step)}{gateActionPreview(s,step).risk&&<small className="gate-intent-risk">{gateActionPreview(s,step).risk}</small>}</li>)}</ol>}{preview.stat&&<span>{preview.stat} · {preview.target}% chance · d100</span>}{preview.risk&&<p>{preview.risk}</p>}{preview.blocked&&<p role="status">{preview.blocked}</p>}{sequence.length>1&&<small>One step at a time. Later steps are checked again after the result.</small>}<div><button type="button" disabled={blockedUI||!!preview.blocked} onClick={()=>void run(pending)}>Attempt</button><button type="button" onClick={()=>{setPending(null);setSequence([]);}}>Change</button></div></div>}
    {!ended||playback.active?<div className="gate-composer-fields"><label>Say something<textarea rows={3} value={say} disabled={blockedUI} onChange={event=>setSay(event.target.value)} placeholder="Your character’s words…" maxLength={1000}/><button type="button" disabled={blockedUI||!say.trim()} onClick={()=>choose({kind:'say',text:say})}>Say</button></label><label>Do something<textarea rows={3} value={action} disabled={blockedUI} onChange={event=>{setAction(event.target.value);setPending(null);setSequence([]);}} placeholder="Describe an attempt, or choose an action…" maxLength={1000}/><button type="button" disabled={blockedUI||!action.trim()} onClick={doText}>Review action</button></label></div>:<p><strong>{s.phase==='entered'?'You reached the city.':s.phase==='escaped'?'You escaped the encounter.':'You were incapacitated.'}</strong> Your history is saved. Return home to try a fresh scenario.</p>}
   </div>
   <CombatPlaybackOverlay playback={playback} names={{player:session.player?.name||'Traveller',mona:'Mona',archer:'Archer'}} soundOn={soundOn}/>
  </div>
  <aside className="sb-game-toolbox gate-scene-toolbox" aria-label="Gatehouse game tools">
   <header><span className="sb-game-toolbox__eyebrow">THE GATEHOUSE</span><h2>Your next move</h2><p>A fixed-world test. Write your own intentions or use the shortcuts.</p></header>
   <section><HealthMeter name={session.player?.name||'Traveller'} value={fighters.player.hp} max={20}/><dl>{Object.entries(session.player?.stats??{}).map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl><p>Sword · Bow · {s.arrows} arrows · Lockpicks{s.keyOwner==='player'?' · Iron key':''}</p></section>
   {!ended&&<><section><h3>{s.phase==='combat'?'Your action':'Things to try'}</h3><div className="gate-command-list">{commands.map(a=>{const reason=gateActionBlock(s,a);return <button key={a.kind} type="button" disabled={blockedUI||!!reason} title={reason??gateActionPreview(s,a).risk} onClick={()=>choose(a)}>{gateActionLabel(a)}</button>;})}</div></section>
   <section><h3>People & movement</h3><HealthMeter name="Mona" value={fighters.opponents[0]!.hp} max={16}/><p>{fighters.opponents[0]!.position} · {fighters.opponents[0]!.status.join(' · ')||'Watchful'}</p><HealthMeter name="Archer" value={fighters.opponents[1]!.hp} max={10}/><p>{fighters.opponents[1]!.position} · {fighters.opponents[1]!.status.join(' · ')||'Active'} · {s.archerArrows} arrows</p><div className="gate-command-list">{(Object.keys(POSITION_NAMES) as (keyof typeof POSITION_NAMES)[]).filter(to=>to!==s.position).map(to=>{const a:GateAction={kind:'move',to},reason=gateActionBlock(s,a);return <button key={to} type="button" title={reason} disabled={blockedUI||!!reason} onClick={()=>choose(a)}>{POSITION_NAMES[to]}</button>;})}</div></section>
   <section><h3>{s.phase==='combat'?'Combat':'Risky approaches'}</h3><div className="gate-command-list">{(['mona','archer'] as const).flatMap(target=>(['sword','bow'] as const).map(weapon=>{const a:GateAction={kind:'attack',target,weapon},reason=gateActionBlock(s,a);return <button key={`${target}:${weapon}`} title={reason??gateActionPreview(s,a).risk} type="button" disabled={blockedUI||!!reason} onClick={()=>choose(a)}>{gateActionLabel(a)}{reason?.startsWith('Out of')?' · out of reach':''}</button>;}))}{s.phase==='combat'&&<><button type="button" disabled={blockedUI||s.actionUsed} onClick={()=>choose({kind:'defend'})}>Defend</button><button type="button" disabled={blockedUI} onClick={()=>choose({kind:'end-turn'})}>End turn</button></>}</div></section></>}
   {!playback.active&&<CombatLog entries={gateCombatLog(s)} active={s.phase==='combat'}/>}
   <section><h3>What you know</h3><p>Gate: {s.gateLocked?'locked':s.gateOpen?'open':'unlocked, closed'}. {s.admitted?'Entry permitted.':'No permission yet.'}{s.posternFound?' Hidden passage discovered.':''}{s.wagonTipped?' Wagon barricade blocks the main gate.':''}</p><label><input type="checkbox" checked={soundOn} onChange={event=>setSoundOn(event.target.checked)}/> Dice sound</label><details><summary>How this test works</summary><p>Say records your words; use Persuade for an appeal. Do understands everyday Swedish and English; a connected model can assist with phrasing. Written intentions are reviewed before they act. Plans run one step at a time. The game, not the model, decides what is possible. Ordinary inspection costs no roll.</p><p>In combat, move before taking your action if needed. After your result is confirmed, opponents act automatically in turn order. End turn lets you pass without taking an action. Initiative is rolled once when combat starts (lower first; tied rolls favour you). Each opponent gets one move and one action, just like you. Wounded enemies can retreat or surrender. Retreat to the road or continue into the city to escape. Chat editing and replay are disabled.</p></details></section>
   {inspect&&<section><h3>Scene inspector</h3><pre>{JSON.stringify({...s,history:s.history.slice(-1)},null,2)}</pre><button type="button" onClick={()=>setInspect(false)}>Close inspector</button></section>}
   <section className="sb-game-toolbox__session"><p>{saveFailed?'Unsaved changes. Retry saving before leaving.':'Actions, rolls and discoveries are saved with this conversation.'}</p><button type="button" disabled={working} onClick={async()=>{try{await saveGateScene();onHome(session);}catch{setSaveFailed(true);setNotice('Could not save. Keep this page open and retry.');}}}>Save & return home ↗</button></section>
  </aside>
 </>;
}
