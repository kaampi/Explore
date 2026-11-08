import type { MapNode,WorldMap } from './worldMap';

function cellScale(distance:WorldMap['distanceScale'],minutes:number){return distance?{km:distance.value*distance.kmPerUnit,estimated:false}:{km:minutes*5/60,estimated:true};}

/** Project parent geography around the settlement location using physical scale, never its icon bounds. */
export function settlementWorldContext(map:WorldMap,settlementId:string){
 const settlement=map.nodes.find(n=>n.id===settlementId);if(!settlement||settlement.kind.toLowerCase()!=='settlement')return null;
 const parentId=settlement.parentId??'',parent=map.nodes.find(n=>n.id===parentId),parentType=parent?.contentType??(parentId?'world':map.mapType??'world');
 const source=cellScale(parentId?parent?.distanceScale:map.distanceScale,(parentId?parent?.minutesPerCell:map.minutesPerCell)??(parentType==='world'?1440:5));
 const local=cellScale(settlement.distanceScale,settlement.minutesPerCell??5),scale=source.km/local.km;
 const x=400-settlement.x*8*scale,y=300-settlement.y*6*scale;
 if(!Number.isFinite(scale)||scale<=0||!Number.isFinite(x)||!Number.isFinite(y))return null;
 const direct=map.nodes.filter(n=>(n.parentId??'')===parentId),ids=new Set(direct.map(n=>n.id));
 const terrain=map.nodes.filter(n=>n.id!==settlement.id&&((n.parentId??'')===parentId||n.isArea&&n.parentId!==settlement.id&&Boolean(n.parentId&&ids.has(n.parentId)))&&!n.settlementMarker&&!n.isJunction&&['forest','lake','river','sea','ocean','mountain','region','area','clearing','marsh','rapids','ford','waterfall','calm water','dense woodland'].includes(n.kind.toLowerCase()));
 const priority=(n:MapNode)=>['lake','river','sea','ocean'].includes(n.kind.toLowerCase())?2:n.isArea?3:n.kind.toLowerCase()==='region'?0:1;
 return {settlement,parentId,scale,x,y,estimated:source.estimated||local.estimated,
  terrain:[...terrain].sort((a,b)=>priority(a)-priority(b)),routes:map.routes.filter(r=>r.mode.toLowerCase()!=='door'&&ids.has(r.from)&&ids.has(r.to)),nodes:direct};
}
