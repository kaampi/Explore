import { useMemo } from 'react';
import type { MapNode } from '@library/worldMap';
import { brushHeight,brushPath,brushBandPath } from '@library/forestBrush';
function random(n:number){let a=Math.imul(n^0x9e3779b9,0x21f0aaad);a=Math.imul(a^(a>>>15),0x735a2d97);return ((a^(a>>>15))>>>0)/4294967296;}
export function MountainTerrain({node,detailScale,silhouette=false}:{node:MapNode;detailScale:number;silhouette?:boolean}){
 const path=useMemo(()=>brushPath(node),[node.brush]);
 const peaks=useMemo(()=>{
 if(!node.mountainFinalized)return [];
  const result:{x:number;y:number;r:number;band:number;variant:number;rank:number}[]=[];
  for(let row=0;row<20;row++)for(let col=0;col<23;col++){
   const id=row*23+col,x=col*36+18+(random(id*7+401)-.5)*24,y=row*32+16+(random(id*7+402)-.5)*20,band=brushHeight(node,x,y);if(!band)continue;
   if(result.some(p=>Math.hypot(p.x-x,p.y-y)<(band===3?39:band===2?30:22)))continue;
   result.push({x,y,r:(band===1?34:band===2?70:100)*(.88+random(id*7+403)*.24),band,variant:Math.floor(random(id*7+404)*3),rank:random(id*7+405)});
  }return result.sort((a,b)=>a.y-b.y);
 },[node.brush,node.mountainFinalized]);
 if(silhouette&&!node.mountainFinalized)return <path d={brushBandPath(node,2)} fill="black"/>;
 if(!node.mountainFinalized)return <g>{[1,2,3].map(band=><path key={band} d={brushBandPath(node,band)} fill={band===3?'#f5f5f0':band===2?'#777e7d':'#b4b3a9'}/>)}</g>;
 return <g>{silhouette?<path d={brushBandPath(node,2)} fill="black"/>:<path d={path} fill="#b6b6a0" opacity=".24"/>}{peaks.filter(p=>!silhouette||p.band>=2).map((p,i)=>{
  const {x,y,r,band,variant}=p,w=r*(.68+variant*.06),tip=x+(variant-1)*r*.13,top=y-r;
  if(silhouette)return <path key={i} d={`M${x-w} ${y} L${x-w*.56} ${y-r*.35} L${tip-r*.17} ${top+r*.32} L${tip} ${top} L${tip+r*.23} ${top+r*.37} L${x+w*.6} ${y-r*.32} L${x+w} ${y} Q${x} ${y+r*.08} ${x-w} ${y}Z`} fill="black"/>;
  return <g key={i} strokeLinejoin="round"><path d={`M${x-w} ${y} L${x-w*.56} ${y-r*.35} L${tip-r*.17} ${top+r*.32} L${tip} ${top} L${tip+r*.23} ${top+r*.37} L${x+w*.6} ${y-r*.32} L${x+w} ${y} Q${x} ${y+r*.08} ${x-w} ${y}Z`} fill={band===1?'#b5b49b':'#a0a58e'} stroke="#64715d" strokeWidth="1.1"/><path d={`M${tip} ${top+1} L${tip+r*.23} ${top+r*.37} L${x+w*.6} ${y-r*.32} L${x+w-1} ${y} L${x+r*.08} ${y} L${tip+r*.05} ${top+r*.52} L${tip-r*.07} ${top+r*.32}Z`} fill="#7d8976"/>{band===3&&<path d={`M${tip} ${top} L${tip+r*.23} ${top+r*.37} L${tip+r*.31} ${top+r*.47} L${tip+r*.09} ${top+r*.39} L${tip} ${top+r*.5} L${tip-r*.10} ${top+r*.38} L${tip-r*.26} ${top+r*.47} L${tip-r*.17} ${top+r*.32}Z`} fill="#f4f3e9" stroke="#899383" strokeWidth=".7"/>}{detailScale>=1.2&&<path d={`M${tip-r*.07} ${top+r*.34} L${tip-r*.16} ${top+r*.58} L${x-r*.24} ${y-r*.14}`} fill="none" stroke="#64715d" strokeWidth=".75"/>}</g>;
 })}</g>;
}
