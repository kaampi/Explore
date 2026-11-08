import { mapBackgroundColor } from "../../library/worldMap";
import { SettlementOverview,BuildingSymbol } from './SettlementArtwork';
import { WorldInformationBrowser } from "./WorldInformationBrowser";
import { useEffect,useRef,useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { newRealmTemplate,type RealmTemplate } from "@library/LibrarySchema";
import { type MapType } from "@library/mapGenerator";
import { rectanglePoints,shapePath } from "@library/mapShapes";
import { mapPosition } from "@library/mapGeometry";
import { Modal } from "../components/Modal";
import { WorldMapStudio } from "./WorldMapStudio";
import "./worldMap.css";
export function MapLibrary({repo}:{repo:IndexedDBRepository}){
 const [worlds,setWorlds]=useState<RealmTemplate[]>([]),[error,setError]=useState("");
 const [opened,setOpened]=useState<{worldId:string;level:string;name:string}|null>(null);
 const [dirty,setDirty]=useState(false),[confirmClose,setConfirmClose]=useState(false),[closing,setClosing]=useState(false);
 const saveRef=useRef<(()=>Promise<boolean>)|null>(null);
 const [creating,setCreating]=useState(false),[name,setName]=useState(""),[worldId,setWorldId]=useState(""),[parentId,setParentId]=useState(""),[type,setType]=useState<MapType>("world"),[busy,setBusy]=useState(false);
 const refresh=()=>repo.listRealms().then(setWorlds).catch(e=>setError(String(e)));
 useEffect(()=>{void refresh();},[repo]);
 function close(){setOpened(null);setConfirmClose(false);setDirty(false);saveRef.current=null;void refresh();}
 const world=worlds.find(w=>w.id===worldId);
 async function create(){if(!name.trim())return;setBusy(true);setError("");try{
  if(!worldId){const w=newRealmTemplate({name:name.trim(),note:"",source:"player",worldMap:{nodes:[],routes:[],mapType:type}});await repo.saveRealm(w);setOpened({worldId:w.id,level:"",name:w.name});}
  else {const current=await repo.loadRealm(worldId);const map=current.worldMap??{nodes:[],routes:[]};if(parentId){const n=map.nodes.find(n=>n.id===parentId);if(!n)throw Error("Choose an existing place.");await repo.saveRealm({...current,updatedAt:new Date().toISOString(),worldMap:{...map,nodes:map.nodes.map(n=>n.id===parentId?{...n,contentType:type,hasMap:true}:n)}});setOpened({worldId,level:parentId,name:n.name});}
  else {if(current.worldMap)throw Error("This world already has a map. Open it from the library, or choose a place for a submap.");await repo.saveRealm({...current,updatedAt:new Date().toISOString(),worldMap:{...map,mapType:type}});setOpened({worldId,level:"",name:current.name});}}
  setDirty(false);setCreating(false);void refresh();
 }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 return <section className="map-library"><header><div><span className="world-map__eyebrow">YOUR WORLD, CONNECTED</span><h2>World Maps</h2><p>Your worlds and the places within them.</p></div><button className="map-library__new" onClick={()=>{setCreating(true);setName("");setWorldId("");setParentId("");setType("world");setError("");}}>＋ New map</button></header>
 {error&&<p role="alert">{error}</p>}
 {!worlds.some(w=>w.worldMap)&&<div className="map-library__empty"><h3>Your next world starts here</h3><p>Create a world map, then add maps for its towns, buildings and interiors.</p></div>}
 <WorldInformationBrowser repo={repo} worlds={worlds} onSaved={()=>void refresh()} onOpen={(worldId,level,name)=>{setDirty(false);setOpened({worldId,level,name});}}/>
 <details className="map-library__all-cards"><summary>Browse map cards</summary> {worlds.filter(w=>w.worldMap).map(w=><section key={w.id} className="map-library__world"><h3>{w.name}</h3><div className="map-library__cards">{[{id:"",name:w.name,type:w.worldMap?.mapType??"world"},...(w.worldMap?.nodes.filter(n=>n.hasMap||w.worldMap?.nodes.some(child=>child.parentId===n.id)).map(n=>({id:n.id,name:n.name,type:n.contentType??"settlement"}))??[])].map(entry=>{const nodes=w.worldMap?.nodes.filter(n=>!n.isJunction&&(n.parentId??"")===entry.id)??[];return <button className="map-library__card" key={entry.id} onClick={()=>{setDirty(false);setOpened({worldId:w.id,level:entry.id,name:entry.name});}}><svg viewBox="0 0 800 600" style={{background:w.worldMap?mapBackgroundColor(w.worldMap,entry.id):undefined}} aria-hidden="true">{nodes.map(n=><g key={n.id}>{n.kind.toLowerCase()==="settlement"&&(n.settlementMarker||n.useSettlementLayout!==false)?<SettlementOverview node={n} nodes={w.worldMap?.nodes??[]} routes={w.worldMap?.routes??[]} detailScale={.4}/>:<><path d={shapePath(n.shape??rectanglePoints(),p=>mapPosition(n,p))} fill={n.color??"#d7dfca"} stroke="#66786d" strokeWidth="2"/><BuildingSymbol node={n}/></>}</g>)}</svg><span className="map-library__type">{entry.type==="world"?"World / region":entry.type==="settlement"?"Village / city":"Interior"}</span><strong>{entry.name}</strong><span>{nodes.length} places · {new Date(w.updatedAt).toLocaleDateString()}</span><span className="map-library__open">Open Map Studio →</span></button>;})}</div></section>)}</details>
 {creating&&<Modal title="New map" onClose={()=>{if(!busy)setCreating(false);}}><form className="map-library__form" onSubmit={e=>{e.preventDefault();void create();}}><label>World<select value={worldId} onChange={e=>{setWorldId(e.target.value);setParentId("");const w=worlds.find(w=>w.id===e.target.value);if(w)setName(w.name);}}><option value="">Create a new world</option>{worlds.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>{worldId&&<label>Map for<select value={parentId} onChange={e=>{setParentId(e.target.value);setName(world?.worldMap?.nodes.find(n=>n.id===e.target.value)?.name??world?.name??"");}}><option value="">World overview</option>{world?.worldMap?.nodes.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>}<label>{worldId?"Place / world name":"World name"}<input required value={name} readOnly={Boolean(worldId)} onChange={e=>setName(e.target.value)} autoFocus/></label><label>Map type<select value={type} onChange={e=>setType(e.target.value as MapType)}><option value="world">World / region</option><option value="settlement">Village / city</option><option value="interior">House / interior</option></select></label>{error&&<p role="alert">{error}</p>}<button disabled={busy||!name.trim()} type="submit">{busy?"Creating…":"Open Map Studio"}</button></form></Modal>}
 {opened&&<Modal title={"Map Studio · "+opened.name} wide onClose={()=>{if(dirty)setConfirmClose(true);else close();}}><div className="map-studio-window"><WorldMapStudio repo={repo} initialWorldId={opened.worldId} initialLevel={opened.level} onDirtyChange={setDirty} saveRef={saveRef}/></div></Modal>}
 {confirmClose&&<Modal title="Unsaved map changes" onClose={()=>{if(!closing)setConfirmClose(false);}}><p>Save your changes before closing Map Studio?</p><div className="map-library__close-actions"><button disabled={closing} onClick={async()=>{setClosing(true);try{if(await saveRef.current?.())close();else setConfirmClose(false);}finally{setClosing(false);}}}>Save & close</button><button disabled={closing} onClick={close}>Discard changes</button><button disabled={closing} onClick={()=>setConfirmClose(false)}>Keep editing</button></div></Modal>}
 </section>;
}
