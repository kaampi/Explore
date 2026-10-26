import { useEffect, useRef, useState } from "react";

/** Character-scoped, local-first morph authoring. Experimental: activation is not yet wired to chat. */
type Point = [number, number];
type Expression = { name: string; image: string; points: Point[] };
type Profile = { version: 1; active: boolean; expressions: Expression[] };
const initial: Point[] = [[0,0],[.5,0],[1,0],[0,.5],[.25,.25],[.5,.25],[.75,.25],[1,.5],[.25,.5],[.5,.5],[.75,.5],[.25,.75],[.5,.75],[.75,.75],[0,1],[.5,1],[1,1]];
const triangles: number[][] = [[0,1,4],[1,5,4],[1,2,6],[1,6,5],[0,4,3],[3,4,8],[4,5,9],[4,9,8],[5,6,10],[5,10,9],[6,2,7],[6,7,10],[3,8,14],[8,11,14],[8,9,12],[8,12,11],[9,10,13],[9,13,12],[10,7,16],[10,16,13],[11,12,15],[11,15,14],[12,13,16],[12,16,15]];
const clone = (points: Point[]) => points.map(([x,y]) => [x,y] as Point);
function load(key: string): Profile {
  try { const value = JSON.parse(localStorage.getItem(key) || "null") as Profile | null; if (value?.version === 1 && Array.isArray(value.expressions)) return value; } catch { /* invalid local draft */ }
  return { version: 1, active: false, expressions: [] };
}
function drawImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  ctx.drawImage(image, 0, 0, width, height);
}
function warpTriangle(ctx: CanvasRenderingContext2D, image: HTMLImageElement, source: Point[], target: Point[], width: number, height: number) {
  const [a,b,c] = source.map(p => [p[0]*width,p[1]*height]);
  const [d,e,f] = target.map(p => [p[0]*width,p[1]*height]);
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
export function MorphStudio({ characterId }: { characterId: string }) {
  const key = "sandboxai:morph:"+characterId;
  const [profile,setProfile] = useState<Profile>(() => load(key));
  const [source,setSource] = useState(0);
  const [target,setTarget] = useState(1);
  const [mix,setMix] = useState(50);
  const [zoom,setZoom] = useState(100);
  const [editing,setEditing] = useState(false);
  const [message,setMessage] = useState("");
  const canvases = [useRef<HTMLCanvasElement>(null),useRef<HTMLCanvasElement>(null),useRef<HTMLCanvasElement>(null)];
  const dragging = useRef<{ expression: number; point: number } | null>(null);
  useEffect(() => { setProfile(load(key));setSource(0);setTarget(1); }, [key]);
  useEffect(() => {
    let cancelled=false;
    const images=profile.expressions.map(item => { const img=new Image();img.src=item.image;return img; });
    const render=()=> {
      if(cancelled || images.some(img=>!img.complete || !img.naturalWidth))return;
      const a=profile.expressions[source],b=profile.expressions[target];
      if(!a || !b)return;
      [source,target].forEach((index,k)=>{
        const canvas=canvases[k].current, img=images[index],exp=profile.expressions[index];
        if(!canvas || !img || !exp)return;
        const ctx=canvas.getContext("2d");if(!ctx)return;
        ctx.clearRect(0,0,canvas.width,canvas.height);drawImage(ctx,img,canvas.width,canvas.height);
        ctx.strokeStyle="#29d8df";ctx.lineWidth=1;
        for(const tri of triangles){const p=tri.map(i=>exp.points[i]);if(p.some(v=>!v))continue;ctx.beginPath();ctx.moveTo(p[0]![0]*canvas.width,p[0]![1]*canvas.height);for(let j=1;j<3;j++)ctx.lineTo(p[j]![0]*canvas.width,p[j]![1]*canvas.height);ctx.closePath();ctx.stroke();}
        for(const p of exp.points){ctx.beginPath();ctx.arc(p[0]*canvas.width,p[1]*canvas.height,3,0,Math.PI*2);ctx.fillStyle="#29d8df";ctx.fill();}
      });
      const canvas=canvases[2].current,ctx=canvas?.getContext("2d");
      if(!canvas || !ctx)return;
      const t=mix/100, blended=a.points.map((p,i)=>[p[0]*(1-t)+b.points[i]![0]*t,p[1]*(1-t)+b.points[i]![1]*t] as Point);
      const layers=[document.createElement("canvas"),document.createElement("canvas")];
      for(let k=0;k<2;k++){const layer=layers[k]!;layer.width=canvas.width;layer.height=canvas.height;const context=layer.getContext("2d");if(!context)continue;const exp=k===0?a:b;for(const tri of triangles){const src=tri.map(i=>exp.points[i]!),dst=tri.map(i=>blended[i]!);warpTriangle(context,images[k===0?source:target]!,src,dst,canvas.width,canvas.height);}}
      ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(layers[0]!,0,0);ctx.globalAlpha=t;ctx.drawImage(layers[1]!,0,0);ctx.globalAlpha=1;
    };
    images.forEach(img=>img.addEventListener("load",render));render();
    return ()=>{cancelled=true;images.forEach(img=>img.removeEventListener("load",render));};
  },[profile,source,target,mix]);
  function save(active: boolean) { const next={...profile,active};try{localStorage.setItem(key,JSON.stringify(next));setProfile(next);setMessage(active?"Profile saved as active (chat playback not connected yet).":"Draft saved locally.");}catch{setMessage("Could not save profile. Browser storage may be full.");} }
  async function addFiles(files: FileList | null) {
    if(!files)return;
    const items:Expression[]=[];
    for(const file of Array.from(files).filter(f=>f.type.startsWith("image/"))) {
      const image=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Image read failed"));reader.readAsDataURL(file);});
      items.push({name:file.name.replace(/\.[^.]+$/,""),image,points:clone(initial)});
    }
    setProfile(p=>({...p,active:false,expressions:[...p.expressions,...items]}));
    setMessage("Images added. Save to retain changes.");
  }
  function movePoint(event: React.PointerEvent<HTMLCanvasElement>,index:number) {
    const canvas=canvases[index].current,expIndex=index===0?source:target,exp=profile.expressions[expIndex];if(!canvas||!exp)return;
    const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
    if(event.type==="pointerdown"){let best=.04,point=-1;exp.points.forEach((p,i)=>{const d=Math.hypot(p[0]-x,p[1]-y);if(d<best){best=d;point=i;}});if(point>=0){dragging.current={expression:expIndex,point};canvas.setPointerCapture(event.pointerId);}}
    if(event.type==="pointermove" && dragging.current?.expression===expIndex){const {point}=dragging.current;setProfile(p=>({...p,active:false,expressions:p.expressions.map((item,i)=>i===expIndex?{...item,points:item.points.map((v,j)=>j===point?[Math.max(0,Math.min(1,x)),Math.max(0,Math.min(1,y))] as Point:v)}:item)}));}
    if(event.type==="pointerup" || event.type==="pointercancel")dragging.current=null;
  }
  const choices=profile.expressions.map((item,i)=><option key={i} value={i}>{item.name}</option>);
  return <section className="setup-field" style={{marginTop:20,padding:16,border:"1px solid var(--sb-border, #566)",borderRadius:12}}>
    <h3>Morph Studio <small style={{fontWeight:400}}>· experimental</small></h3>
    <p>Attach expressions, adjust matching mesh points, preview transitions and save a character-specific profile. Chat playback is not connected yet.</p>
    <input type="file" multiple accept="image/*" aria-label="Add expression images" onChange={e=>{void addFiles(e.target.files).catch(()=>setMessage("Could not load images."));e.target.value="";}}/>
    {profile.expressions.length>=2 && <>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",margin:"12px 0"}}>
        <label>From <select value={source} onChange={e=>setSource(Number(e.target.value))}>{choices}</select></label>
        <button type="button" onClick={()=>setSource((source+profile.expressions.length-1)%profile.expressions.length)}>‹</button>
        <button type="button" onClick={()=>setSource((source+1)%profile.expressions.length)}>›</button>
        <button type="button" onClick={()=>{setSource(target);setTarget(source);}}>⇄</button>
        <label>To <select value={target} onChange={e=>setTarget(Number(e.target.value))}>{choices}</select></label>
        <button type="button" onClick={()=>setTarget((target+profile.expressions.length-1)%profile.expressions.length)}>‹</button>
        <button type="button" onClick={()=>setTarget((target+1)%profile.expressions.length)}>›</button>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
        <button type="button" onClick={()=>setZoom(v=>Math.max(100,v-25))}>−</button><span>{zoom}%</span><button type="button" onClick={()=>setZoom(v=>Math.min(400,v+25))}>+</button>
        <button type="button" onClick={()=>setZoom(100)}>Fit</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:12}}>
        {canvases.map((ref,i)=><div key={i} style={{overflow:"auto",maxHeight:460,border:"1px solid #596478",borderRadius:8}}>
          <canvas ref={ref} width={252} height={282} aria-label={["Source mesh","Target mesh","Morph preview"][i]} style={{display:"block",width:i===2?"100%":zoom+"%",maxWidth:i===2?"100%":"none",touchAction:"none"}} onPointerDown={i<2?e=>movePoint(e,i):undefined} onPointerMove={i<2?e=>movePoint(e,i):undefined} onPointerUp={i<2?e=>movePoint(e,i):undefined} onPointerCancel={i<2?e=>movePoint(e,i):undefined}/>
        </div>)}
      </div>
      <label style={{display:"block",marginTop:12}}>Transition {mix}% <input type="range" min={0} max={100} value={mix} onChange={e=>setMix(Number(e.target.value))}/></label>
    </>}
    <div style={{display:"flex",gap:8,marginTop:12}}>
      <button type="button" onClick={()=>save(false)}>Save draft</button>
      <button type="button" disabled={profile.expressions.length<2} onClick={()=>save(true)}>Save profile</button>
      <button type="button" onClick={()=>{const blob=new Blob([JSON.stringify(profile)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="morph-profile.json";a.click();URL.revokeObjectURL(url);}}>Export JSON</button>
    </div>
    {message && <p role="status">{message}</p>}
  </section>;
}
