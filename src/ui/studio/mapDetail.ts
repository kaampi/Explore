import type { MapNode } from '@library/worldMap';
export function treeDetailOpacity(rank:number,scale:number):number{
 const fraction=Math.max(.40,Math.min(1,.40+(scale-.5)*.60));
 return Math.max(0,Math.min(1,(fraction-rank)/.12));
}
/** Only label placement changes; all places remain present and selectable. */
export function mapLabelIds(nodes:MapNode[],scale:number,selected:string):Set<string>{
 const result=new Set<string>(),boxes:{x:number;y:number;w:number;h:number}[]=[];
 const priority=(n:MapNode)=>n.id===selected?100:['settlement','region'].includes(n.kind.toLowerCase())?80:n.isArea?10:40;
 for(const n of [...nodes].filter(n=>!n.isJunction).sort((a,b)=>priority(b)-priority(a)||a.id.localeCompare(b.id))){
  if(scale<.8&&priority(n)<80)continue;
  const box={x:n.x*8*scale,y:n.y*6*scale,w:Math.min(17,n.name.length)*7+12,h:22};
  if(n.id!==selected&&boxes.some(b=>Math.abs(box.x-b.x)<(box.w+b.w)/2&&Math.abs(box.y-b.y)<(box.h+b.h)/2))continue;
  result.add(n.id);boxes.push(box);
 }return result;
}
