import { memo,useId } from 'react';
import type { MapNode,WorldMap } from '@library/worldMap';
import { settlementWorldContext } from '@library/settlementContext';
import { mapPosition } from '@library/mapGeometry';
import { rectanglePoints,shapePath } from '@library/mapShapes';
import { smoothBrushPath } from '@library/forestBrush';
import { openRoutePath,routePoints } from '@library/mapRoutes';

const outline=(n:MapNode)=>n.brush?smoothBrushPath(n):shapePath(n.shape??rectanglePoints(),p=>mapPosition(n,p));
const Terrain=memo(function Terrain({node,parent}:{node:MapNode;parent?:MapNode}){
 const id=useId().replace(/:/g,''),kind=node.kind.toLowerCase(),water=['river','lake','sea','ocean','rapids','ford','waterfall','calm water'].includes(kind);
 const fill=node.color??(water?'#aacfdc':kind==='forest'||kind==='dense woodland'?'#ccd9bd':kind==='mountain'?'#d8d6cf':kind==='marsh'?'#b7cfc0':'#e8dfc4');
 return <g>{parent&&<defs><clipPath id={id}><path d={outline(parent)} fillRule="evenodd"/></clipPath></defs>}<path data-context-terrain={node.id} d={outline(node)} fill={fill} fillRule="evenodd" clipPath={parent?`url(#${id})`:undefined} stroke={water?'#8fb6c3':'none'} strokeWidth="1" vectorEffect="non-scaling-stroke"/></g>;
});
const Road=memo(function Road({route,a,b}:{route:WorldMap['routes'][number];a:MapNode;b:MapNode}){
 const water=['boat','ferry'].includes(route.type??'');
 return <path data-context-route={route.id} d={openRoutePath(routePoints(route,a,b))} fill="none" stroke={water?'#6897ad':route.type==='bridge'?'#98704f':'#b5a17e'} strokeWidth={route.type==='path'?3:6} strokeDasharray={['path','boat','ferry'].includes(route.type??'')?'5 4':undefined} strokeLinecap="round" vectorEffect="non-scaling-stroke"/>;
});

/** Only geography: no editable handles, destination hit areas or decorative world-scale trees. */
export function SettlementWorldContext({context}:{context:NonNullable<ReturnType<typeof settlementWorldContext>>}){
 const id=useId().replace(/:/g,'');
 return <g aria-label="World map underlay (read-only)" data-world-context={context.settlement.id} pointerEvents="none" aria-hidden="true">
  <defs><clipPath id={id}><rect width="800" height="600"/></clipPath></defs>
  <g clipPath={`url(#${id})`}><g data-context-projection="true" transform={`matrix(${context.scale} 0 0 ${context.scale} ${context.x} ${context.y})`} opacity=".72">
   {context.terrain.map(n=><Terrain key={n.id} node={n} {...(n.isArea&&context.nodes.find(p=>p.id===n.parentId)?{parent:context.nodes.find(p=>p.id===n.parentId)!}:{})}/>)}
   {context.routes.map(r=>{const a=context.nodes.find(n=>n.id===r.from),b=context.nodes.find(n=>n.id===r.to);return a&&b?<Road key={r.id} route={r} a={a} b={b}/>:null;})}
  </g></g>
 </g>;
}
