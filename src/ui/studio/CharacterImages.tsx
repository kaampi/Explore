import { useEffect, useRef, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { MorphStudio } from "./MorphStudio";

export type CharacterImage = { id: string; name: string; image: string; kind: "ordinary" | "emotion"; emotion: string };
type StoredMorph = { version: 1; active: boolean; expressions: { name: string; image: string; points: [number,number][] }[]; gallery?: CharacterImage[]; [key: string]: unknown };
const blank = (): StoredMorph => ({ version: 1, active: false, expressions: [], gallery: [] });
const id = () => crypto.randomUUID();
const normalized = (raw: unknown): StoredMorph => {
  if (!raw || typeof raw !== "object") return blank();
  const profile = raw as StoredMorph;
  if (profile.version !== 1 || !Array.isArray(profile.expressions)) return blank();
  if (Array.isArray(profile.gallery)) return profile;
  return { ...profile, gallery: profile.expressions.map(e => ({ id: id(), name: e.name, image: e.image, kind: "emotion" as const, emotion: e.name })) };
};
export function CharacterImages({ characterId, repo, portrait, onPortrait }: { characterId: string; repo: IndexedDBRepository; portrait: string; onPortrait: (src: string) => Promise<void> }) {
  const [profile, setProfile] = useState<StoredMorph>(blank);
  const [open, setOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const draggingPicture = useRef<string | null>(null);
  const [saveRequest, setSaveRequest] = useState<{id:number;mode:"draft"|"profile"}|null>(null);
  const [status, setStatus] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => { let alive = true; void repo.loadCharacterMorph(characterId).then(raw => { if (alive) setProfile(normalized(raw)); }).catch(() => { if (alive) setStatus("Could not load images."); }); return () => { alive = false; }; }, [characterId, repo]);
  const gallery = profile.gallery ?? [];
  const ordinary = gallery.filter(g => g.kind === "ordinary");
  const emotion = gallery.filter(g => g.kind === "emotion");
  // Older characters can have a portrait without a gallery entry.
  const pictures: CharacterImage[] = ordinary.length ? ordinary : portrait && !gallery.some(g => g.image === portrait) ? [{id:"legacy-portrait",name:"Portrait",image:portrait,kind:"ordinary",emotion:""}] : [];
  async function persist(nextGallery: CharacterImage[], nextPortrait?: string) {
    try {
      const latest = normalized(await repo.loadCharacterMorph(characterId));
      const next = { ...latest, gallery: nextGallery, active: false };
      await repo.saveCharacterMorph(characterId, next);
      setProfile(next);
      if (nextPortrait !== undefined && nextPortrait !== portrait) await onPortrait(nextPortrait);
      setStatus("");
    } catch { setStatus("Could not save images."); }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    try {
      const added = await Promise.all(Array.from(files).filter(f => f.type.startsWith("image/")).map(async file => {
        const image = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
        return { id: id(), name: file.name.replace(/\.[^.]+$/, ""), image, kind: "ordinary" as const, emotion: "" };
      }));
      if (!added.length) return;
      const existing = ordinary.length ? ordinary : pictures;
      const nextOrdinary = [...existing, ...added].map(p => p.id === "legacy-portrait" ? {...p,id:id()} : p);
      await persist([...gallery.filter(g => g.kind === "emotion"), ...nextOrdinary], nextOrdinary[0]?.image);
    } catch { setStatus("Could not read images."); }
  }
  async function removePicture(item: CharacterImage) {
    const remaining = pictures.filter(g => g.id !== item.id);
    await persist([...gallery.filter(g => g.kind === "emotion"), ...remaining.filter(g => g.id !== "legacy-portrait")], remaining[0]?.image ?? "");
  }
  async function movePicture(fromId: string, toId: string) {
    if (fromId === toId) return;
    const next = [...pictures];
    const from = next.findIndex(p => p.id === fromId);
    const to = next.findIndex(p => p.id === toId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    await persist([...gallery.filter(g => g.kind === "emotion"), ...next.map(p => p.id === "legacy-portrait" ? {...p,id:id()} : p)], next[0]?.image ?? "");
  }
  async function closeStudio() {
    setOpen(false);
    try { setProfile(normalized(await repo.loadCharacterMorph(characterId))); } catch { setStatus("Could not refresh images."); }
  }
  return <section style={{marginTop:16}}>
    <input ref={picker} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>{void upload(e.target.files);e.target.value="";}} />
    <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-start"}}>
      {pictures.slice(0,3).map((item,index)=><div key={item.id} style={{position:"relative",width:142,height:150,flex:"0 0 142px",borderRadius:6,overflow:"hidden",background:"var(--sb-surface, #25302e)"}}>
        <img src={item.image} alt={item.name} title={item.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        {index===0 && <span style={{position:"absolute",bottom:6,left:6,background:"rgba(0,0,0,.72)",color:"white",padding:"3px 6px",fontSize:11,borderRadius:3}}>Default</span>}
        <button type="button" aria-label={`Remove ${item.name}`} title="Remove image" onClick={()=>void removePicture(item)} style={{position:"absolute",right:4,top:4,minWidth:24,height:24,padding:0,background:"rgba(30,30,30,.8)",color:"#fff",border:"none",borderRadius:3,cursor:"pointer"}}>×</button>
      </div>)}
      <button type="button" aria-label="Add pictures" title="Add pictures" onClick={()=>picker.current?.click()} style={{width:142,height:150,flex:"0 0 142px",border:"1px dashed var(--sb-border, #778)",borderRadius:6,background:"transparent",fontSize:28,cursor:"pointer",color:"inherit"}}>+</button>
      <button type="button" aria-label="Open Morph Studio" title="Open Morph Studio" onClick={()=>setOpen(true)} style={{width:142,height:150,flex:"0 0 142px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,border:"1px solid #a9e8b4",borderRadius:6,background:"linear-gradient(145deg,#d4f9da,#a7e8b6)",color:"#173b29",fontSize:22,fontWeight:800,lineHeight:1.12,letterSpacing:1.3,textAlign:"center",cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}><span>MORPH</span><span>STUDIO</span>{emotion.length>0 && <span style={{fontSize:12,fontWeight:600,letterSpacing:0,marginTop:8}}>{emotion.length} expressions</span>}</button>
    </div>
    <div style={{marginTop:10,display:"flex",alignItems:"center",gap:12}}><button type="button" onClick={()=>setArchiveOpen(true)} style={{fontSize:13}}>Visa bildarkiv{pictures.length ? ` (${pictures.length})` : ""}</button>{pictures.length>3 && <span style={{fontSize:12,opacity:.75}}>Visar 3 av {pictures.length} bilder</span>}</div>
    {status && <p role="status">{status}</p>}
    {archiveOpen && <div role="dialog" aria-modal="true" aria-label="Bildarkiv" style={{position:"fixed",inset:0,zIndex:10001,background:"rgba(0,0,0,.78)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"min(900px,95vw)",maxHeight:"85vh",overflowY:"auto",padding:20,borderRadius:12,background:"var(--panel)",color:"var(--text)",boxSizing:"border-box"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:14}}><div><h2 style={{margin:0}}>Bildarkiv</h2><p style={{fontSize:13,opacity:.8,margin:"5px 0 0"}}>Dra bilder för att ändra ordning. Den första bilden blir standardporträtt.</p></div><button type="button" onClick={()=>setArchiveOpen(false)}>Close ✕</button></div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {pictures.map((item,index)=><div key={item.id} draggable onDragStart={e=>{draggingPicture.current=item.id;e.dataTransfer.effectAllowed="move";}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";}} onDrop={e=>{e.preventDefault();const from=draggingPicture.current;draggingPicture.current=null;if(from)void movePicture(from,item.id);}} onDragEnd={()=>{draggingPicture.current=null;}} style={{position:"relative",width:142,height:150,borderRadius:6,overflow:"hidden",background:"#25302e",cursor:"grab"}}>
            <img src={item.image} alt={item.name} title={item.name} draggable={false} style={{width:"100%",height:"100%",objectFit:"cover",pointerEvents:"none"}}/>
            {index===0 && <span style={{position:"absolute",bottom:6,left:6,background:"rgba(0,0,0,.72)",color:"white",padding:"3px 6px",fontSize:11,borderRadius:3}}>Default</span>}
            <button type="button" aria-label={`Remove ${item.name}`} onClick={()=>void removePicture(item)} style={{position:"absolute",right:4,top:4,minWidth:24,height:24,padding:0,background:"rgba(30,30,30,.8)",color:"white",border:0,borderRadius:3,cursor:"pointer"}}>×</button>
          </div>)}
          <button type="button" aria-label="Add pictures to archive" onClick={()=>picker.current?.click()} style={{width:142,height:150,border:"1px dashed #778",borderRadius:6,background:"transparent",color:"inherit",fontSize:28,cursor:"pointer"}}>+</button>
        </div>
        {!pictures.length && <p>Inga bilder ännu. Klicka på + för att lägga till bilder.</p>}
      </div>
    </div>}
    {open && <div role="dialog" aria-modal="true" aria-label="Morph Studio" style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(0,0,0,.8)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div className="morph-studio-dialog" style={{width:"90vw",height:"90vh",overflow:"auto",background:"var(--panel)",color:"var(--text)",padding:20,borderRadius:12,boxSizing:"border-box"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2>Morph Studio</h2><div style={{display:"flex",gap:8,alignItems:"center"}}><button type="button" onClick={()=>setSaveRequest(p=>({id:(p?.id??0)+1,mode:"draft"}))}>Save draft</button><button type="button" onClick={()=>setSaveRequest(p=>({id:(p?.id??0)+1,mode:"profile"}))}>Save profile</button><button type="button" onClick={()=>void closeStudio()}>Close ✕</button></div></div>
        <MorphStudio characterId={characterId} repo={repo} saveRequest={saveRequest} gallery={emotion.map(g=>({name:(g.emotion.trim() || g.name.trim()).toLowerCase(),image:g.image}))}/>
      </div>
    </div>}
  </section>;
}
