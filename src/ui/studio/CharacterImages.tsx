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
  const [status, setStatus] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => { let alive = true; void repo.loadCharacterMorph(characterId).then(raw => { if (alive) setProfile(normalized(raw)); }).catch(() => { if (alive) setStatus("Could not load images."); }); return () => { alive = false; }; }, [characterId, repo]);
  const gallery = profile.gallery ?? [];
  async function persist(nextGallery: CharacterImage[]) {
    try {
      // Re-read before writing to preserve the most recent mesh edits.
      const latest = normalized(await repo.loadCharacterMorph(characterId));
      const next = { ...latest, gallery: nextGallery, active: false };
      await repo.saveCharacterMorph(characterId, next);
      setProfile(next);
      setStatus("Images saved.");
    } catch { setStatus("Could not save images."); }
  }
  async function upload(files: FileList | null) {
    if (!files) return;
    try {
      const added = await Promise.all(Array.from(files).filter(f => f.type.startsWith("image/")).map(async file => {
        const image = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
        return { id: id(), name: file.name.replace(/\.[^.]+$/, ""), image, kind: "ordinary" as const, emotion: "" };
      }));
      await persist([...gallery, ...added]);
    } catch { setStatus("Could not read images."); }
  }
  async function update(item: CharacterImage, patch: Partial<CharacterImage>) {
    await persist(gallery.map(entry => entry.id === item.id ? { ...entry, ...patch } : entry));
  }
  return <section style={{marginTop:12}}>
    <h3 style={{margin:"8px 0"}}>Character images</h3>
    <p style={{fontSize:13,opacity:.8}}>Upload portraits, outfits and expression images. Only images marked as emotion images are used in Morph Studio.</p>
    <input ref={picker} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>{void upload(e.target.files);e.target.value="";}} />
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
      <button type="button" onClick={()=>picker.current?.click()}>Add images</button>
      <button type="button" onClick={()=>setOpen(true)} disabled={gallery.filter(g=>g.kind==="emotion").length<2}>Open Morph Studio</button>
    </div>
    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
      {gallery.map(item=><div key={item.id} style={{width:142,border:"1px solid #596478",padding:8,borderRadius:8}}>
        <img src={item.image} alt={item.name} style={{width:"100%",height:112,objectFit:"cover",borderRadius:5}} />
        <input aria-label="Image name" value={item.name} style={{width:"100%",boxSizing:"border-box"}} onChange={e=>setProfile(p=>({...p,gallery:(p.gallery??[]).map(g=>g.id===item.id?{...g,name:e.target.value}:g)}))} onBlur={()=>void persist(profile.gallery??[])} />
        <select aria-label="Image type" value={item.kind} style={{width:"100%"}} onChange={e=>void update(item,{kind:e.target.value as CharacterImage["kind"]})}>
          <option value="ordinary">Other image</option><option value="emotion">Emotion image</option>
        </select>
        {item.kind==="emotion" && <input aria-label="Emotion" placeholder="e.g. happy" value={item.emotion} style={{width:"100%",boxSizing:"border-box"}} onChange={e=>setProfile(p=>({...p,gallery:(p.gallery??[]).map(g=>g.id===item.id?{...g,emotion:e.target.value}:g)}))} onBlur={()=>void persist(profile.gallery??[])} />}
        <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>
          <button type="button" disabled={portrait===item.image} onClick={()=>void onPortrait(item.image).then(()=>setStatus("Default portrait updated.")).catch(()=>setStatus("Could not update portrait."))}>{portrait===item.image?"Default":"Set default"}</button>
          <button type="button" onClick={()=>void persist(gallery.filter(g=>g.id!==item.id))}>Remove</button>
        </div>
      </div>)}
    </div>
    {status && <p role="status">{status}</p>}
    {open && <div role="dialog" aria-modal="true" aria-label="Morph Studio" style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(0,0,0,.8)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:"90vw",height:"90vh",overflow:"auto",background:"#1c2524",color:"#f5f5f5",padding:20,borderRadius:12,boxSizing:"border-box"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2>Morph Studio</h2><button type="button" onClick={()=>{setOpen(false);void repo.loadCharacterMorph(characterId).then(raw=>setProfile(normalized(raw)));}}>Close ✕</button></div>
        <MorphStudio characterId={characterId} repo={repo} gallery={gallery.filter(g=>g.kind==="emotion" && g.emotion.trim()).map(g=>({name:g.emotion.trim().toLowerCase(),image:g.image}))}/>
      </div>
    </div>}
  </section>;
}
