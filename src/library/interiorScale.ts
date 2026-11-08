import { z } from 'zod';
import type { MapNode } from './worldMap';
import type { XY } from './mapShapes';
import { interiorFurniture } from './interiorFurniture';

export const InteriorSizeSchema=z.object({width:z.number().finite().min(2).max(500),depth:z.number().finite().min(2).max(500)});
export const FurnitureSizeSchema=z.object({width:z.number().finite().min(.1).max(20),depth:z.number().finite().min(.1).max(20)});
export type MetreSize=z.infer<typeof InteriorSizeSchema>;
/** Authored starter estimates, editable by the world builder. They are not inferred from a decorative map symbol. */
export const DEFAULT_HOUSE_SIZES:Record<string,MetreSize>={cottage:{width:8,depth:7},longhouse:{width:16,depth:10},townhouse:{width:7,depth:10},inn:{width:16,depth:12}};
export function houseSizeMeters(building:MapNode):MetreSize{return {...(building.interior?.sizeMeters??DEFAULT_HOUSE_SIZES[building.symbol??'']??{width:10,depth:8})};}
export function furnitureSizeMeters(node: Pick<MapNode, 'furnitureType' | 'furnitureSizeMeters'>) {
  // Older chair nodes could be saved without an explicit footprint.
  const legacy = node.furnitureType === 'chair' ? { width: 0.5, depth: 0.5 } : interiorFurniture[node.furnitureType ?? 'table'];
  const { width, depth } = node.furnitureSizeMeters ?? legacy;
  return { width, depth };
}
export function interiorScale(building:MapNode){
 const p=building.interior?.outline??[{x:10,y:10},{x:90,y:90}],left=Math.min(...p.map(v=>v.x)),right=Math.max(...p.map(v=>v.x)),top=Math.min(...p.map(v=>v.y)),bottom=Math.max(...p.map(v=>v.y)),size=houseSizeMeters(building);
 const spanX=Math.max(.001,right-left),spanY=Math.max(.001,bottom-top),metresPerUnitX=size.width/spanX,metresPerUnitY=size.depth/spanY,pxPerMetreX=8/metresPerUnitX,pxPerMetreY=6/metresPerUnitY;
 const aspect=(size.width/size.depth)/(spanX*8/(spanY*6)),scaleX=Math.min(1,aspect),scaleY=Math.min(1,1/aspect);
 return {size,left,top,spanX,spanY,metresPerUnitX,metresPerUnitY,pxPerMetreX,pxPerMetreY,scaleX,scaleY};
}
export function furnitureFootprint(building:MapNode,node:Pick<MapNode,'furnitureType'|'furnitureSizeMeters'|'interiorPosition'|'rotation'>):XY[]{
 const m=interiorScale(building),s=furnitureSizeMeters(node),p=node.interiorPosition??{x:50,y:50},r=(node.rotation??0)*Math.PI/180,c=Math.cos(r),sin=Math.sin(r);
 return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>{const a=x!*s.width/2,b=y!*s.depth/2;return {x:p.x+(a*c-b*sin)/m.metresPerUnitX,y:p.y+(a*sin+b*c)/m.metresPerUnitY};});
}
export function roomAreaMeters(building:MapNode,room:MapNode){const p=room.roomPolygon??[],m=interiorScale(building);return Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length]!;return sum+a.x*b.y-b.x*a.y;},0)/2)*m.metresPerUnitX*m.metresPerUnitY;}
export function openingWidthMeters(opening:{kind:'door'|'window';widthMeters?:number|undefined}){return opening.widthMeters??(opening.kind==='door'?.9:1.2);}
export function openingAngle(building:MapNode,edge:{a:XY;b:XY}){const m=interiorScale(building);return Math.atan2((edge.b.y-edge.a.y)*m.metresPerUnitY,(edge.b.x-edge.a.x)*m.metresPerUnitX)*180/Math.PI;}
export function physicalDistance(building:MapNode,a:XY,b:XY){const m=interiorScale(building);return Math.hypot((a.x-b.x)*m.metresPerUnitX,(a.y-b.y)*m.metresPerUnitY);}
