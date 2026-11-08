import { mapBackgroundColor } from "../../library/worldMap";
import { memo, useMemo } from 'react';
import type { MapNode, WorldMap } from '../../library/worldMap';
import { settlementOverview } from '../../library/settlement';
import { mapPosition } from '../../library/mapGeometry';
import { rectanglePoints, shapePath } from '../../library/mapShapes';
import { SettlementWorldContext } from './SettlementWorldContext';
import type { settlementWorldContext } from '../../library/settlementContext';

/** A readable location symbol; its screen size is not a geographic footprint. */
export function SettlementMarker({node,detailScale=1,selected=false}:{node:MapNode;detailScale?:number;selected?:boolean}){
 return <g data-settlement-marker={node.id} transform={`translate(${node.x*8} ${node.y*6}) scale(${1/Math.max(.1,detailScale)})`}>
  <circle r="13" fill={node.color??'#e4d7b8'} stroke={selected?'#86696d':'#77644f'} strokeWidth={selected?2:1.2}/>
  <path d="M-8 0l5-5 5 5v7H-8ZM0-3l5-5 5 5v10H0Z" fill="#aa8c65" stroke="#655640" strokeWidth="1" strokeLinejoin="round"/><path d="M3 7V2h3v5" fill="#f7f0db"/>
 </g>;
}

/** Detailed objects sit directly on the map; fields and pastures retain their area fill. */
export const hasStandaloneSymbol=(node:MapNode)=>!!node.symbol&&['cottage','longhouse','townhouse','inn','well','docks'].includes(node.symbol);

export function BuildingSymbol({node}:{node:MapNode}) {
  if (!node.symbol || node.symbol === 'marker') return null;
  const width=(node.width??10)*8,height=(node.height??10)*6;
  return <image href={`/map-assets/houses/${node.symbol}.svg`} x={node.x*8-width/2} y={node.y*6-height/2} width={width} height={height} transform={`rotate(${node.rotation??0} ${node.x*8} ${node.y*6})`} pointerEvents="none"/>;
}

export const SettlementOverview=memo(function SettlementOverview({node,nodes,routes,detailScale=1,selected=false}:{node:MapNode;nodes:MapNode[];routes:WorldMap['routes'];detailScale?:number;selected?:boolean}) {
  const contents=nodes.filter(n=>n.parentId===node.id),ids=new Set(contents.map(n=>n.id)),connections=routes.filter(r=>ids.has(r.from)&&ids.has(r.to));
  const signature=JSON.stringify([node.id,contents.map(n=>[n.id,n.kind,n.x,n.y,n.width,n.height,n.rotation,n.shape,n.symbol,n.color]),connections]);
  const model=useMemo(()=>node.settlementMarker?null:settlementOverview(node.id,contents,connections),[signature,node.settlementMarker]);
  if(node.settlementMarker)return <g data-settlement-overview={node.id} aria-label={`${node.name}: location marker, ${contents.filter(n=>n.kind.toLowerCase()==='building').length} buildings on its local map`}><SettlementMarker node={node} detailScale={detailScale} selected={selected}/></g>;
  if(!model)return <g><path d={shapePath(node.shape??rectanglePoints(),p=>mapPosition(node,p))} fill={node.color??'#e4d7b8'} stroke={selected?'#86696d':'#9a8c70'} strokeWidth={selected?2:1}/><path d={`M${node.x*8-8} ${node.y*6-3}l8 -7 8 7v10h-16Z`} fill="#a98c65" pointerEvents="none"/></g>;
  const width=(node.width??15)*8,height=(node.height??10)*6,b=model.bounds,scale=Math.min(width/b.width,height/b.height),x=node.x*8-width/2+(width-b.width*scale)/2-b.x*scale,y=node.y*6-height/2+(height-b.height*scale)/2-b.y*scale;
  const showStreets=scale*detailScale>.06,showBuildings=scale*detailScale>.09,detailed=scale*detailScale>.18;
  const stride=Math.max(1,Math.ceil(model.buildings.length/120));
  return <g data-settlement-overview={node.id} aria-label={`${node.name}: overview of ${model.buildings.length} buildings`} transform={`rotate(${node.rotation??0} ${node.x*8} ${node.y*6}) translate(${x} ${y}) scale(${scale})`}>
    <path d={model.path} fill={node.color??'#e4d7b8'} stroke={selected?'#86696d':'#a89b7b'} strokeWidth={(selected?1.8:.8)/scale} fillRule="evenodd"/>
    <g pointerEvents="none">
      {showStreets&&model.streets.map(s=><path key={s.id} d={s.path} fill="none" stroke="#c5b38c" strokeWidth={s.type==='road'?8:3} strokeLinecap="round"/>)}
      {model.areas.map(n=><path key={n.id} d={shapePath(n.shape??rectanglePoints(),p=>mapPosition(n,p))} fill={n.color??'#d9c9a8'}/>)}
      {showBuildings&&model.buildings.filter((_,i)=>i%stride===0).map(n=>detailed&&n.symbol&&n.symbol!=='marker'?<BuildingSymbol key={n.id} node={n}/>:<path key={n.id} d={shapePath(n.shape??rectanglePoints(),p=>mapPosition(n,p))} fill="#9b8061" stroke="#77644f" strokeWidth="1.4"/>)}
    </g>
  </g>;
});

export function SettlementPlan({map,parentId,worldContext}:{map:WorldMap;parentId:string;worldContext?:ReturnType<typeof settlementWorldContext>}) {
  const nodes=map.nodes.filter(n=>(n.parentId??'')===parentId),ids=new Map(nodes.map(n=>[n.id,n]));
  const model=settlementOverview(parentId,map.nodes,map.routes);
  return <svg viewBox="0 0 800 600" role="img" aria-label="Generated settlement preview" className="settlement-plan">
    <defs><pattern id="settlement-preview-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#aaab9424" strokeWidth="1"/></pattern></defs>
    <rect width="800" height="600" fill={mapBackgroundColor(map,parentId)}/>{worldContext&&<SettlementWorldContext context={worldContext}/>}<rect width="800" height="600" fill="url(#settlement-preview-grid)"/>
    {model?.streets.map(r=><path key={r.id} d={r.path} stroke={r.type==='road'?'#c7b995':'#d8cdb3'} fill="none" strokeWidth={r.type==='road'?12:4} strokeLinecap="round"/>)}
    {nodes.filter(n=>!n.isJunction).map(n=><g key={n.id}><title>{n.name}</title><path d={shapePath(n.shape??rectanglePoints(),p=>mapPosition(n,p))} fill={hasStandaloneSymbol(n)?'transparent':n.color??'#e4d9bf'} stroke={hasStandaloneSymbol(n)?'none':'#a5967833'}/>{n.kind==='Building'?<><BuildingSymbol node={n}/>{!n.name.startsWith('Home ')&&<text x={n.x*8} y={(n.y+(n.height??10)/2)*6+11} fontSize="10" textAnchor="middle" fill="#655a44">{n.name}</text>}</>:<text x={n.x*8} y={n.y*6+3} fontSize="11" textAnchor="middle" fill="#655a44">{n.name}</text>}</g>)}
    {!ids.size&&<text x="400" y="300" textAnchor="middle">Choose a starting layout.</text>}
  </svg>;
}
