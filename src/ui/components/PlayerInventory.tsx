import { useEffect,useRef,useState } from 'react';
import type { Session } from '../../state/StateSchema';
import type { EncounterAction } from '../../game/EncounterSchema';
import { playerInventory,inventoryActions,type InventoryEntry } from '../../session/playerInventory';
import { Modal } from './Modal';
import './playerInventory.css';

function InventoryIcon({kind}:{kind:InventoryEntry['kind']}){
 return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==='weapon'?<><path d="m5 19 13-13 1-4-4 1L2 16m0-4 10 10M7 17l-4 4"/></>:kind==='ammunition'?<><path d="m4 20 16-16m-5 0h5v5M4 14v6h6"/></>:kind==='resource'?<><circle cx="12" cy="12" r="8"/><path d="M12 7v10m3-8c-4-3-8 2-3 3s1 6-3 3"/></>:<><rect x="5" y="6" width="14" height="16" rx="4"/><path d="M9 6V4a3 3 0 0 1 6 0v2M5 12h14m-9 3h4"/></>}</svg>;
}
const groups=[['item','Carried items'],['weapon','Weapons'],['ammunition','Ammunition'],['resource','Money & resources']] as const;

export function PlayerInventory({session,busy=false,onAction}:{session:Session;busy?:boolean;onAction?:(action:EncounterAction)=>void}){
 const entries=playerInventory(session),signature=JSON.stringify(entries.map(e=>[e.key,e.quantity]));
 const previous=useRef({sessionId:session.id,entries}),[selected,setSelected]=useState<string|null>(null),[message,setMessage]=useState(''),[recent,setRecent]=useState<string[]>([]);
 useEffect(()=>{
  const before=previous.current;previous.current={sessionId:session.id,entries};
  if(before.sessionId!==session.id){setMessage('');setRecent([]);setSelected(null);return;}
  const gained=entries.filter(e=>e.quantity>(before.entries.find(old=>old.key===e.key)?.quantity??0)),lost=before.entries.filter(e=>e.quantity>(entries.find(now=>now.key===e.key)?.quantity??0));
  if(!gained.length&&!lost.length)return;
  setMessage(gained.length?'Added to inventory: '+gained.map(e=>e.name).join(', '):'Inventory updated: '+lost.map(e=>e.name).join(', '));setRecent(gained.map(e=>e.key));
  const timer=window.setTimeout(()=>{setMessage('');setRecent([]);},6000);return()=>window.clearTimeout(timer);
 },[session.id,signature]);
 useEffect(()=>{if(selected&&!entries.some(e=>e.key===selected))setSelected(null);},[selected,signature]);
 const item=entries.find(e=>e.key===selected),choices=item&&onAction?inventoryActions(session,item):[];
 const count=entries.filter(e=>e.kind==='item'||e.kind==='weapon').length;
 return <section className="player-inventory" aria-label="Player inventory">
  <div className="player-inventory__heading"><span className="player-inventory__title"><InventoryIcon kind="item"/><h3>Inventory</h3></span><span className="player-inventory__count">{count} {count===1?'item':'items'}</span></div>
  <div className="player-inventory__feedback" role="status" aria-live="polite" aria-atomic="true">{message&&<span>{message}</span>}</div>
  {!entries.length?<p className="player-inventory__empty">Your inventory is empty. Items you collect will appear here.</p>:<>
   <p className="player-inventory__hint">Choose an item to inspect it.</p>
   {groups.map(([kind,label])=>{const group=entries.filter(e=>e.kind===kind);return group.length?<div key={kind} className="player-inventory__group"><h4>{label}</h4><ul>{group.map(entry=><li key={entry.key}><button type="button" className={'player-inventory__item'+(recent.includes(entry.key)?' player-inventory__item--new':'')} aria-label={'Inspect '+entry.name} aria-haspopup="dialog" onClick={()=>setSelected(entry.key)}><span className="player-inventory__icon"><InventoryIcon kind={entry.kind}/></span><span className="player-inventory__name">{entry.name}{entry.container&&<small>In {entry.container}</small>}</span>{entry.kind==='ammunition'||entry.kind==='resource'?<span className="player-inventory__quantity">{entry.quantity}</span>:recent.includes(entry.key)?<span className="player-inventory__new">New</span>:<span className="player-inventory__chevron" aria-hidden="true">›</span>}</button></li>)}</ul></div>:null;})}
  </>}
  {item&&<Modal title={item.name} onClose={()=>setSelected(null)}>
   <div className="inventory-detail"><div className="inventory-detail__visual">{item.imageDataUrl?<img src={item.imageDataUrl} alt={item.name}/>:<InventoryIcon kind={item.kind}/>}</div><small>{groups.find(([kind])=>kind===item.kind)?.[1]}{item.container?' · In '+item.container:''}</small>
    {item.description?<p>{item.description}</p>:<p>You are carrying this {item.kind==='resource'?'resource':'item'}.</p>}
    {(item.kind==='ammunition'||item.kind==='resource')&&<p>Amount: <strong>{item.quantity}</strong></p>}
    {!!item.facts?.length&&<dl>{item.facts.map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
    {item.readableContent&&<div className="inventory-detail__reading"><h3>Read</h3><p>{item.readableContent}</p></div>}
    {!!choices.length&&<div className="inventory-detail__actions"><h3>Available here</h3>{choices.map(choice=><div key={choice.label}><button type="button" disabled={busy||!!choice.blocked} onClick={()=>{setSelected(null);onAction?.(choice.action);}}>{choice.label}</button>{choice.blocked&&<small>{choice.blocked}</small>}</div>)}</div>}
   </div><div className="sb-dialog__actions"><button type="button" onClick={()=>setSelected(null)}>Close</button></div>
  </Modal>}
 </section>;
}
