import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { CombatBeatSchema, type CombatBeat } from '../../game/EncounterSchema';
import { gateCombatState } from '../../scenarios/gateWorld';
import type { Session } from '../../state/StateSchema';
export const TURN_PAUSE_MS = 750;
const ActorsSchema=CombatBeatSchema.shape.actors;
const QueueSchema=z.object({revision:z.number(),sceneId:z.string().optional(),beats:z.array(CombatBeatSchema).min(1),index:z.number().int().nonnegative(),phase:z.enum(['intro','rolling','result']),before:ActorsSchema,combat:z.boolean()});
type Queue=z.infer<typeof QueueSchema>;
const revision=(s:Session)=>s.encounter?.state.revision??s.gateEncounter?.revision??0;
const sceneId=(s:Session)=>s.adventure?.currentSceneId??'';
const version=(s:Session)=>`${sceneId(s)}:${revision(s)}`;
const inCombat=(s:Session)=>s.encounter?.state.phase==='combat'||s.gateEncounter?.phase==='combat';
const actors=(s:Session)=>ActorsSchema.parse(s.encounter?.state.actors??(s.gateEncounter?gateCombatState(s.gateEncounter).actors:{}));
function restore(session:Session):Queue|null{
 try{const q=QueueSchema.parse(JSON.parse(localStorage.getItem(`combat-playback:${session.id}`)??'null'));return q.revision===revision(session)&&(q.sceneId??'')===sceneId(session)&&q.index<q.beats.length?q:null;}catch{return null;}
}
/** Plays saved results in order. Timers and confirmation never roll dice or mutate combat state. */
export function useCombatPlayback(session:Session,onFinished:()=>boolean){
 const [processed,setProcessed]=useState(()=>version(session));
 const [queue,setQueue]=useState<Queue|null>(()=>restore(session)),[completed,setCompleted]=useState(0);
 const restoredResult=useRef(queue?.phase==='result'?`${queue.sceneId??''}:${queue.revision}:${queue.index}`:'');
 const previous=useRef(session),seen=useRef(version(session)),finished=useRef(0),done=useRef(onFinished);done.current=onFinished;
 const beat=queue?.beats[queue.index],playerId=session.encounter?.definition.playerId??'player';
 useEffect(()=>{
  const old=previous.current;previous.current=session;
  if(seen.current===version(session))return;seen.current=version(session);setProcessed(version(session));
  if(sceneId(old)!==sceneId(session)){setQueue(null);return;}
  const entry=session.encounter?.history.at(-1)??session.gateEncounter?.history.at(-1);
  const beats=entry?.presentation??[];
  // Old journals have no presentation snapshots; safely show their recorded checks in order.
  const fallback:CombatBeat[]=session.encounter?session.encounter.history.at(-1)?.checks.map(check=>({actorId:check.actorId,round:check.round,check,text:check.stat,actors:actors(session)}))??[]:session.gateEncounter?.history.at(-1)?.checks.map(c=>({actorId:c.actor==='Traveller'?'player':c.actor==='Mona'?'mona':'archer',round:c.round??session.gateEncounter!.round,check:{actorId:c.actor==='Traveller'?'player':c.actor==='Mona'?'mona':'archer',round:c.round??session.gateEncounter!.round,stat:c.stat,roll:c.roll,target:c.target,degree:c.degree,...(c.damage!==undefined?{damage:c.damage}:{})},text:c.stat,actors:actors(session)}))??[];
  const frames=beats.length?beats:fallback,combat=!!entry?.combat||inCombat(old)||inCombat(session)||frames.some(b=>b.actorId!==playerId);
  const useful=frames.some(b=>b.check||b.actorId!==playerId)||combat&&frames.some(b=>b.text.toLowerCase().includes('defend'));
  if(useful)setQueue({revision:revision(session),sceneId:sceneId(session),beats:frames,index:0,phase:combat?'intro':'rolling',before:actors(old),combat});
  else setQueue(null);
 },[session,playerId]);
 useEffect(()=>{
  try{const key=`combat-playback:${session.id}`;if(queue)localStorage.setItem(key,JSON.stringify(queue));else localStorage.removeItem(key);}catch{/* Appearance playback does not affect the committed encounter. */}
 },[queue,session.id]);
 function next(){setQueue(q=>{
  if(!q)return q;if(q.index+1<q.beats.length)return {...q,index:q.index+1,phase:q.combat?'intro':'rolling'};
  return null;
 });if(queue&&queue.index+1>=queue.beats.length)setCompleted(n=>n+1);}
 useEffect(()=>{
  if(!queue||queue.phase!=='intro')return;
  const timer=window.setTimeout(()=>{if(beat?.check)setQueue(q=>q?{...q,phase:'rolling'}:q);else next();},TURN_PAUSE_MS);
  return ()=>window.clearTimeout(timer);
 },[queue?.revision,queue?.index,queue?.phase]);
 useEffect(()=>{
  if(completed===finished.current)return;finished.current=completed;
  done.current();
 },[completed,session]);
 const projected=queue?(queue.phase==='result'||!beat?.check?beat?.actors:queue.index?queue.beats[queue.index-1]?.actors:queue.before):undefined;
 return {active:!!queue||processed!==version(session),combat:!!queue?.combat,actorId:beat?.actorId??playerId,playerId,beat,phase:queue?.phase,actors:projected,round:beat?.round,next,settle:()=>setQueue(q=>q?{...q,phase:'result'}:q),skipDice:restoredResult.current===`${queue?.sceneId??''}:${queue?.revision}:${queue?.index}`&&queue?.phase==='result',key:`${queue?.sceneId??''}:${queue?.revision}:${queue?.index}`};
}
export type CombatPlayback=ReturnType<typeof useCombatPlayback>;
