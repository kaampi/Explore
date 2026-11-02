import { MountainTerrain } from "./MountainTerrain";
import { treeDetailOpacity } from "./mapDetail";
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { MapNode,WorldMap } from '@library/worldMap';
import { brushContains,brushBounds,brushPath,smoothBrushPath } from '@library/forestBrush';
export type TerrainBrushMode='forest'|'erase'|'clearing'|'lake'|'low'|'mid'|'peak';
type Stroke=NonNullable<MapNode['brush']>[number];
function rand(n:number){let a=Math.imul(n^0x9e3779b9,0x21f0aaad);a=Math.imul(a^(a>>>15),0x735a2d97);return ((a^(a>>>15))>>>0)/4294967296;}
let treeAssets:Promise<HTMLImageElement[]>|undefined;
function loadTreeAssets(){return treeAssets??=Promise.all([1,2,3,4].map(n=>new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Could not load tree symbol'));img.src='/map-assets/trees/pinetree'+n+'.svg';})));}
function ForestTexture({trees,scale}:{trees:{x:number;y:number;size:number;variant:number;rank:number}[];scale:number}){
 const [texture,setTexture]=useState('');
 useEffect(()=>{let cancelled=false;if(!trees.length){setTexture('');return;}void loadTreeAssets().then(images=>{if(cancelled)return;const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1200;const ctx=canvas.getContext('2d');if(!ctx)return;ctx.scale(2,2);for(const t of trees){const alpha=treeDetailOpacity(t.rank,scale);if(alpha<=0)continue;ctx.globalAlpha=alpha;ctx.drawImage(images[t.variant-1]!,t.x-t.size*63/166,t.y-t.size,t.size*63/83,t.size);}if(!cancelled)setTexture(canvas.toDataURL('image/png'));}).catch(()=>{if(!cancelled)setTexture('');});return ()=>{cancelled=true;};},[trees,scale]);
 return texture?<image href={texture} x="0" y="0" width="800" height="600" pointerEvents="none"/>:null;
}
function BrushTerrainView({node,clearings=[],parent,detailScale=2,mountains=[]}:{node:MapNode;clearings?:MapNode[];parent?:MapNode;detailScale?:number;mountains?:MapNode[]}){
 const trees=useMemo(()=>{
  if(node.kind!=='Forest')return [];
  const result:{x:number;y:number;size:number;variant:number;rank:number}[]=[];
  for(let i=0;i<4200;i++){const x=rand(i*7)*800,y=rand(i*7+1)*600;if(!brushContains(node,x,y)||clearings.some(n=>brushContains(n,x,y)))continue;
   let depth=70;for(let r=8;r<=70;r+=8){let edge=false;for(let a=0;a<8;a++)if(!brushContains(node,x+Math.cos(a*Math.PI/4)*r,y+Math.sin(a*Math.PI/4)*r)||clearings.some(n=>brushContains(n,x+Math.cos(a*Math.PI/4)*r,y+Math.sin(a*Math.PI/4)*r)))edge=true;if(edge){depth=r;break;}}
   const d=Math.min(1,depth/70),blend=d*d*(3-2*d),group=(Math.sin(x/23)+Math.cos(y/19)+2)/4;
   if(rand(i*7+2)>.035+.835*blend+.12*group*(1-blend))continue;
   result.push({x,y,rank:rand(i*7+6),size:(17+15*blend)*(.88+rand(i*7+3)*.3),variant:1+Math.floor(rand(i*7+4)*4)});
  }return result.sort((a,b)=>a.y-b.y);
 },[node.brush,node.kind,clearings]);
 // Ordered masks let later paint restore erased ground.
 const id='brush-'+node.id;const hitPath=useMemo(()=>node.kind==='Lake'?smoothBrushPath(node):brushPath(node),[node.brush,node.kind]);
 return <g mask={node.kind==='Forest'?`url(#highlands-${node.id})`:parent?.brush?`url(#brush-${parent.id})`:undefined}><path d={hitPath} fill="transparent" fillRule="evenodd"/><defs><mask id={`highlands-${node.id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="800" height="600"><rect width="800" height="600" fill="white"/>{mountains.map(m=><MountainTerrain key={m.id} node={m} detailScale={detailScale} silhouette/>)}</mask><mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="800" height="600"><rect width="800" height="600" fill="black"/><path d={hitPath} fill="white" fillRule="evenodd"/></mask></defs><rect width="800" height="600" fill={node.kind==='Lake'?'#aacfdc':node.kind==='Forest'?'#dce2cb':'#e2e5ce'} mask={`url(#${id})`} opacity={node.kind==='Lake'?1:node.kind==='Mountain'?0:detailScale<.8?.85:.5} pointerEvents="none"/>{node.kind==='Mountain'&&<MountainTerrain node={node} detailScale={detailScale}/>} <ForestTexture trees={trees} scale={detailScale}/></g>;
}
export const BrushTerrain=memo(BrushTerrainView,(a,b)=>a.node===b.node&&a.parent===b.parent&&a.detailScale===b.detailScale&&(a.mountains?.length??0)===(b.mountains?.length??0)&&(a.mountains??[]).every((n,i)=>n===b.mountains?.[i])&&(a.clearings?.length??0)===(b.clearings?.length??0)&&(a.clearings??[]).every((n,i)=>n===b.clearings?.[i]));
export function ForestBrushInput({map,selected,level,mode,radius,onChange,onSelect}:{map:WorldMap;selected:string;level:string;mode:TerrainBrushMode;radius:number;onChange:(m:WorldMap)=>void;onSelect:(id:string)=>void}){
 const active=useRef<{map:WorldMap;id:string;last:{x:number;y:number}|null;preview:Stroke[]}|null>(null),[cursor,setCursor]=useState<{x:number;y:number}|null>(null);
 const [preview,setPreview]=useState<Stroke[]>([]);
 const changeRef=useRef(onChange);changeRef.current=onChange;
 function finish(){const a=active.current;if(!a)return;active.current=null;setPreview([]);changeRef.current(a.map);}
 useEffect(()=>()=>{const a=active.current;if(a)changeRef.current(a.map);},[]);
 const point=(e:React.PointerEvent<SVGRectElement>)=>{const matrix=e.currentTarget.ownerSVGElement!.getScreenCTM()!;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return {x:Math.max(0,Math.min(800,p.x)),y:Math.max(0,Math.min(600,p.y))};};
 function paint(p:{x:number;y:number}){const a=active.current;if(!a)return;const node=a.map.nodes.find(n=>n.id===a.id)!;const last=a.last??p;if(a.last&&Math.hypot(p.x-last.x,p.y-last.y)<Math.max(2,radius*.1))return;const steps=Math.max(1,Math.ceil(Math.hypot(p.x-last.x,p.y-last.y)/(radius*.25)));const strokes:Stroke[]=[];for(let i=1;i<=steps;i++)strokes.push({x:last.x+(p.x-last.x)*i/steps,y:last.y+(p.y-last.y)*i/steps,radius,erase:mode==='erase',...(['low','mid','peak'].includes(mode)?{height:mode==='low'?1:mode==='mid'?2:3}:{})});
 const updated={...node,...(node.kind==='Mountain'?{mountainFinalized:false}:{}),brush:[...(node.brush??[]),...strokes]};if(updated.brush.length>30000)return;
 a.map={...a.map,nodes:a.map.nodes.map(n=>n.id===a.id?{...updated,...brushBounds(updated)}:n)};a.last=p;a.preview.push(...strokes);setPreview([...a.preview]);
 }
 return <g><rect width="800" height="600" fill="transparent" style={{cursor:'crosshair',touchAction:'none'}} onPointerDown={e=>{if(e.button!==0)return;const p=point(e);let next=map,id=selected;const chosen=map.nodes.find(n=>n.id===selected);const kind=mode==='forest'?'Forest':mode==='clearing'?'Clearing':mode==='lake'?'Lake':'Mountain';
 if(mode==='erase'){if(!chosen?.brush)return;}
 else if(chosen?.kind===kind&&chosen.brush){id=chosen.id;}
 else{const parent=mode==='clearing'?(chosen?.kind==='Forest'?chosen:map.nodes.find(n=>n.kind==='Forest'&&n.brush&&(n.parentId??'')===level&&brushContains(n,p.x,p.y))):undefined;if(mode==='clearing'&&!parent)return;id=crypto.randomUUID();const n:MapNode={id,placeId:id,name:'New '+kind.toLowerCase(),kind,x:p.x/8,y:p.y/6,description:'',population:'',characterIds:[],brush:[],...(parent?{parentId:parent.id,isArea:true,passage:'normal' as const,travelMultiplier:1}:level?{parentId:level}:{})};next={...map,nodes:[...map.nodes,n]};}active.current={map:next,id,last:null,preview:[]};onSelect(id);e.currentTarget.setPointerCapture(e.pointerId);paint(p);}} onPointerMove={e=>{const p=point(e);setCursor(p);paint(p);}} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onPointerLeave={()=>setCursor(null)}/>{preview.length>0&&<path d={preview.map(s=>`M${s.x-s.radius} ${s.y}a${s.radius} ${s.radius} 0 1 0 ${s.radius*2} 0a${s.radius} ${s.radius} 0 1 0 ${-s.radius*2} 0`).join(" ")} fill={mode==='erase'?'#fcfcf9':mode==='lake'?'#aacfdc':mode==='forest'?'#93aa7c':mode==='peak'?'#f5f5f0':mode==='mid'?'#777e7d':'#b4b3a9'} opacity=".65" pointerEvents="none"/>}{cursor&&<circle cx={cursor.x} cy={cursor.y} r={radius} fill="none" stroke={mode==='erase'?'#a54f36':'#355641'} strokeDasharray="5 4" pointerEvents="none" vectorEffect="non-scaling-stroke"/>}</g>;
}
