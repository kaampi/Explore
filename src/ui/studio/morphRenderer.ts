import { originalPoints, originalTriangles } from "./originalMorphMesh";
export function morphLoopStep(elapsed: number, count: number, durations?: number[]) {
  if (count < 1) return { source: 0, target: 0, mix: 0 };
  if (durations?.length === count) {
    const times = durations.map(value => Number.isFinite(value) ? Math.max(300, Math.min(6000, value)) : 1800);
    const total = times.reduce((sum, time) => sum + 3000 + time, 0);
    let remaining = Math.max(0, elapsed) % total;
    for (let source = 0; source < count; source++) {
      const duration = times[source]!;
      if (remaining < 3000 + duration) {
        const progress = Math.max(0, (remaining - 3000) / duration);
        return { source, target: (source + 1) % count, mix: progress };
      }
      remaining -= 3000 + duration;
    }
  }
  const source = Math.floor(elapsed / 4000) % count;
  const progress = Math.max(0, (elapsed % 4000 - 3000) / 1000);
  return { source, target: (source + 1) % count, mix: progress };
}
export type Point = [number, number];
export type Expression = { name: string; image: string; points: Point[] };
export type Profile = { version: 1; active: boolean; expressions: Expression[]; triangles?: number[][]; morphDurations?: Record<string, number>; eyeMidpoint?: number; eyeDuration?: number; eyeEnabled?: boolean; eyeCorrections?: Record<string, boolean>; eyeWidth?: number; eyeHeight?: number; eyeStrength?: number; eyeGuides?: boolean; eyeCenters?: Record<string, Point[]> };

const GRID_COLS = 7;
const GRID_ROWS = 9;
const initial: Point[] = originalPoints("shy");
const triangles: number[][] = Array.from({length:(GRID_ROWS-1)*(GRID_COLS-1)},(_,cell)=>{const x=cell%(GRID_COLS-1),y=Math.floor(cell/(GRID_COLS-1)),a=y*GRID_COLS+x,b=a+1,c=a+GRID_COLS,d=c+1;return [[a,b,c],[b,d,c]];}).flat();
const legacyTriangles: number[][] = [[0,1,4],[1,5,4],[1,2,6],[1,6,5],[0,4,3],[3,4,8],[4,5,9],[4,9,8],[5,6,10],[5,10,9],[6,2,7],[6,7,10],[3,8,14],[8,11,14],[8,9,12],[8,12,11],[9,10,13],[9,13,12],[10,7,16],[10,16,13],[11,12,15],[11,15,14],[12,13,16],[12,16,15]];

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

export function profileTriangles(profile: Profile) { return profile.triangles ?? (profile.expressions[0]?.points.length === 17 ? legacyTriangles : profile.expressions[0]?.points.length === 57 ? originalTriangles : triangles); }
export function renderMorphFrame(canvas: HTMLCanvasElement, profile: Profile, images: HTMLImageElement[], source: number, target: number, t: number) {
const ctx=canvas.getContext("2d"), a=profile.expressions[source], b=profile.expressions[target];
if(!ctx || !a || !b || a.points.length !== b.points.length || !images[source]?.naturalWidth || !images[target]?.naturalWidth)return;
const meshTriangles=profileTriangles(profile);
if(meshTriangles.some(tri=>tri.length!==3 || tri.some(index=>!a.points[index] || !b.points[index])))return;
const eyeCorrectionActive=profile.eyeCorrections?.[JSON.stringify([a.name,b.name])] ?? (profile.eyeCorrections ? false : (profile.eyeEnabled ?? false));
      const blended=a.points.map((p,i)=>[p[0]*(1-t)+b.points[i]![0]*t,p[1]*(1-t)+b.points[i]![1]*t] as Point);
      const layers=[document.createElement("canvas"),document.createElement("canvas")];
      for(let k=0;k<2;k++){const layer=layers[k]!;layer.width=canvas.width;layer.height=canvas.height;const context=layer.getContext("2d");if(!context)continue;const exp=k===0?a:b;for(const tri of meshTriangles){const src=tri.map(i=>exp.points[i]!),dst=tri.map(i=>blended[i]!);warpTriangle(context,images[k===0?source:target]!,src,dst,canvas.width,canvas.height);}}
      ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(layers[0]!,0,0);ctx.globalAlpha=t;ctx.drawImage(layers[1]!,0,0);ctx.globalAlpha=1;
      // Accelerate texture crossfade in a soft eye-region mask to reduce ghosted eyelids.
      const duration=Math.max(.05,(profile.eyeDuration ?? 30)/100);
      const midpoint=(profile.eyeMidpoint ?? 50)/100;
      const eyeT=Math.max(0,Math.min(1,(t-(midpoint-duration/2))/duration));
      if(eyeCorrectionActive && (profile.eyeStrength??80)>0 && Math.abs(eyeT-t)>.001){
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
}
