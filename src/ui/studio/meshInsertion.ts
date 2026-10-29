import type { Point } from "./morphRenderer";
export type MeshInsertion = { point: Point; vertices: number[]; weights: number[]; triangles: number[][]; edge: boolean };
/** Plan in display pixels so snapping feels the same at every zoom level. */
export function planMeshInsertion(points: Point[], triangles: number[][], point: Point, width: number, height: number): MeshInsertion | null {
  const n = points.length;
  if (points.some(p => Math.hypot((p[0]-point[0])*width,(p[1]-point[1])*height) < 6)) return null;
  let nearest: {a:number;b:number;t:number;distance:number} | undefined;
  for (const tri of triangles) for (let j=0;j<3;j++) {
    const a=tri[j]!,b=tri[(j+1)%3]!,p=points[a],q=points[b];
    if (!p || !q) continue;
    const dx=(q[0]-p[0])*width,dy=(q[1]-p[1])*height,den=dx*dx+dy*dy;
    if (!den) continue;
    const t=((point[0]-p[0])*width*dx+(point[1]-p[1])*height*dy)/den;
    if (t<=0 || t>=1) continue;
    const distance=Math.hypot((point[0]-p[0])*width-t*dx,(point[1]-p[1])*height-t*dy);
    if (distance<=8 && (!nearest || distance<nearest.distance)) nearest={a,b,t,distance};
  }
  if (nearest) {
    const {a,b,t}=nearest,p=points[a]!,q=points[b]!;
    const split=triangles.flatMap(tri=>{
      if (!tri.includes(a) || !tri.includes(b)) return [tri];
      const k=tri.findIndex((v,i)=>(v===a && tri[(i+1)%3]===b)||(v===b && tri[(i+1)%3]===a));
      const u=tri[k]!,v=tri[(k+1)%3]!,w=tri[(k+2)%3]!;
      return [[u,n,w],[n,v,w]];
    });
    return {point:[p[0]*(1-t)+q[0]*t,p[1]*(1-t)+q[1]*t],vertices:[a,b],weights:[1-t,t],triangles:split,edge:true};
  }
  for (let k=0;k<triangles.length;k++) {
    const tri=triangles[k]!,a=points[tri[0]!]!,b=points[tri[1]!]!,c=points[tri[2]!]!;
    if (!a || !b || !c) continue;
    const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    if (Math.abs(den)<1e-8) continue;
    const u=((b[1]-c[1])*(point[0]-c[0])+(c[0]-b[0])*(point[1]-c[1]))/den;
    const v=((c[1]-a[1])*(point[0]-c[0])+(a[0]-c[0])*(point[1]-c[1]))/den;
    if (Math.min(u,v,1-u-v)<0) continue;
    return {point,vertices:tri,weights:[u,v,1-u-v],triangles:triangles.filter((_,i)=>i!==k).concat([[tri[0]!,tri[1]!,n],[tri[1]!,tri[2]!,n],[tri[2]!,tri[0]!,n]]),edge:false};
  }
  return null;
}
