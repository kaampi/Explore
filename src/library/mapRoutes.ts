import { mapPosition } from "./mapGeometry";
import type { MapNode,WorldMap } from "./worldMap";
import { curvePoint,type ShapePoint } from "./mapShapes";
type Route=WorldMap["routes"][number];
export function routePoints(route:Route,a:MapNode,b:MapNode):ShapePoint[]{
 const anchor=(n:MapNode,other:MapNode,point?:{x:number;y:number})=>{
  if(n.settlementMarker)return {x:n.x,y:n.y};
  if(point){const p=mapPosition(n,point);return {x:p.x/8,y:p.y/6};}
  const dx=other.x-n.x,dy=other.y-n.y,t=Math.min(dx?((n.width??15)/2)/Math.abs(dx):Infinity,dy?((n.height??(44/6))/2)/Math.abs(dy):Infinity,1);
  return {x:n.x+dx*t,y:n.y+dy*t};
 };
 const start=anchor(a,b,route.fromAnchor),end=anchor(b,a,route.toAnchor);
 const points:ShapePoint[]=structuredClone(route.geometry??[start,end]);
 for(const [i,p] of [[0,start],[points.length-1,end]] as const){const old=points[i]!;for(const key of ["incoming","outgoing"] as const)if(old[key])old[key]={x:old[key]!.x+p.x-old.x,y:old[key]!.y+p.y-old.y};old.x=p.x;old.y=p.y;}
 return points;
}
export function openRoutePath(points:ShapePoint[]):string{return `M ${points[0]!.x*8} ${points[0]!.y*6} `+points.slice(0,-1).map((a,i)=>{const b=points[i+1]!,c=a.outgoing??a,d=b.incoming??b;return `C ${c.x*8} ${c.y*6} ${d.x*8} ${d.y*6} ${b.x*8} ${b.y*6}`;}).join(' ');}
export function routeLength(points:ShapePoint[]):number{let length=0;for(let i=0;i<points.length-1;i++){let last=points[i]!;for(let j=1;j<=50;j++){const next=curvePoint(points[i]!,points[i+1]!,j/50);length+=Math.hypot((next.x-last.x)*8,(next.y-last.y)*6)/40;last=next;}}return length;}
