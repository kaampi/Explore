import { originalPoints, originalTriangles } from "./originalMorphMesh";
import { useEffect, useRef, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";

/** Character-scoped, local-first morph authoring. Experimental: activation is not yet wired to chat. */
type Point = [number, number];
type Expression = { name: string; image: string; points: Point[] };
type Profile = { version: 1; active: boolean; expressions: Expression[]; triangles?: number[][]; eyeMidpoint?: number; eyeDuration?: number; eyeEnabled?: boolean; eyeWidth?: number; eyeHeight?: number; eyeStrength?: number; eyeGuides?: boolean; eyeCenters?: Record<string, Point[]> };
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
function warpTriangle(ctx: CanvasRenderingContext2D, image: HTMLImageElement, source: Point[], target: Point[], width: number, height: number) {
  const [a,b,c] = source.map(p => [p[0]*width,p[1]*height] as Point);
  const [d,e,f] = target.map(p => [p[0]*width,p[1]*height] as Point);
  if (!a || !b || !c || !d || !e || !f) return;
  const det = a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]);
  if (Math.abs(det)<0.001) return;
  const A=(d[0]*(b[1]-c[1])+e[0]*(c[1]-a[1])+f[0]*(a[1]-b[1]))/det;
  const C=(d[0]*(c[0]-b[0])+e[0]*(a[0]-c[0])+f[0]*(b[0]-a[0]))/det;
  const E=(d[0]*(b[0]*c[1]-c[0]*b[1])+e[0]*(c[0]*a[1]-a[0]*c[1])+f[0]*(a[0]*b[1]-b[0]*a[1]))/det;
  const B=(d[1]*(b[1]-c[1])+e[1]*(c[1]-a[1])+f[1]*(a[1]-b[1]))/det;
  const D=(d[1]*(c[0]-b[0])+e[1]*(a[0]-c[0])+f[1]*(b[0]-a[0]))/det;
  const F=(d[1]*(b[0]*c[1]-c[0]*b[1])+e[1]*(c[0]*a[1]-a[0]*c[1])+f[1]*(a[0]*b[1]-b[0]*a[1]))/det;
  ctx.save();ctx.beginPath();ctx.moveTo(d[0],d[1]);ctx.lineTo(e[0],e[1]);ctx.lineTo(f[0],f[1]);ctx.closePath();ctx.clip();
  ctx.transform(A,B,C,D,E,F);ctx.drawImage(image,0,0,width,height);ctx.restore();
}
export function MorphStudio({ characterId, repo, gallery = [] }: { characterId: string; repo: IndexedDBRepository; gallery?: { name: string; image: string }[] }) {
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
  const [playing,setPlaying] = useState(false);
  const eyeDragging = useRef<{expression:number; eye:number}|null>(null);
  const meshTriangles = profile.triangles ?? (profile.expressions[0]?.points.length === 17 ? legacyTriangles : profile.expressions[0]?.points.length === 57 ? originalTriangles : triangles);
  const canvases = [useRef<HTMLCanvasElement>(null),useRef<HTMLCanvasElement>(null),useRef<HTMLCanvasElement>(null)] as const;
  const meshFileRef = useRef<HTMLInputElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const dragging = useRef<{ expression: number; point: number; edge: "left"|"right"|"top"|"bottom"|null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void repo.loadCharacterMorph(characterId).then(saved => {
      if (cancelled) return;
      if (saved && typeof saved === "object" && "version" in saved && saved.version === 1 && "expressions" in saved && Array.isArray(saved.expressions)) {
        const previous = saved as Profile;
        const reference = previous.expressions[0]?.points ?? initial;
        setProfile({ ...previous, expressions: gallery.length ? gallery.map(g => ({name:g.name,image:g.image,points:clone(previous.expressions.find(e=>e.name===g.name)?.points ?? reference)})) : previous.expressions });
      } else {
        const previous = load(key);
        setProfile({ ...previous, expressions: gallery.length ? gallery.map(g => ({name:g.name,image:g.image,points:clone(originalPoints(g.name))})) : previous.expressions });
      }
      setSource(0); setTarget(1);
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
        if(profile.eyeGuides && profile.eyeEnabled){const centers=profile.eyeCenters?.[exp.name] ?? [[.37,.39],[.63,.39]];ctx.strokeStyle="#ffad45";ctx.fillStyle="#ffad45";ctx.lineWidth=Math.max(.15,canvas.width/Math.max(1,canvas.getBoundingClientRect().width))*.7;for(const p of centers){ctx.beginPath();ctx.ellipse(p[0]*canvas.width,p[1]*canvas.height,(profile.eyeWidth??25)/252*canvas.width,(profile.eyeHeight??14)/282*canvas.height,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(p[0]*canvas.width,p[1]*canvas.height,Math.max(.3,canvas.width/Math.max(1,canvas.getBoundingClientRect().width))*2,0,Math.PI*2);ctx.fill();}}
      });
      const canvas=canvases[2].current,ctx=canvas?.getContext("2d");
      if(!canvas || !ctx)return;
      const t=mix/100, blended=a.points.map((p,i)=>[p[0]*(1-t)+b.points[i]![0]*t,p[1]*(1-t)+b.points[i]![1]*t] as Point);
      const layers=[document.createElement("canvas"),document.createElement("canvas")];
      for(let k=0;k<2;k++){const layer=layers[k]!;layer.width=canvas.width;layer.height=canvas.height;const context=layer.getContext("2d");if(!context)continue;const exp=k===0?a:b;for(const tri of meshTriangles){const src=tri.map(i=>exp.points[i]!),dst=tri.map(i=>blended[i]!);warpTriangle(context,images[k===0?source:target]!,src,dst,canvas.width,canvas.height);}}
      ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(layers[0]!,0,0);ctx.globalAlpha=t;ctx.drawImage(layers[1]!,0,0);ctx.globalAlpha=1;
      // Accelerate texture crossfade in a soft eye-region mask to reduce ghosted eyelids.
      const duration=Math.max(.05,(profile.eyeDuration ?? 30)/100);
      const midpoint=(profile.eyeMidpoint ?? 50)/100;
      const eyeT=Math.max(0,Math.min(1,(t-(midpoint-duration/2))/duration));
      if(profile.eyeEnabled && (profile.eyeStrength??80)>0 && Math.abs(eyeT-t)>.001){
        const mask=document.createElement("canvas");mask.width=canvas.width;mask.height=canvas.height;
        const maskCtx=mask.getContext("2d");
        if(maskCtx){
          maskCtx.drawImage(layers[0]!,0,0);maskCtx.globalAlpha=eyeT;maskCtx.drawImage(layers[1]!,0,0);maskCtx.globalAlpha=1;
          const region=document.createElement("canvas");region.width=canvas.width;region.height=canvas.height;
          const regionCtx=region.getContext("2d");
          if(regionCtx){
            regionCtx.fillStyle="black";
            // Default normalized eye positions for front-facing portraits.
            const ac=profile.eyeCenters?.[a.name]??[[.37,.39],[.63,.39]];
            const bc=profile.eyeCenters?.[b.name]??[[.37,.39],[.63,.39]];
            for(let i=0;i<2;i++){
              const x=(ac[i]?.[0]??.37)*(1-t)+(bc[i]?.[0]??.37)*t;
              const y=(ac[i]?.[1]??.39)*(1-t)+(bc[i]?.[1]??.39)*t;
              const gradient=regionCtx.createRadialGradient(x*canvas.width,y*canvas.height,2,x*canvas.width,y*canvas.height,(profile.eyeWidth??25)/252*canvas.width);
              gradient.addColorStop(0,"rgba(0,0,0,1)");gradient.addColorStop(1,"rgba(0,0,0,0)");
              regionCtx.fillStyle=gradient;regionCtx.beginPath();regionCtx.ellipse(x*canvas.width,y*canvas.height,(profile.eyeWidth??25)/252*canvas.width,(profile.eyeHeight??14)/282*canvas.height,0,0,Math.PI*2);regionCtx.fill();
            }
            maskCtx.globalCompositeOperation="destination-in";maskCtx.drawImage(region,0,0);
            ctx.globalAlpha=(profile.eyeStrength??80)/100;ctx.drawImage(mask,0,0);ctx.globalAlpha=1;
          }
        }
      }
    };
    images.forEach(img=>img.addEventListener("load",render));render();
    return ()=>{cancelled=true;images.forEach(img=>img.removeEventListener("load",render));};
  },[profile,source,target,mix,meshTriangles,showMesh,zoom]);
  async function save(active: boolean) {
    const next={...profile,active};
    try {
      const stored = await repo.loadCharacterMorph(characterId);
      const galleryData = stored && typeof stored === "object" && "gallery" in stored ? { gallery: stored.gallery } : {};
      await repo.saveCharacterMorph(characterId,{...next,...galleryData});
      setProfile(next);
      try { localStorage.removeItem(key); } catch { /* migration cleanup is optional */ }
      setMessage(active ? "Morph profile saved and enabled for future playback (chat integration pending)." : "Morph draft saved in IndexedDB.");
    } catch (err) { setMessage(err instanceof Error ? err.message : "Could not save morph profile."); }
  }
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
      const reference=profile.expressions[0]?.points ?? initial;
      items.push({name:file.name.replace(/\.[^.]+$/,"").toLowerCase(),image,points:clone(reference)});
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
    const viewport=viewports[index].current;
    if(event.type==="pointerdown" && spaceHeld && viewport){panning.current={x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,index};event.currentTarget.setPointerCapture(event.pointerId);return;}
    if(event.type==="pointermove" && panning.current?.index===index && viewport){viewport.scrollLeft=panning.current.left-(event.clientX-panning.current.x);viewport.scrollTop=panning.current.top-(event.clientY-panning.current.y);return;}
    if((event.type==="pointerup"||event.type==="pointercancel") && panning.current?.index===index){panning.current=null;return;}
    const canvas=canvases[index]?.current,expIndex=index===0?source:target,exp=profile.expressions[expIndex];if(!canvas||!exp)return;
    const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
    if(event.type==="pointerup" || event.type==="pointercancel"){eyeDragging.current=null;dragging.current=null;return;}
    if(event.type==="pointermove" && dragging.current?.expression===expIndex){const {point,edge}=dragging.current;const nx=edge==="left"?0:edge==="right"?1:Math.max(0,Math.min(1,x));const ny=edge==="top"?0:edge==="bottom"?1:Math.max(0,Math.min(1,y));setProfile(p=>({...p,active:false,expressions:p.expressions.map((item,i)=>i===expIndex?{...item,points:item.points.map((v,j)=>j===point?[nx,ny] as Point:v)}:item)}));return;}
    if(event.type==="pointermove" && eyeDragging.current?.expression===expIndex){const {eye}=eyeDragging.current;setProfile(p=>{const name=p.expressions[expIndex]?.name;if(!name)return p;const centers=(p.eyeCenters?.[name]??[[.37,.39],[.63,.39]]).map((v,i)=>i===eye?[Math.max(0,Math.min(1,x)),Math.max(0,Math.min(1,y))] as Point:v);return {...p,active:false,eyeCenters:{...p.eyeCenters,[name]:centers}};});return;}
    if(event.type!=="pointerdown")return;
    if(addingPoint){addMeshPoint(expIndex,x,y);return;}
    // Select the nearest vertex in screen pixels, independent of triangle winding or intersections.
    let closest=12,point=-1;
    exp.points.forEach((p,i)=>{const d=Math.hypot((p[0]-x)*rect.width,(p[1]-y)*rect.height);if(d<closest){closest=d;point=i;}});
    if(point>=0){const p=exp.points[point]!;const edge=p[0]===0?"left":p[0]===1?"right":p[1]===0?"top":p[1]===1?"bottom":null;dragging.current={expression:expIndex,point,edge};canvas.setPointerCapture(event.pointerId);return;}
    if(profile.eyeEnabled && profile.eyeGuides){const centers=profile.eyeCenters?.[exp.name]??[[.37,.39],[.63,.39]];const eye=centers.findIndex(p=>Math.hypot((p[0]-x)*rect.width,(p[1]-y)*rect.height)<14);if(eye>=0){eyeDragging.current={expression:expIndex,eye};canvas.setPointerCapture(event.pointerId);}}

  }
  useEffect(()=>{if(!playing)return;let frame=0;let last=0;let progress=mix/100;let direction=1;const tick=(now:number)=>{if(last){progress+=direction*(now-last)/1800;if(progress>=1){progress=1;direction=-1;}if(progress<=0){progress=0;direction=1;}setMix(Math.round(progress*100));}last=now;frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[playing]);
  useEffect(()=>{const down=(e:KeyboardEvent)=>{if(e.code==="Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLSelectElement)){e.preventDefault();setSpaceHeld(true);}};const up=(e:KeyboardEvent)=>{if(e.code==="Space")setSpaceHeld(false);};window.addEventListener("keydown",down);window.addEventListener("keyup",up);return()=>{window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);};},[]);
  useEffect(()=>{const nodes=canvases.map(ref=>ref.current).filter((node):node is HTMLCanvasElement=>Boolean(node));const onWheel=(event:WheelEvent)=>{if(!event.ctrlKey)return;event.preventDefault();setZoom(value=>Math.max(100,Math.min(400,value+(event.deltaY<0?25:-25))));};nodes.forEach(node=>node.addEventListener("wheel",onWheel,{passive:false}));return()=>nodes.forEach(node=>node.removeEventListener("wheel",onWheel));},[profile.expressions.length]);
  const choices=profile.expressions.map((item,i)=><option key={i} value={i}>{item.name}</option>);
  return <section className="setup-field" style={{marginTop:20,padding:16,border:"1px solid var(--sb-border, #566)",borderRadius:12}}>

    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}><button type="button" onClick={()=>imageFileRef.current?.click()}>Upload more images</button><button type="button" onClick={()=>meshFileRef.current?.click()}>Import JSON</button><button type="button" onClick={()=>{const blob=new Blob([JSON.stringify(profile)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="morph-profile.json";a.click();URL.revokeObjectURL(url);}}>Export JSON</button></div>
    <input ref={meshFileRef} style={{display:"none"}} type="file" accept=".json,application/json" aria-label="Import Morph Studio mesh JSON" onChange={e=>{void importMesh(e.target.files?.[0]??null);e.target.value="";}}/>
    <input ref={imageFileRef} style={{display:"none"}} type="file" multiple accept="image/*" aria-label="Add expression images" onChange={e=>{void addFiles(e.target.files).catch(()=>setMessage("Could not load images."));e.target.value="";}}/>
    {profile.expressions.length>=2 && <>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
        <button type="button" onClick={()=>setShowMesh(v=>!v)}>{showMesh?"Hide mesh":"Show mesh"}</button>
        <button type="button" aria-pressed={addingPoint} onClick={()=>setAddingPoint(v=>!v)}>{addingPoint?"Cancel point":"Add mesh point"}</button>
        <button type="button" onClick={()=>setZoom(v=>Math.max(100,v-25))}>−</button><span>{zoom}%</span><button type="button" onClick={()=>setZoom(v=>Math.min(400,v+25))}>+</button>
        <button type="button" onClick={()=>setZoom(100)}>Fit</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:12}}>
        {canvases.map((ref,i)=><div key={i} ref={viewports[i]} style={{overflow:"auto",maxHeight:"65vh",border:"1px solid #596478",borderRadius:8}}>
          <canvas ref={ref} width={252} height={282} aria-label={["Source mesh","Target mesh","Morph preview"][i]} style={{display:"block",width:`calc(min(100%, 51vh) * ${zoom / 100})`,maxWidth:"none",height:"auto",touchAction:"none",cursor:spaceHeld?"grab":"crosshair"}} onPointerDown={i<2?e=>movePoint(e,i):undefined} onPointerMove={i<2?e=>movePoint(e,i):undefined} onPointerUp={i<2?e=>movePoint(e,i):undefined} onPointerCancel={i<2?e=>movePoint(e,i):undefined}/>
          {i<2 && <div style={{display:"flex",justifyContent:"center",gap:8,alignItems:"center",padding:8}}><button type="button" onClick={()=>i===0?setSource((source+profile.expressions.length-1)%profile.expressions.length):setTarget((target+profile.expressions.length-1)%profile.expressions.length)}>‹</button><select aria-label={i===0?"From":"To"} value={i===0?source:target} onChange={e=>i===0?setSource(Number(e.target.value)):setTarget(Number(e.target.value))}>{choices}</select><button type="button" onClick={()=>i===0?setSource((source+1)%profile.expressions.length):setTarget((target+1)%profile.expressions.length)}>›</button></div>}
        </div>)}
      </div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:12}}><button type="button" onClick={()=>setPlaying(v=>!v)}>{playing?"Pause":"Play ↔"}</button>
        <label><input type="checkbox" checked={profile.eyeEnabled??false} onChange={e=>setProfile(p=>({...p,eyeEnabled:e.target.checked}))}/> Eye correction</label>
        <label><input type="checkbox" checked={profile.eyeGuides??true} onChange={e=>setProfile(p=>({...p,eyeGuides:e.target.checked}))}/> Show eye regions</label>
        <label>Eye width <input type="range" min={10} max={50} value={profile.eyeWidth??25} onChange={e=>setProfile(p=>({...p,eyeWidth:Number(e.target.value)}))}/>{profile.eyeWidth??25}px</label>
        <label>Eye height <input type="range" min={5} max={35} value={profile.eyeHeight??14} onChange={e=>setProfile(p=>({...p,eyeHeight:Number(e.target.value)}))}/>{profile.eyeHeight??14}px</label>
        <label>Eye strength <input type="range" min={0} max={100} value={profile.eyeStrength??80} onChange={e=>setProfile(p=>({...p,eyeStrength:Number(e.target.value)}))}/>{profile.eyeStrength??80}%</label>
        <label>Eye transition midpoint <input type="range" min={0} max={100} value={profile.eyeMidpoint ?? 50} onChange={e=>setProfile(p=>({...p,active:false,eyeMidpoint:Number(e.target.value)}))}/></label>
        <label>Eye transition duration <input type="range" min={5} max={100} value={profile.eyeDuration ?? 30} onChange={e=>setProfile(p=>({...p,active:false,eyeDuration:Number(e.target.value)}))}/></label>
      </div>
      <label style={{display:"block",marginTop:12}}>Transition {mix}% <input type="range" min={0} max={100} value={mix} onChange={e=>setMix(Number(e.target.value))}/></label>
    </>}
    <div style={{display:"flex",gap:8,marginTop:12}}>
      <button type="button" onClick={()=>void save(false)}>Save draft</button>
      <button type="button" disabled={profile.expressions.length<2} onClick={()=>void save(true)}>Save profile</button>
    </div>
    {message && <p role="status">{message}</p>}
  </section>;
}
