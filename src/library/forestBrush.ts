import type { MapNode } from './worldMap';
const cache=new WeakMap<NonNullable<MapNode['brush']>,Uint8Array>();
function grid(node:MapNode){
 const strokes=node.brush??[];const found=cache.get(strokes);if(found)return found;
 const data=new Uint8Array(200*150);
 for(const s of strokes)for(let y=Math.max(0,Math.floor((s.y-s.radius)/4));y<Math.min(150,Math.ceil((s.y+s.radius)/4));y++)for(let x=Math.max(0,Math.floor((s.x-s.radius)/4));x<Math.min(200,Math.ceil((s.x+s.radius)/4));x++)if(Math.hypot(x*4+2-s.x,y*4+2-s.y)<=s.radius)data[y*200+x]=s.erase?0:s.height??1;
 cache.set(strokes,data);return data;
}
export function brushContains(node:MapNode,x:number,y:number):boolean {
 return x>=0&&y>=0&&x<800&&y<600&&(grid(node)[Math.floor(y/4)*200+Math.floor(x/4)]??0)>0;
}
const paths=new WeakMap<NonNullable<MapNode["brush"]>,string>();
export function brushPath(node:MapNode):string {
 if(node.brush&&paths.has(node.brush))return paths.get(node.brush)!;
 let path='';for(let y=2;y<600;y+=4){let start=-1;for(let x=2;x<=802;x+=4){const hit=x<800&&brushContains(node,x,y);if(hit&&start<0)start=x-2;if(!hit&&start>=0){path+=`M${start} ${y-2}h${x-2-start}v4H${start}Z `;start=-1;}}}if(node.brush)paths.set(node.brush,path);return path;
}
export function brushBounds(node:MapNode):Partial<MapNode>{
 const s=(node.brush??[]).filter(s=>!s.erase);if(!s.length)return {};
 const left=Math.max(0,Math.min(...s.map(s=>s.x-s.radius))),right=Math.min(800,Math.max(...s.map(s=>s.x+s.radius))),top=Math.max(0,Math.min(...s.map(s=>s.y-s.radius))),bottom=Math.min(600,Math.max(...s.map(s=>s.y+s.radius)));
 return {x:(left+right)/16,y:(top+bottom)/12,width:Math.min(90,(right-left)/8),height:Math.min(90,(bottom-top)/6)};
}

export function brushHeight(node:MapNode,x:number,y:number):number {return x>=0&&y>=0&&x<800&&y<600?grid(node)[Math.floor(y/4)*200+Math.floor(x/4)]??0:0;}
const smoothPaths=new WeakMap<NonNullable<MapNode['brush']>,string>();
export function smoothBrushPath(node:MapNode):string{
 if(node.brush&&smoothPaths.has(node.brush))return smoothPaths.get(node.brush)!;
 type Point=[number,number];const links=new Map<string,Point[]>(),key=(p:Point)=>p.join(',');
 const add=(a:Point,b:Point)=>{const k=key(a);if(!links.has(k))links.set(k,[]);links.get(k)!.push(b);};
 const data=grid(node),at=(x:number,y:number)=>x>=0&&y>=0&&x<200&&y<150&&data[y*200+x]?1:0;
 const table:Record<number,number[][]>={1:[[3,0]],2:[[0,1]],3:[[3,1]],4:[[1,2]],5:[[3,0],[1,2]],6:[[0,2]],7:[[3,2]],8:[[2,3]],9:[[2,0]],10:[[0,1],[2,3]],11:[[2,1]],12:[[1,3]],13:[[1,0]],14:[[0,3]]};
 for(let y=-1;y<150;y++)for(let x=-1;x<200;x++){
  const code=at(x,y)+2*at(x+1,y)+4*at(x+1,y+1)+8*at(x,y+1);if(!code||code===15)continue;
  const edges:Point[]=[[x*4+4,y*4+2],[x*4+6,y*4+4],[x*4+4,y*4+6],[x*4+2,y*4+4]];
  for(const pair of table[code]??[]){const a=edges[pair[0]!]!,b=edges[pair[1]!]!;add(a,b);add(b,a);}
 }
 let result='';while(links.size){const first=links.keys().next().value!;let current=first.split(',').map(Number) as Point,previous:Point|undefined;const points:Point[]=[current];
  for(let guard=0;guard<100000;guard++){const neighbors=links.get(key(current));if(!neighbors?.length)break;const next=neighbors.find(p=>!previous||key(p)!==key(previous))??neighbors[0]!;links.delete(key(current));previous=current;current=next;if(key(current)===first)break;points.push(current);}
  if(points.length<3)continue;
  for(let pass=0;pass<3;pass++){const next=points.map((p,i):Point=>{const a=points[(i+points.length-2)%points.length]!,b=points[(i+2)%points.length]!;return [(a[0]+2*p[0]+b[0])/4,(a[1]+2*p[1]+b[1])/4];});points.splice(0,points.length,...next);}
  const outline=points.length>12?points.filter((_,i)=>i%3===0):points,last=outline.at(-1)!,start=outline[0]!;
  result+=`M${(last[0]+start[0])/2} ${(last[1]+start[1])/2}`;
  outline.forEach((p,i)=>{const n=outline[(i+1)%outline.length]!;result+=`Q${p[0]} ${p[1]} ${(p[0]+n[0])/2} ${(p[1]+n[1])/2}`;});result+='Z';
 }
 if(node.brush)smoothPaths.set(node.brush,result);return result;
}

const bandPaths=new WeakMap<NonNullable<MapNode['brush']>,Map<number,string>>();
export function brushBandPath(node:MapNode,band:number):string{
 let stored=node.brush?bandPaths.get(node.brush):undefined;if(stored?.has(band))return stored.get(band)!;
 let path='';const data=grid(node);for(let y=0;y<150;y++){let start=-1;for(let x=0;x<=200;x++){const hit=x<200&&(data[y*200+x]??0)>=band;if(hit&&start<0)start=x;if(!hit&&start>=0){path+=`M${start*4} ${y*4}h${(x-start)*4}v4H${start*4}Z `;start=-1;}}}
 if(node.brush){if(!stored){stored=new Map();bandPaths.set(node.brush,stored);}stored.set(band,path);}return path;
}
