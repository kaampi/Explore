export type XY={x:number;y:number};
export type ShapePoint=XY & { mode?:"corner"|"smooth"|"free"|undefined; incoming?:XY | undefined; outgoing?:XY | undefined };
export const rectanglePoints=():ShapePoint[]=>[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
const mix=(a:XY,b:XY,t:number):XY=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export function splitEdge(points:ShapePoint[],index:number,t:number):ShapePoint[]{
 const result=structuredClone(points),a=result[index]!,j=(index+1)%result.length,b=result[j]!;
 const q0=mix(a,a.outgoing??a,t),q1=mix(a.outgoing??a,b.incoming??b,t),q2=mix(b.incoming??b,b,t);
 const r0=mix(q0,q1,t),r1=mix(q1,q2,t),p=mix(r0,r1,t);
 a.outgoing=q0;b.incoming=q2;result.splice(index+1,0,{...p,incoming:r0,outgoing:r1});return result;
}
export function curvePoint(a:ShapePoint,b:ShapePoint,t:number):XY{const u=1-t,c=a.outgoing??a,d=b.incoming??b;return {x:u*u*u*a.x+3*u*u*t*c.x+3*u*t*t*d.x+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*c.y+3*u*t*t*d.y+t*t*t*b.y};}
export function shapePath(points:ShapePoint[],position:(p:XY)=>XY):string{const first=position(points[0]!);return `M ${first.x} ${first.y} `+points.map((a,i)=>{const b=points[(i+1)%points.length]!,c=position(a.outgoing??a),d=position(b.incoming??b),end=position(b);return `C ${c.x} ${c.y} ${d.x} ${d.y} ${end.x} ${end.y}`;}).join(' ')+" Z";}
