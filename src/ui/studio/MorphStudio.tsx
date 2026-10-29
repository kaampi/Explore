import { renderMorphFrame, type Point, type Profile, type Expression } from "./morphRenderer";
import { originalPoints, originalTriangles } from "./originalMorphMesh";
import { useEffect, useRef, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";

/** Character-scoped morph authoring for animated cards and AI-selected chat expressions. */
const GRID_COLS = 7;
const GRID_ROWS = 9;
const initial: Point[] = originalPoints("shy");
const triangles: number[][] = Array.from({length:(GRID_ROWS-1)*(GRID_COLS-1)},(_,cell)=>{const x=cell%(GRID_COLS-1),y=Math.floor(cell/(GRID_COLS-1)),a=y*GRID_COLS+x,b=a+1,c=a+GRID_COLS,d=c+1;return [[a,b,c],[b,d,c]];}).flat();
const legacyTriangles: number[][] = [[0,1,4],[1,5,4],[1,2,6],[1,6,5],[0,4,3],[3,4,8],[4,5,9],[4,9,8],[5,6,10],[5,10,9],[6,2,7],[6,7,10],[3,8,14],[8,11,14],[8,9,12],[8,12,11],[9,10,13],[9,13,12],[10,7,16],[10,16,13],[11,12,15],[11,15,14],[12,13,16],[12,16,15]];
const clone = (points: Point[]) => points.map(([x,y]) => [x,y] as Point);
function load(key: string): Profile {
  try { const value = JSON.parse(localStorage.getItem(key) || "null") as Profile | null; if (value?.version === 1 && Array.isArray(value.expressions)) return value; } catch { /* invalid local draft */ }
  return { version: 1, active: false, expressions: [] };
}
function drawImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  ctx.drawImage(image, 0, 0, width, height);
}
export function MorphStudio({ characterId, repo, gallery = [], saveRequest }: { characterId: string; repo: IndexedDBRepository; gallery?: { name: string; image: string }[]; saveRequest?: { id: number; mode: "draft" | "profile" } | null }) {
  const key = "sandboxai:morph:"+characterId;
  const [profile,setProfile] = useState<Profile>(() => load(key));
  const [source,setSource] = useState(0);
  const [target,setTarget] = useState(1);
  const [mix,setMix] = useState(50);
  const [zoom,setZoom] = useState(100);
  const [spaceHeld,setSpaceHeld] = useState(false);
  const panning = useRef<{x:number;y:number;left:number;top:number;index:number}|null>(null);
  const viewports = [useRef<HTMLDivElement>(null),useRef<HTMLDivElement>(null),useRef<HTMLDivElement>(null)] as const;
  const [message,setMessage] = useState("");
  const [addingPoint,setAddingPoint] = useState(false);
  const [showMesh,setShowMesh] = useState(true);
  const [eyeEditMode,setEyeEditMode] = useState(false);
  const [playing,setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // A parent request can survive closing this editor; never replay it on mount.
  const handledSaveRequest = useRef(saveRequest?.id ?? 0);
  const eyeDragging = useRef<{expression:number; eye:number; resize?: boolean}|null>(null);
  const eyePairKey = JSON.stringify([profile.expressions[source]?.name ?? "",profile.expressions[target]?.name ?? ""]);
  const showEyeRegions = eyeEditMode;
  const eyeCorrectionActive = profile.eyeCorrections?.[eyePairKey] ?? (profile.eyeCorrections ? false : (profile.eyeEnabled ?? false));
  const morphDuration = profile.morphDurations?.[eyePairKey] ?? 1800;
  const meshTriangles = profile.triangles ?? (profile.expressions[0]?.points.length === 17 ? legacyTriangles : profile.expressions[0]?.points.length === 57 ? originalTriangles : triangles);
  const canvases = [useRef<HTMLCanvasElement>(null),useRef<HTMLCanvasElement>(null),useRef<HTMLCanvasElement>(null)] as const;
  const meshFileRef = useRef<HTMLInputElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const dragging = useRef<{ expression: number; point: number; edge: "left"|"right"|"top"|"bottom"|null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void repo.loadCharacterMorph(characterId).then(saved => {
      if (cancelled) return;
      if (saved && typeof saved === "object" && "version" in saved && saved.version === 1 && "expressions" in saved && Array.isArray(saved.expressions)) {
        const previous = saved as Profile;
        setProfile({ ...previous, expressions: previous.expressions.length ? previous.expressions : gallery.map(g => ({name:g.name,image:g.image,points:clone(originalPoints(g.name))})) });
      } else {
        const previous = load(key);
        setProfile({ ...previous, expressions: gallery.length ? gallery.map(g => ({name:g.name,image:g.image,points:clone(originalPoints(g.name))})) : previous.expressions });
      }
      setSource(0); setTarget(1);
      setLoaded(true);
    }).catch(() => { if (!cancelled) setMessage("Could not load morph profile."); });
    return () => { cancelled = true; };
  }, [characterId, key, repo]);
  useEffect(() => {
    let cancelled=false;
    const images=profile.expressions.map(item => { const img=new Image();img.src=item.image;return img; });
    const render=()=> {
      if(cancelled)return;
      const a=profile.expressions[source],b=profile.expressions[target];
      if(!a || !b || !images[source]?.complete || !images[target]?.complete || !images[source]?.naturalWidth || !images[target]?.naturalWidth)return;
      [source,target].forEach((index,k)=>{
        const canvas=canvases[k]?.current, img=images[index],exp=profile.expressions[index];
        if(!canvas || !img || !exp)return;
        const ctx=canvas.getContext("2d");if(!ctx)return;
        ctx.clearRect(0,0,canvas.width,canvas.height);drawImage(ctx,img,canvas.width,canvas.height);
        if(showMesh){ctx.strokeStyle="#29d8df";ctx.lineWidth=Math.max(.15,canvas.width/Math.max(1,canvas.getBoundingClientRect().width))*.65;
        for(const tri of meshTriangles){const p=tri.map(i=>exp.points[i]);if(p.some(v=>!v))continue;ctx.beginPath();ctx.moveTo(p[0]![0]*canvas.width,p[0]![1]*canvas.height);for(let j=1;j<3;j++)ctx.lineTo(p[j]![0]*canvas.width,p[j]![1]*canvas.height);ctx.closePath();ctx.stroke();}
        for(const p of exp.points){ctx.beginPath();ctx.arc(p[0]*canvas.width,p[1]*canvas.height,Math.max(.3,canvas.width/Math.max(1,canvas.getBoundingClientRect().width))*2,0,Math.PI*2);ctx.fillStyle="#29d8df";ctx.fill();}}
        if(showEyeRegions){const centers=profile.eyeCenters?.[exp.name] ?? [[.37,.39],[.63,.39]];ctx.strokeStyle="#ffffff";ctx.fillStyle="#ffffff";ctx.lineWidth=Math.max(.15,canvas.width/Math.max(1,canvas.getBoundingClientRect().width))*1.5;for(const p of centers){ctx.beginPath();ctx.ellipse(p[0]*canvas.width,p[1]*canvas.height,(profile.eyeWidth??25)/252*canvas.width,(profile.eyeHeight??14)/282*canvas.height,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(p[0]*canvas.width,p[1]*canvas.height,Math.max(.3,canvas.width/Math.max(1,canvas.getBoundingClientRect().width))*2,0,Math.PI*2);ctx.fill();const rx=(profile.eyeWidth??25)/252*canvas.width,ry=(profile.eyeHeight??14)/282*canvas.height;const hx=(p[0]*canvas.width)+rx*Math.SQRT1_2,hy=(p[1]*canvas.height)+ry*Math.SQRT1_2;const size=8*canvas.width/Math.max(1,canvas.getBoundingClientRect().width);ctx.fillStyle="#173b29";ctx.fillRect(hx-size/2,hy-size/2,size,size);ctx.strokeRect(hx-size/2,hy-size/2,size,size);ctx.fillStyle="#ffffff";}}
      });
      const canvas=canvases[2].current,ctx=canvas?.getContext("2d");
      if(!canvas || !ctx)return;
      renderMorphFrame(canvas,profile,images,source,target,mix/100);
    };
    images.forEach(img=>img.addEventListener("load",render));render();
    return ()=>{cancelled=true;images.forEach(img=>img.removeEventListener("load",render));};
  },[profile,source,target,mix,meshTriangles,showMesh,zoom,eyeCorrectionActive,showEyeRegions]);
  async function save(active: boolean) {
    if (!loaded) { setMessage("Wait for the saved morph profile to finish loading before saving."); return; }
    const next={...profile,active};
    try {
      const stored = await repo.loadCharacterMorph(characterId);
      const existingGallery = stored && typeof stored === "object" && "gallery" in stored && Array.isArray(stored.gallery) ? stored.gallery as {id:string;name:string;image:string;kind:"ordinary"|"emotion";emotion:string}[] : [];
      const missing = next.expressions.filter(e=>!existingGallery.some(g=>g.image===e.image)).map(e=>({id:crypto.randomUUID(),name:e.name,image:e.image,kind:"emotion" as const,emotion:e.name}));
      await repo.saveCharacterMorph(characterId,{...next,gallery:[...existingGallery,...missing]});
      window.dispatchEvent(new CustomEvent("kaampi:morph-saved", { detail: characterId }));
      setProfile(next);
      try { localStorage.removeItem(key); } catch { /* migration cleanup is optional */ }
      setMessage(active ? "Morph profile saved. Card animation is enabled; chat expressions use local Ollama." : "Morph draft saved in IndexedDB.");
    } catch (err) { setMessage(err instanceof Error ? err.message : "Could not save morph profile."); }
  }
  useEffect(()=>{if(saveRequest && saveRequest.id!==handledSaveRequest.current){handledSaveRequest.current=saveRequest.id;void save(saveRequest.mode==="profile");}},[saveRequest]);
  function addMeshPoint(index: number, x: number, y: number) {
    const expression=profile.expressions[index];if(!expression)return;
    const barycentric=(a:Point,b:Point,c:Point):[number,number,number] | null=>{
      const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
      if(Math.abs(den)<1e-8)return null;
      const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den;
      const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;
      return [u,v,1-u-v];
    };
    for(let k=0;k<meshTriangles.length;k++){
      const tri=meshTriangles[k]!, a=expression.points[tri[0]!]!,b=expression.points[tri[1]!]!,c=expression.points[tri[2]!]!;
      const weights=barycentric(a,b,c);
      if(!weights || weights.some(w=>w<-.0001))continue;
      const pointId=expression.points.length;
      const updated=profile.expressions.map(item=>{
        const [i,j,l]=tri;const p=item.points[i!]!,q=item.points[j!]!,r=item.points[l!]!;
        return {...item,points:[...item.points,[p[0]*weights[0]+q[0]*weights[1]+r[0]*weights[2],p[1]*weights[0]+q[1]*weights[1]+r[1]*weights[2]] as Point]};
      });
      const updatedTriangles=meshTriangles.filter((_,i)=>i!==k).concat([[tri[0]!,tri[1]!,pointId],[tri[1]!,tri[2]!,pointId],[tri[2]!,tri[0]!,pointId]]);
      setProfile({...profile,active:false,expressions:updated,triangles:updatedTriangles});
      setAddingPoint(false);
      setMessage("Control point added to all expressions.");
      return;
    }
    setMessage("Select a position inside a mesh triangle.");
  }
  async function addFiles(files: FileList | null) {
    if(!files)return;
    const items:Expression[]=[];
    for(const file of Array.from(files).filter(f=>f.type.startsWith("image/"))) {
      const image=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Image read failed"));reader.readAsDataURL(file);});
      const name=file.name.replace(/\.[^.]+$/,"").toLowerCase();
      items.push({name,image,points:clone(originalPoints(name))});
    }
    setProfile(p=>({...p,active:false,expressions:[...p.expressions,...items]}));
    setMessage("Images added. Save to retain changes.");
  }
  async function importMesh(file: File | null) {
    if(!file)return;
    try {
      const raw: unknown=JSON.parse(await file.text());
      if(!raw || typeof raw!=="object")throw new Error("Invalid mesh file.");
      const obj=raw as Record<string,unknown>;
      const width=Number(obj.width),height=Number(obj.height);
      if(!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0)throw new Error("Invalid image dimensions.");
      const rawPoints=obj.points;
      if(!rawPoints || typeof rawPoints!=="object" || Array.isArray(rawPoints))throw new Error("Missing expression points.");
      const rows=rawPoints as Record<string,unknown>;
      const importedTriangles=obj.triangles;
      if(!Array.isArray(importedTriangles)||!importedTriangles.every(t=>Array.isArray(t)&&t.length===3&&t.every(i=>Number.isInteger(i)&&i>=0)))throw new Error("Invalid triangles.");
      const pointCount=Object.values(rows).find(Array.isArray)?.length ?? 0;
      if(pointCount<3 || !importedTriangles.every(t=>t.every((i:number)=>i<pointCount)))throw new Error("Triangle indices exceed mesh points.");
      const normalize=(input:unknown):Point[]=>{
        if(!Array.isArray(input)||input.length!==pointCount)throw new Error("All expressions must share a mesh.");
        return input.map(p=>{
          if(!Array.isArray(p)||p.length!==2||!p.every((n:unknown)=>typeof n==="number"&&Number.isFinite(n)))throw new Error("Invalid control point.");
          return [Math.max(0,Math.min(1,p[0]/width)),Math.max(0,Math.min(1,p[1]/height))] as Point;
        });
      };
      const updated=profile.expressions.map(exp=>{
        const points=rows[exp.name.toLowerCase()];
        return {...exp,points:points ? normalize(points):clone(normalize(Object.values(rows)[0]))};
      });
      if(updated.length===0)throw new Error("Add expression images before importing mesh.");
      setProfile(p=>({...p,active:false,expressions:updated,triangles:importedTriangles as number[][]}));
      setMessage("Mesh imported. Review alignment and save the profile.");
    } catch(err) {setMessage(err instanceof Error?err.message:"Mesh import failed.");}
  }
  function movePoint(event: React.PointerEvent<HTMLCanvasElement>,index:number) {
    const viewport=viewports[index]?.current;
    if(event.type==="pointerdown" && spaceHeld && viewport){panning.current={x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,index};event.currentTarget.setPointerCapture(event.pointerId);return;}
    if(event.type==="pointermove" && panning.current?.index===index && viewport){viewport.scrollLeft=panning.current.left-(event.clientX-panning.current.x);viewport.scrollTop=panning.current.top-(event.clientY-panning.current.y);return;}
    if((event.type==="pointerup"||event.type==="pointercancel") && panning.current?.index===index){panning.current=null;return;}
    const canvas=canvases[index]?.current,expIndex=index===0?source:target,exp=profile.expressions[expIndex];if(!canvas||!exp)return;
    const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
    if(event.type==="pointerup" || event.type==="pointercancel"){eyeDragging.current=null;dragging.current=null;return;}
    if(event.type==="pointermove" && dragging.current?.expression===expIndex){const {point,edge}=dragging.current;const nx=edge==="left"?0:edge==="right"?1:Math.max(0,Math.min(1,x));const ny=edge==="top"?0:edge==="bottom"?1:Math.max(0,Math.min(1,y));setProfile(p=>({...p,active:false,expressions:p.expressions.map((item,i)=>i===expIndex?{...item,points:item.points.map((v,j)=>j===point?[nx,ny] as Point:v)}:item)}));return;}
    if(event.type==="pointermove" && eyeDragging.current?.expression===expIndex){const {eye,resize}=eyeDragging.current;if(resize){const center=(profile.eyeCenters?.[exp.name]??[[.37,.39],[.63,.39]])[eye]!;setProfile(p=>({...p,active:false,eyeWidth:Math.max(10,Math.min(50,Math.abs(x-center[0])*252/Math.SQRT1_2)),eyeHeight:Math.max(5,Math.min(35,Math.abs(y-center[1])*282/Math.SQRT1_2))}));return;}setProfile(p=>{const name=p.expressions[expIndex]?.name;if(!name)return p;const centers=(p.eyeCenters?.[name]??[[.37,.39],[.63,.39]]).map((v,i)=>i===eye?[Math.max(0,Math.min(1,x)),Math.max(0,Math.min(1,y))] as Point:v);return {...p,active:false,eyeCenters:{...p.eyeCenters,[name]:centers}};});return;}
    if(event.type!=="pointerdown")return;
    if(eyeEditMode){
      if(!showEyeRegions)return;
      const centers=profile.eyeCenters?.[exp.name]??[[.37,.39],[.63,.39]];
      const resizeEye=centers.findIndex(p=>Math.hypot((x-p[0]-(profile.eyeWidth??25)/252*Math.SQRT1_2)*rect.width,(y-p[1]-(profile.eyeHeight??14)/282*Math.SQRT1_2)*rect.height)<=12);
      if(resizeEye>=0){eyeDragging.current={expression:expIndex,eye:resizeEye,resize:true};canvas.setPointerCapture(event.pointerId);return;}
      // Grab anywhere inside an ellipse, including its border and central handle.
      let closest=Number.POSITIVE_INFINITY,eye=-1;
      centers.forEach((p,i)=>{const dx=(x-p[0])*rect.width,dy=(y-p[1])*rect.height;const rx=Math.max(12,(profile.eyeWidth??25)/252*rect.width),ry=Math.max(12,(profile.eyeHeight??14)/282*rect.height);const distance=(dx*dx)/(rx*rx)+(dy*dy)/(ry*ry);if(distance<=1.35 && distance<closest){closest=distance;eye=i;}});
      if(eye>=0){eyeDragging.current={expression:expIndex,eye};canvas.setPointerCapture(event.pointerId);}
      return;
    }
    if(addingPoint){addMeshPoint(expIndex,x,y);return;}
    // Mesh editing only: eye regions cannot intercept vertex selection.
    let closest=12,point=-1;
    exp.points.forEach((p,i)=>{const d=Math.hypot((p[0]-x)*rect.width,(p[1]-y)*rect.height);if(d<closest){closest=d;point=i;}});
    if(point>=0){const p=exp.points[point]!;const edge=p[0]===0?"left":p[0]===1?"right":p[1]===0?"top":p[1]===1?"bottom":null;dragging.current={expression:expIndex,point,edge};canvas.setPointerCapture(event.pointerId);}

  }
  useEffect(()=>{if(!playing)return;let frame=0;let last=0;let progress=mix/100;let direction=1;const tick=(now:number)=>{if(last){progress+=direction*(now-last)/morphDuration;if(progress>=1){progress=1;direction=-1;}if(progress<=0){progress=0;direction=1;}setMix(Math.round(progress*100));}last=now;frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[playing,source,target,morphDuration]);
  useEffect(()=>{const down=(e:KeyboardEvent)=>{if(e.code==="Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLSelectElement)){e.preventDefault();setSpaceHeld(true);}};const up=(e:KeyboardEvent)=>{if(e.code==="Space")setSpaceHeld(false);};window.addEventListener("keydown",down);window.addEventListener("keyup",up);return()=>{window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);};},[]);
  useEffect(()=>{const nodes=canvases.map(ref=>ref.current).filter((node):node is HTMLCanvasElement=>Boolean(node));const onWheel=(event:WheelEvent)=>{if(!event.ctrlKey)return;event.preventDefault();setZoom(value=>Math.max(100,Math.min(400,value+(event.deltaY<0?25:-25))));};nodes.forEach(node=>node.addEventListener("wheel",onWheel,{passive:false}));return()=>nodes.forEach(node=>node.removeEventListener("wheel",onWheel));},[profile.expressions.length]);
  const sliderRow=(label:string,value:number,min:number,max:number,unit:string,onChange:(n:number)=>void,compact=false)=> <label style={{display:"grid",gridTemplateColumns:"minmax(130px,1fr) minmax(90px,1.1fr) 46px",alignItems:"center",gap:8,minHeight:compact?28:34,fontSize:13}}><span>{label}</span><input style={{width:"100%",margin:0}} type="range" min={min} max={max} value={value} onChange={e=>onChange(Number(e.target.value))}/><span style={{textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{value}{unit}</span></label>;
  const choices=profile.expressions.map((item,i)=><option key={i} value={i}>{item.name}</option>);
  return <section className="setup-field morph-studio-editor" style={{marginTop:20,padding:16,border:"1px solid var(--border)",borderRadius:12}}>

    <div className="morph-toolbar">
      {profile.expressions.length>=2 && (<div className="morph-toolbar-tools">
        <button type="button" onClick={()=>setShowMesh(v=>!v)}>{showMesh?"Hide mesh":"Show mesh"}</button>
        <button type="button" aria-pressed={addingPoint} onClick={()=>{setAddingPoint(v=>!v);setEyeEditMode(false);}}>{addingPoint?"Cancel point":"Add mesh point"}</button>
        <button type="button" onClick={()=>setZoom(v=>Math.max(100,v-25))}>−</button><span>{zoom}%</span><button type="button" onClick={()=>setZoom(v=>Math.min(400,v+25))}>+</button>
        <button type="button" onClick={()=>setZoom(100)}>Fit</button>
      </div>)}
      <div className="morph-toolbar-files"><button type="button" onClick={()=>imageFileRef.current?.click()}>Upload more images</button><button type="button" onClick={()=>meshFileRef.current?.click()}>Import JSON</button><button type="button" onClick={()=>{const blob=new Blob([JSON.stringify(profile)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="morph-profile.json";a.click();URL.revokeObjectURL(url);}}>Export JSON</button></div>
    </div>
    <input ref={meshFileRef} style={{display:"none"}} type="file" accept=".json,application/json" aria-label="Import Morph Studio mesh JSON" onChange={e=>{void importMesh(e.target.files?.[0]??null);e.target.value="";}}/>
    <input ref={imageFileRef} style={{display:"none"}} type="file" multiple accept="image/*" aria-label="Add expression images" onChange={e=>{void addFiles(e.target.files).catch(()=>setMessage("Could not load images."));e.target.value="";}}/>
    {profile.expressions.length>=2 && <>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:12}}>
        {canvases.map((ref,i)=><div key={i} ref={viewports[i]} style={{overflow:"auto",maxHeight:"65vh",border:"1px solid var(--border)",borderRadius:8}}>
          <canvas ref={ref} width={252} height={282} aria-label={["Source mesh","Target mesh","Morph preview"][i]} style={{display:"block",width:`calc(min(100%, 51vh) * ${zoom / 100})`,maxWidth:"none",height:"auto",touchAction:"none",cursor:spaceHeld?"grab":eyeEditMode?"move":"crosshair"}} onPointerDown={i<2?e=>movePoint(e,i):undefined} onPointerMove={i<2?e=>movePoint(e,i):undefined} onPointerUp={i<2?e=>movePoint(e,i):undefined} onPointerCancel={i<2?e=>movePoint(e,i):undefined}/>
          {i<2 && <div style={{display:"flex",justifyContent:"center",gap:8,alignItems:"center",padding:8}}><button type="button" onClick={()=>i===0?setSource((source+profile.expressions.length-1)%profile.expressions.length):setTarget((target+profile.expressions.length-1)%profile.expressions.length)}>‹</button><select aria-label={i===0?"From":"To"} value={i===0?source:target} onChange={e=>i===0?setSource(Number(e.target.value)):setTarget(Number(e.target.value))}>{choices}</select><button type="button" onClick={()=>i===0?setSource((source+1)%profile.expressions.length):setTarget((target+1)%profile.expressions.length)}>›</button></div>}
          {i===2 && <div style={{display:"grid",gap:8,paddingBottom:10}}><div className="morph-transition" style={{display:"flex",alignItems:"center",gap:12,padding:"8px 12px",borderTop:"1px solid var(--border)"}}><button type="button" style={{justifySelf:"start"}} onClick={()=>setPlaying(v=>!v)}>{playing?"Pause":"Play ↔"}</button>{sliderRow("Transition",mix,0,100,"%",n=>{setPlaying(false);setMix(n);})}</div><label style={{display:"grid",gridTemplateColumns:"auto minmax(80px,1fr) auto",gap:10,alignItems:"center",padding:"0 12px",fontSize:13}}><span>Morph duration</span><input aria-label="Morph duration" type="range" min={0.3} max={6} step={0.1} value={morphDuration/1000} onChange={e=>{const duration=Number(e.target.value)*1000;setProfile(p=>({...p,active:false,morphDurations:{...p.morphDurations,[eyePairKey]:duration}}));}}/><span>{(morphDuration/1000).toFixed(1)} s</span></label></div>}
        </div>)}
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:"20px 64px",alignItems:"center",marginTop:16,padding:"14px 0",borderTop:"1px solid var(--border)"}}>
        <div style={{display:"grid",gap:20,minWidth:180}}>
          <div role="group" aria-label="Editing mode" style={{display:"flex",width:160,border:"1px solid var(--border)",borderRadius:20,overflow:"hidden",background:"var(--surface)"}}>
            {(["MESH","EYES"] as const).map((mode,index)=><button key={mode} type="button" aria-pressed={eyeEditMode===(index===1)} onClick={()=>{setEyeEditMode(index===1);setAddingPoint(false);eyeDragging.current=null;dragging.current=null;}} style={{flex:1,minHeight:26,padding:"3px 12px",border:0,borderRadius:20,background:eyeEditMode===(index===1)?"#afd29a":"transparent",color:eyeEditMode===(index===1)?"#173b29":"var(--text)",fontSize:12,fontWeight:400,cursor:"pointer"}}>{mode}</button>)}
          </div>
          <label style={{display:"flex",gap:8,alignItems:"center",fontSize:13,fontWeight:400}}><input type="checkbox" checked={eyeCorrectionActive} onChange={e=>setProfile(p=>({...p,active:false,eyeCorrections:{...p.eyeCorrections,[eyePairKey]:e.target.checked}}))}/> Eye correction</label>
        </div>
        <div style={{display:"grid",gap:0,width:420,maxWidth:"100%"}}>
          {sliderRow("Eye transition midpoint",profile.eyeMidpoint??50,0,100,"%",n=>setProfile(p=>({...p,active:false,eyeMidpoint:n})),true)}
          {sliderRow("Eye transition duration",profile.eyeDuration??30,5,100,"%",n=>setProfile(p=>({...p,active:false,eyeDuration:n})),true)}
          {sliderRow("Eye strength",profile.eyeStrength??80,0,100,"%",n=>setProfile(p=>({...p,active:false,eyeStrength:n})),true)}
        </div>
      </div>
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
