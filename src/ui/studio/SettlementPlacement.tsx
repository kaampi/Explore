import { useEffect,useState } from 'react';
import type { MapNode,WorldMap } from '../../library/worldMap';
import { settlementPiece,type SettlementPiece } from '../../library/settlement';
import { settlementPlacementIssue } from '../../library/settlementPlacement';
import { BuildingSymbol,SettlementMarker } from './SettlementArtwork';

export function SettlementPlacement({piece,parentId,onPlace,onCancel,detailScale=1,map,prototype,onError}:{piece:SettlementPiece;parentId:string;onPlace:(node:MapNode)=>void;onCancel:()=>void;detailScale?:number;map?:WorldMap;prototype?:MapNode;onError?:(message:string)=>void}){
 const [preview,setPreview]=useState<MapNode|null>(null),name=prototype?.name??piece;
 useEffect(()=>{const cancel=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onCancel();}};window.addEventListener('keydown',cancel);return()=>window.removeEventListener('keydown',cancel);},[onCancel]);
 const make=(x:number,y:number):MapNode=>prototype?{...structuredClone(prototype),x:Math.max((prototype.width??10)/2,Math.min(100-(prototype.width??10)/2,x)),y:Math.max((prototype.height??10)/2,Math.min(100-(prototype.height??10)/2,y))}:settlementPiece(piece,parentId,x,y);
 const at=(event:React.PointerEvent<SVGRectElement>)=>{const matrix=event.currentTarget.ownerSVGElement?.getScreenCTM();if(!matrix)return null;const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());return make(p.x/8,p.y/6);};
 const issue=(node:MapNode)=>map?settlementPlacementIssue(map,parentId,node):node.placementRule?'Water context is required to place docks.':null;
 const place=(node:MapNode)=>{const reason=issue(node);setPreview(node);if(reason){onError?.(reason);return;}onPlace(node);};
 const warning=preview?issue(preview):null;
 return <g><rect width="800" height="600" fill="transparent" role="button" tabIndex={0} aria-label={'Place '+name+' on map'} style={{cursor:'crosshair',touchAction:'none'}} onPointerMove={event=>setPreview(at(event))} onPointerLeave={()=>setPreview(null)} onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();const node=at(event);if(node)place(node);}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();place(make(50,50));}}}/>
  {preview&&<g opacity=".7" pointerEvents="none">{preview.settlementMarker?<SettlementMarker node={preview} detailScale={detailScale}/>:<><rect x={(preview.x-preview.width!/2)*8} y={(preview.y-preview.height!/2)*6} width={preview.width!*8} height={preview.height!*6} fill={preview.color} fillOpacity=".25" stroke={warning?'#b3514b':'#86696d'} strokeWidth="2" strokeDasharray="4 3"/><BuildingSymbol node={preview}/></>}{warning&&<text x="400" y="580" textAnchor="middle" fill="#a0443f" fontSize="12">{warning}</text>}</g>}
 </g>;
}
