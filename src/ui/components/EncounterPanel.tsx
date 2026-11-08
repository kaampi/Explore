import { PlayerInventory } from './PlayerInventory';
import { adventureHistoryEntry,adventureOptions,adventureCompleted } from '../../game/AdventureEngine';
import { CombatStage } from '../combat/CombatStage';
import { projectFighters } from '../combat/fighters';
import { useCombatPlayback } from '../combat/useCombatPlayback';
import { CombatPlaybackOverlay } from '../combat/CombatPlaybackOverlay';
import { lineOfSight } from '../../game/geometry';
import { CombatLog,encounterCombatLog,isCombatRecord } from './CombatLog';
import { HealthMeter } from './HealthMeter';
import { useEffect, useRef, useState,type ReactNode } from 'react';
import type { Session } from '@state/StateSchema';
import { useEngine } from '../EngineStore';
import { MessageMenu } from './MessageMenu';
import type { EncounterAction, EncounterRequest } from '../../game/EncounterSchema';
import { actionBlock, attackTarget, combatOver, hostile } from '../../game/EncounterEngine';
import { encounterCommands, proposeEncounterText } from '../../game/intention';
import { actionLabel } from '../../game/narration';
import { greetingTarget,spokenInteraction } from '../../game/dialogue';
import { encounterRules } from '../../game/rules';
import { ActionSaveError } from '../../persistence/ActionSaveError';

export function EncounterPanel({ onHome,mapView,backdrop }: { onHome: (session: Session) => void;mapView?:ReactNode;backdrop?:ReactNode }) {
  const { useSession, executeEncounterAction, saveEncounter: saveSession,setCombatArtwork,transitionAdventure } = useEngine(), session = useSession(), game = session.encounter!;
  const { definition: d, state: s } = game, player = s.actors[d.playerId]!;
  const [selectedTarget,setSelectedTarget]=useState('');
  const [say, setSay] = useState(''), [text, setText] = useState(''), [pending, setPending] = useState<EncounterRequest | null>(null);
  const [notice, setNotice] = useState(''), [saving, setSaving] = useState(false), [saveFailed, setSaveFailed] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const lock = useRef(false), log = useRef<HTMLDivElement>(null), current = useRef(s); current.current = s;
  const ended = s.phase === 'defeated' || s.phase === 'complete';
  const playback=useCombatPlayback(session,()=>{
    const now=current.current;
    if(now.phase==='combat'&&now.actors[d.playerId]!.actionsLeft===0&&!saveFailed){void run({kind:'end-turn'});return true;}
    return false;
  });
  const arena=s.phase==='combat'||playback.combat;
  const turnLabel=playback.actorId===d.playerId?'Your turn':`${s.actors[playback.actorId]?.name??playback.actorId}’s turn`;
  const busy = saving || playback.active || saveFailed, commands = encounterCommands(game).filter(action=>{
    if(action.kind!=='interact')return true;const door=s.barriers[action.barrierId];
    return !door?.shared||(!door.open&&(door.locked?action.operation==='unlock':action.operation==='open'));
  });
  const visibleTurns=session.conversation.filter((_turn,index)=>index===0||!isCombatRecord(adventureHistoryEntry(session,session.conversation[index] as {actionId?:string;actionSceneId?:string},index))).length;
  useEffect(() => { log.current?.scrollTo?.({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [visibleTurns]);
  useEffect(()=>{
    if(!busy&&s.phase==='combat'&&player.actionsLeft===0)void run({kind:'end-turn'},{id:`auto-pass:${s.revision}`,expectedRevision:s.revision,expectedSceneId:d.id,action:{kind:'end-turn'}});
  },[busy,s.revision,s.phase,player.actionsLeft]);
  async function run(action: EncounterAction, request?: EncounterRequest) {
    if (lock.current || busy || ended) return;
    const reason = actionBlock(d, s, action); if (reason) { setNotice(reason); return; }
    if(action.kind==='attack')setSelectedTarget(action.targetId);
    lock.current = true; setSaving(true); setNotice(''); setPending(null);
    const revision = s.revision;
    try { await executeEncounterAction(request ?? { id: crypto.randomUUID(), expectedRevision: revision, action,expectedSceneId:d.id }); setSay(''); setText(''); if(action.kind==='say'&&!spokenInteraction(d,s,action.text)&&!greetingTarget(d,s,action.text))setNotice('This scene has no prepared reply for that topic yet. Try one of the conversation choices in the panel.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not complete the action.'); if (error instanceof ActionSaveError || current.current.revision > revision) setSaveFailed(true); }
    finally { lock.current = false; setSaving(false); }
  }
  function chance(action: EncounterAction) {
    if (action.kind === 'attack') return attackTarget(d, s, d.playerId, action.targetId, action.weaponId);
    if (action.kind === 'interaction') { const check = d.interactions.find(i => i.id === action.interactionId)?.check; if (check) return encounterRules(d).skillTarget(player, check.stat, check.modifier); }
  }
  function choose(action:EncounterAction){
    if(busy||ended)return;
    if(action.kind==='attack'&&s.actors[action.targetId]?.disposition==='surrendered'){setNotice('');setPending({id:crypto.randomUUID(),expectedRevision:s.revision,expectedSceneId:d.id,action});return;}
    void run(action);
  }
  function button(action: EncounterAction) {
    const label = actionLabel(d, s, action), reason = actionBlock(d, s, action);
    return <button key={JSON.stringify(action)} type="button" disabled={busy || ended || !!reason} title={reason ?? (action.kind === 'interaction' ? d.interactions.find(i => i.id === action.interactionId)?.description : undefined)} onClick={() => choose(action)}>{label}</button>;
  }
  const preview = pending ? actionBlock(d, s, pending.action) : undefined;
  const fighters=projectFighters(session,playback.actors),targetId=playback.active&&playback.actorId!==d.playerId?playback.actorId:fighters.opponents.find(actor=>actor.id===selectedTarget)?.id??fighters.opponents[0]?.id??'';
  const target=s.actors[targetId];
  const fightRange=target?.position===player.position?'Within melee reach':target&&lineOfSight(d,s,player.position,target.position)?'Out of melee reach':'Line of sight blocked · Out of melee reach';
  const fightActions=player.weapons.map(weaponId=>{const action:EncounterAction={kind:'attack',targetId,weaponId};return {id:weaponId,label:d.weapons.find(weapon=>weapon.id===weaponId)?.name??weaponId,blocked:actionBlock(d,s,action),run:()=>choose(action)};});
  const pendingInteraction = pending?.action.kind === "interaction" ? d.interactions.find(i => i.id === (pending.action as Extract<EncounterAction, {kind:"interaction"}>).interactionId) : undefined;
  return <>
    <div className={`chat-panel gate-scene-panel${arena?' gate-scene-panel--combat':''}`}>
      {menu && <MessageMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={[{ label: 'Copy', action: () => { void navigator.clipboard?.writeText(menu.text); } }]} />}
      <div className="gate-scene-status"><span>{fighters.player.position} · {arena ? `Combat · round ${playback.round??s.round}` : ended ? 'Encounter complete' : 'Exploration'}</span><span>{playback.active?turnLabel:s.phase === 'combat' ? `Actions ${player.actionsLeft} · Moves ${player.movesLeft}` : d.title}</span>{s.phase === 'combat' && <span>Order: {s.initiative!.order.map(id => s.actors[id]!.name).join(' → ')} · {turnLabel}</span>}</div>
      <div className={`chat-stage${arena?' chat-stage--combat':''}${backdrop&&!arena?' chat-stage--backdrop':''}`}>{!arena&&backdrop}{arena&&<CombatStage player={fighters.player} opponents={fighters.opponents} selectedId={targetId} onSelect={setSelectedTarget} activeId={playback.actorId} turnLabel={turnLabel} round={playback.round??s.round} range={fightRange} actions={fightActions} busy={busy} onArtwork={setCombatArtwork}/>}<div className="chat-log" ref={log} hidden={arena}>
        {(session.conversation as { turn: number; role: string; content: string;actionId?:string;actionSceneId?:string }[]).map((turn, index) => {
          const mine = turn.role === 'player', entry = index ? adventureHistoryEntry(session,turn,index) : undefined;
          if(isCombatRecord(entry))return null;
          return <div key={turn.turn} className={`message message--${mine ? 'player' : 'character message--narrator'}`} onContextMenu={event => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, text: turn.content }); }}>
            <span className="message__attribution">{mine ? player.name : entry?.speakerId ? (s.actors[entry.speakerId]?.name??session.adventure?.actors[entry.speakerId]?.name??'Narrator') : 'Narrator'}</span>
            <div className="message__bubble"><div className="message__content"><span className="message__body">{turn.content}</span>{!mine && entry?.checks.map((check, i) => <div className="gate-check-summary" key={i}>{(s.actors[check.actorId]?.name??session.adventure?.actors[check.actorId]?.name??check.actorId)} · {check.stat}: {check.roll} / {check.target} · {check.degree}{check.damage ? ` · ${check.damage} damage` : ''}</div>)}</div></div>
          </div>;
        })}
      </div></div>
      <div className="gate-scene-composer">
        {notice && <p role="status">{notice}</p>}
        {saveFailed && <p role="alert">The action is resolved but saving failed. Keep this page open. <button type="button" onClick={async () => { try { await saveSession(); setSaveFailed(false); setNotice('Saved.'); } catch { setNotice('Saving is still unavailable.'); } }}>Retry save</button></p>}
        {pending && <div className="gate-action-preview" role="region" aria-label="Review your attempt"><strong>{actionLabel(d, s, pending.action)}</strong>{chance(pending.action) !== undefined && <span>{chance(pending.action)}% chance · d100</span>}{pendingInteraction && <p>{pendingInteraction.description}</p>}{pending.action.kind==='attack'&&s.actors[pending.action.targetId]?.disposition==='surrendered'&&<p>This opponent has surrendered. Attacking breaks the surrender and resumes combat. Other hostile participants can intervene.</p>}{preview && <p role="status">{preview}</p>}<div><button type="button" disabled={busy || !!preview} onClick={() => void run(pending.action, pending)}>Attempt</button><button type="button" onClick={() => setPending(null)}>Change</button></div></div>}
        {!ended||playback.active ? <div className="gate-composer-fields"><label>Say something<textarea rows={3} disabled={busy} value={say} maxLength={1000} onChange={event => setSay(event.target.value)} placeholder="Your character’s words…" /><button type="button" disabled={busy || !say.trim()} onClick={() => void run({ kind: 'say', text: say })}>Say</button></label><label>Do something<textarea rows={3} disabled={busy} value={text} maxLength={1000} onChange={event => { setText(event.target.value); setPending(null); }} placeholder="Describe the target and action, or use an action name from the panel…" /><button type="button" disabled={busy || !text.trim()} onClick={() => { const action = proposeEncounterText(game, text); if (action) { setNotice(''); setPending({ id: crypto.randomUUID(), expectedRevision: s.revision, expectedSceneId:d.id, action }); } else setNotice('Please make the target and action clearer, or choose an action from the panel. The scene is unchanged.'); }}>Review action</button></label></div> : <p>This encounter has ended. Your history is saved.</p>}
      </div>
      <CombatPlaybackOverlay playback={playback} names={Object.fromEntries(Object.values(s.actors).map(a=>[a.id,a.name]))}/>
    </div>
    <aside className="sb-game-toolbox gate-scene-toolbox" aria-label="Encounter game tools">
      {mapView&&<section className="sb-game-toolbox__map">{mapView}</section>}
      <header><span className="sb-game-toolbox__eyebrow">YOUR NEXT MOVE</span><h2>{d.title}</h2><p>{session.adventure?'Explore the scene through its actions. Discoveries can open new connections, and your progress is saved.':'Talk, negotiate, explore or fight. Your choices and their consequences are saved.'}</p></header>
      <section><HealthMeter name={player.name} value={fighters.player.hp} max={player.maxHp}/></section>
      <PlayerInventory session={session} busy={busy} onAction={choose}/>
      {session.adventure&&<section className="adventure-path">
        <small>YOUR ADVENTURE</small><h3>{session.adventure.title}</h3>
        <p>{session.adventure.scenes.find(scene=>scene.id===session.adventure!.currentSceneId)?.name}</p>
        {session.adventure.goal&&<div className={`adventure-goal${adventureCompleted(session)?' adventure-goal--complete':''}`} role="status" aria-label="Adventure objective">
          <strong>{adventureCompleted(session)?'✓ Adventure completed':'Your objective'}</strong><p>{session.adventure.goal.title}</p>
          {adventureCompleted(session)&&<small>Your progress is saved. You can keep exploring or return home.</small>}
        </div>}
        <div className="gate-command-list">{adventureOptions(session).map(option=><button type="button" key={option.id} disabled={busy||s.phase==='combat'||ended} onClick={async()=>{if(lock.current||busy)return;lock.current=true;setSaving(true);try{await transitionAdventure({id:crypto.randomUUID(),linkId:option.id,expectedStateVersion:session.stateVersion});setPending(null);setText('');setSay('');setNotice('');}catch(error){setNotice(error instanceof Error?error.message:'Could not continue.');if(error instanceof ActionSaveError)setSaveFailed(true);}finally{lock.current=false;setSaving(false);}}}>{option.label} →</button>)}</div>
        {!adventureOptions(session).length&&!adventureCompleted(session)&&<p>Explore this scene to discover what comes next.</p>}
      </section>}
      {Object.keys(s.itemLocations).some(id=>s.itemLocations[id]===player.position)&&<section><h3>Objects here</h3><p>{d.items.filter(item=>s.itemLocations[item.id]===player.position).map(item=>item.name).join(', ')}</p></section>}
      <section><h3>People & opportunities</h3><div className="gate-command-list">{commands.filter(a=>a.kind==='look'||a.kind==='interaction'&&(!session.adventure||d.interactions.some(i=>i.id===a.interactionId&&i.requiresFlags.every(flag=>s.flags.includes(flag))&&i.excludesFlags.every(flag=>!s.flags.includes(flag))))).map(button)}</div>{d.interactions.some(i=>i.success.effects.some(e=>e.kind==='transfer-resource')) && <p>Agreements and purchases are separate choices. An agreed price does not spend your credits.</p>}</section>
      {commands.some(a=>a.kind==='move'||a.kind==='interact')&&<section><h3>Movement & passages</h3><div className="gate-command-list">{commands.filter(a => a.kind === 'move' || a.kind === 'interact').map(button)}</div></section>}
      {Object.keys(s.actors).length>1&&<section><h3>People nearby</h3>{Object.values(s.actors).filter(a => a.id !== d.playerId).map(actor => <div key={actor.id}><HealthMeter name={actor.name} value={fighters.opponents.find(a=>a.id===actor.id)?.hp??actor.hp} max={actor.maxHp}/><p>{d.places.find(p => p.id === actor.position)!.name} · {actor.hp === 0 ? 'Incapacitated' : actor.disposition !== 'active' ? actor.disposition : actor.defending ? 'Defending' : hostile(d, player, actor) ? 'Hostile' : 'Neutral'}</p></div>)}</section>}
      {commands.some(a=>a.kind==='attack'||a.kind==='defend')&&<section><h3>{s.phase === 'combat' ? 'Combat' : 'Risky approaches'}</h3><div className="gate-command-list">{commands.filter(a => a.kind === 'attack' || a.kind === 'defend' || a.kind === 'end-turn').map(button)}</div>{combatOver(d, s) && <p>No opponents are still fighting. You can continue exploring.</p>}</section>}
      {!playback.active&&<CombatLog entries={encounterCombatLog(game)} active={s.phase==='combat'}/>}
      <section className="sb-game-toolbox__session"><button type="button" disabled={saving || saveFailed} onClick={async () => { try { await saveSession(); onHome(session); } catch { setSaveFailed(true); } }}>Save & return home ↗</button></section>
    </aside>
  </>;
}
