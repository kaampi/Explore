import { curvePoint,type ShapePoint,type XY } from './mapShapes';

const dot=(a:XY,b:XY)=>a.x*b.x+a.y*b.y;
const sub=(a:XY,b:XY):XY=>({x:a.x-b.x,y:a.y-b.y});
const unit=(a:XY):XY=>{const length=Math.hypot(a.x,a.y)||1;return {x:a.x/length,y:a.y/length};};
function segmentDistance(p:XY,a:XY,b:XY){const ab=sub(b,a),t=Math.max(0,Math.min(1,dot(sub(p,a),ab)/(dot(ab,ab)||1)));return Math.hypot(p.x-a.x-ab.x*t,p.y-a.y-ab.y*t);}
type Cubic=[XY,XY,XY,XY];
const at=(c:Cubic,t:number)=>curvePoint({...c[0],outgoing:c[1]},{...c[3],incoming:c[2]},t);

/** Flatten in map pixels, rather than using a fixed sample count that misses tight bends. */
function flatten(c:Cubic,out:XY[],depth=0){
 if(out.length>8192)return;
 if(depth>=12||Math.max(segmentDistance(c[1],c[0],c[3]),segmentDistance(c[2],c[0],c[3]))<=.2){out.push(c[3]);return;}
 const half=(a:XY,b:XY):XY=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2}),a=half(c[0],c[1]),b=half(c[1],c[2]),d=half(c[2],c[3]),e=half(a,b),f=half(b,d),m=half(e,f);
 flatten([c[0],a,e,m],out,depth+1);flatten([m,f,d,c[3]],out,depth+1);
}

function parameters(data:XY[]){const u=[0];for(let i=1;i<data.length;i++)u.push(u[i-1]!+Math.hypot(data[i]!.x-data[i-1]!.x,data[i]!.y-data[i-1]!.y));const total=u.at(-1)||1;return u.map(v=>v/total);}
function fit(data:XY[],u:number[],left:XY,right:XY):Cubic{
 const start=data[0]!,end=data.at(-1)!;let c00=0,c01=0,c11=0,x0=0,x1=0;
 for(let i=0;i<data.length;i++){
  const t=u[i]!,v=1-t,b0=v*v*v,b1=3*v*v*t,b2=3*v*t*t,b3=t*t*t;
  const a={x:left.x*b1,y:left.y*b1},b={x:right.x*b2,y:right.y*b2},residual={x:data[i]!.x-start.x*(b0+b1)-end.x*(b2+b3),y:data[i]!.y-start.y*(b0+b1)-end.y*(b2+b3)};
  c00+=dot(a,a);c01+=dot(a,b);c11+=dot(b,b);x0+=dot(a,residual);x1+=dot(b,residual);
 }
 const determinant=c00*c11-c01*c01,length=data.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-data[i]!.x,p.y-data[i]!.y),0);
 let a=(x0*c11-x1*c01)/determinant,b=(c00*x1-c01*x0)/determinant;
 if(!Number.isFinite(a)||!Number.isFinite(b)||a<1e-6||b<1e-6||a>length*2||b>length*2)a=b=Math.hypot(end.x-start.x,end.y-start.y)/3;
 return [start,{x:start.x+left.x*a,y:start.y+left.y*a},{x:end.x+right.x*b,y:end.y+right.y*b},end];
}
function reparameterize(data:XY[],u:number[],c:Cubic){
 const next=u.map((t,i)=>{
  if(!i||i===data.length-1)return t;
  const v=1-t,p=at(c,t),d={x:3*(v*v*(c[1].x-c[0].x)+2*v*t*(c[2].x-c[1].x)+t*t*(c[3].x-c[2].x)),y:3*(v*v*(c[1].y-c[0].y)+2*v*t*(c[2].y-c[1].y)+t*t*(c[3].y-c[2].y))};
  const dd={x:6*(v*(c[2].x-2*c[1].x+c[0].x)+t*(c[3].x-2*c[2].x+c[1].x)),y:6*(v*(c[2].y-2*c[1].y+c[0].y)+t*(c[3].y-2*c[2].y+c[1].y))},r=sub(p,data[i]!),denominator=dot(d,d)+dot(r,dd);
  return Math.max(0,Math.min(1,t-(Math.abs(denominator)>1e-9?dot(r,d)/denominator:0)));
 });
 return next.every((t,i)=>!i||t>next[i-1]!)?next:null;
}

/** Fit a few cubic curves within a visual error budget. Endpoints and graph nodes are never removed. */
export function simplifyRoute(points:ShapePoint[],tolerance=3):ShapePoint[]{
 if(points.length<=2)return structuredClone(points);
 if(!Number.isFinite(tolerance)||tolerance<=.4)throw Error('Choose a positive simplification tolerance above 0.4 pixels.');
 const pixel=(p:XY):XY=>({x:p.x*8,y:p.y*6}),data:XY[]=[pixel(points[0]!)];
 for(let i=1;i<points.length;i++){
  const a=points[i-1]!,b=points[i]!;
  if(a.outgoing||b.incoming)flatten([pixel(a),pixel(a.outgoing??a),pixel(b.incoming??b),pixel(b)],data);
  else data.push(pixel(b));
  if(data.length>8192)return structuredClone(points);
 }
 const samples=data.filter((p,i)=>!i||Math.hypot(p.x-data[i-1]!.x,p.y-data[i-1]!.y)>1e-8);
 if(samples.length<2)return structuredClone(points);
 const curves:Cubic[]=[],error=tolerance-.4;
 function recurse(part:XY[],left:XY,right:XY,depth=0){
  if(part.length===2){const a=part[0]!,b=part[1]!;curves.push([a,a,b,b]);return;}
  const start=part[0]!,end=part.at(-1)!,axis=sub(end,start),lengthSquared=dot(axis,axis);let previous=-Infinity;
  if(lengthSquared>1e-8&&part.every(p=>{const along=dot(sub(p,start),axis)/lengthSquared,ordered=along>=previous-1e-8;previous=along;return ordered&&segmentDistance(p,start,end)<=error;})){curves.push([start,start,end,end]);return;}
  let u=parameters(part),curve=fit(part,u,left,right),worst=Infinity,split=Math.floor(part.length/2);
  for(let iteration=0;iteration<5;iteration++){
   worst=0;for(let i=1;i<part.length-1;i++){const p=at(curve,u[i]!),gap=Math.hypot(p.x-part[i]!.x,p.y-part[i]!.y);if(gap>worst){worst=gap;split=i;}}
   if(worst<=error)break;
   if(iteration===4)break;
   const next=reparameterize(part,u,curve);if(!next)break;u=next;curve=fit(part,u,left,right);
  }
  // Check the other direction too: a fitted curve must not shortcut a turn or grow a loop between samples.
  if(worst<=error){const fitted:XY[]=[curve[0]];flatten(curve,fitted);for(const p of fitted){let gap=Infinity,index=1;for(let i=1;i<part.length;i++){const d=segmentDistance(p,part[i-1]!,part[i]!);if(d<gap){gap=d;index=i;}}if(gap>worst){worst=gap;split=Math.max(1,Math.min(part.length-2,index));}}}
  if(worst<=error){curves.push(curve);return;}
  if(depth>=24){for(let i=1;i<part.length;i++)curves.push([part[i-1]!,part[i-1]!,part[i]!,part[i]!]);return;}
  const centre=unit(sub(part[split-1]!,part[split+1]!));
  recurse(part.slice(0,split+1),left,centre,depth+1);recurse(part.slice(split),{x:-centre.x,y:-centre.y},right,depth+1);
 }
 recurse(samples,unit(sub(samples[1]!,samples[0]!)),unit(sub(samples.at(-2)!,samples.at(-1)!)));
 if(curves.length+1>=points.length)return structuredClone(points);
 const map=(p:XY):XY=>({x:p.x/8,y:p.y/6});
 const result:ShapePoint[]=[map(curves[0]![0])];
 for(const c of curves){result.at(-1)!.outgoing=map(c[1]);result.push({...map(c[3]),incoming:map(c[2]),mode:'free'});}
 // Preserve the exact authored endpoints, including after duplicate samples were removed.
 result[0]!.x=points[0]!.x;result[0]!.y=points[0]!.y;result.at(-1)!.x=points.at(-1)!.x;result.at(-1)!.y=points.at(-1)!.y;
 return result;
}
