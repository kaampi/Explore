import { brushContains } from "./forestBrush";
import type { WorldMap,MapNode } from "./worldMap";
import { curvePoint,rectanglePoints,type XY } from "./mapShapes";
import { mapPosition } from "./mapGeometry";
import { routePoints } from "./mapRoutes";
function polygon(n:MapNode):XY[]{const points=n.shape??rectanglePoints(),result:XY[]=[];for(let i=0;i<points.length;i++)for(let j=0;j<24;j++)result.push(mapPosition(n,curvePoint(points[i]!,points[(i+1)%points.length]!,j/24)));return result;}
function inside(p:XY,poly:XY[]):boolean{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i]!,b=poly[j]!;if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;}
function cut(a:XY,b:XY,c:XY,d:XY):number|undefined{const x=b.x-a.x,y=b.y-a.y,u=d.x-c.x,v=d.y-c.y,den=x*v-y*u;if(Math.abs(den)<1e-10)return;const t=((c.x-a.x)*v-(c.y-a.y)*u)/den,q=((c.x-a.x)*y-(c.y-a.y)*x)/den;if(t>0&&t<1&&q>=0&&q<=1)return t;return;}
export function terrainTravel(map:WorldMap,route:WorldMap["routes"][number],a:MapNode,b:MapNode):{cells:number;weightedCells:number;blocked:boolean}{
 const points=routePoints(route,a,b);const areas=route.ignoreTerrain?[]:map.nodes.filter(n=>n.isArea&&n.parentId&&map.nodes.find(p=>p.id===n.parentId)?.parentId===a.parentId).map(n=>({node:n,poly:polygon(n),parent:polygon(map.nodes.find(p=>p.id===n.parentId)!)}));
 let cells=0,weightedCells=0,blocked=false;
 for(let i=0;i<points.length-1;i++){let previous=points[i]!;for(let j=1;j<=64;j++){const current=curvePoint(points[i]!,points[i+1]!,j/64),start={x:previous.x*8,y:previous.y*6},end={x:current.x*8,y:current.y*6},cuts=[0,1];for(const area of areas)for(const poly of [area.poly,area.parent])for(let k=0;k<poly.length;k++){const t=cut(start,end,poly[k]!,poly[(k+1)%poly.length]!);if(t!==undefined)cuts.push(t);}cuts.sort((a,b)=>a-b);const length=Math.hypot(end.x-start.x,end.y-start.y)/40;cells+=length;for(let k=0;k<cuts.length-1;k++){const t=cuts[k]!,u=cuts[k+1]!,mid={x:start.x+(end.x-start.x)*(t+u)/2,y:start.y+(end.y-start.y)*(t+u)/2};let factor=1;for(const area of areas)if((area.node.brush?brushContains(area.node,mid.x,mid.y):inside(mid,area.poly))&&(map.nodes.find(n=>n.id===area.node.parentId)?.brush?brushContains(map.nodes.find(n=>n.id===area.node.parentId)!,mid.x,mid.y):inside(mid,area.parent))){if(area.node.passage==="blocked")blocked=true;factor=Math.max(factor,area.node.travelMultiplier??(area.node.passage==="difficult"?2:1));}weightedCells+=length*(u-t)*factor;}previous=current;}}

 return {cells,weightedCells,blocked};
}
