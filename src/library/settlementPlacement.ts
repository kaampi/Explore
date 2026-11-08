import type { MapNode,WorldMap } from './worldMap';
import { mapPosition } from './mapGeometry';
import { areaContains } from './routeSketch';
import { settlementWorldContext } from './settlementContext';

const isWater=(n:MapNode)=>['lake','river','sea','ocean'].includes(n.kind.toLowerCase());
/** Validate semantic geography, not background visibility or decorative symbol pixels. */
export function settlementPlacementIssue(map:WorldMap,level:string,node:MapNode):string|null{
 if(node.placementRule!=='shoreline')return null;
 const local=map.nodes.filter(n=>(n.parentId??'')===level&&isWater(n)),context=settlementWorldContext(map,level),water=context?.terrain.filter(isWater)??[];
 let wet=false,dry=false;
 for(let x=0;x<=8;x++)for(let y=0;y<=8;y++){
  const at=mapPosition(node,{x:x/8,y:y/8}),p={x:at.x/8,y:at.y/6},onLocalWater=local.some(n=>areaContains(n,p));
  const parent=context?{x:(at.x-context.x)/context.scale/8,y:(at.y-context.y)/context.scale/6}:null;
  const hit=onLocalWater||Boolean(parent&&water.some(n=>areaContains(n,parent)));
  if(hit)wet=true;else dry=true;if(wet&&dry)return null;
 }
 return wet?'Place docks at the shoreline, with contact to both land and water.':'Docks need water contact. Move them to the edge of a lake, river or sea.';
}
