import { adventureBarriers } from '../game/AdventureEngine';
import type { Session } from '../state/StateSchema';
import type { RealmTemplate } from './LibrarySchema';
import { knownMapNodes } from './mapVisibility';
import type { WorldMap } from './worldMap';

export function playMapModel(session:Session,worlds:RealmTemplate[]=[]){
 const pinned=session.adventure?.geography;
 const requested=session.scene?.placeId??session.player?.locationRef?.placeId;
 const world=pinned?null:worlds.find(w=>w.worldMap?.nodes.some(n=>(n.placeId??n.id)===requested));
 const source:WorldMap|undefined=pinned?.map??world?.worldMap;if(!source)return null;
 const barriers=adventureBarriers(session),access=(id:string,original:'open'|'locked'|'hidden')=>{const b=barriers[id];return original==='hidden'||!b?.shared?original:b.locked||b.blocked||!b.open?'locked' as const:'open' as const;};
 const map:WorldMap={...source,routes:source.routes.map(r=>({...r,access:access(r.id,r.access)})),nodes:source.nodes.map(n=>n.interior?{...n,interior:{...n.interior,openings:n.interior.openings.map(o=>({...o,access:access(o.routeId??'',o.access)??o.access}))}}:n)};
 const current=map.nodes.find(n=>(n.placeId??n.id)===requested);if(!current)return null;
 const visited=new Set([requested,...(session.visitedMapPlaceIds??[])]);
 if(session.adventure){const ids=new Set([session.adventure.currentSceneId,...session.adventure.transitions.flatMap(t=>[t.from,t.to])]);for(const scene of session.adventure.scenes)if(ids.has(scene.id))visited.add(scene.placeId);}
 const discovered=new Set<string>();
 for(const n of map.nodes)if(visited.has(n.placeId??n.id)){let at:typeof n|undefined=n;while(at&&!discovered.has(at.id)){discovered.add(at.id);at=map.nodes.find(p=>p.id===at!.parentId);}}
 const known=knownMapNodes(map,discovered),knownIds=new Set(known.map(n=>n.id));
 const safeMap:WorldMap={...map,nodes:known,routes:map.routes.filter(r=>r.access!=='hidden'&&knownIds.has(r.from)&&knownIds.has(r.to))};
 let settlement:typeof current|undefined=current;const ancestors=new Set<string>();
 while(settlement&&settlement.kind.toLowerCase()!=='settlement'){if(ancestors.has(settlement.id)){settlement=undefined;break;}ancestors.add(settlement.id);settlement=map.nodes.find(n=>n.id===settlement!.parentId);}
 const house=current.parentId?known.find(n=>n.id===current.parentId&&n.interior):undefined;
 const level=house?.id??settlement?.id??current.parentId??'',container=known.find(n=>n.id===level);
 const nodes=known.filter(n=>(n.parentId??'')===level||n.isArea&&known.some(p=>p.id===n.parentId&&(p.parentId??'')===level));
 const ids=new Set(nodes.map(n=>n.id)),routes=safeMap.routes.filter(r=>ids.has(r.from)&&ids.has(r.to));
 let anchor=current;const chain=new Set<string>();while(anchor.parentId&&anchor.parentId!==level&&!chain.has(anchor.id)){chain.add(anchor.id);const parent=known.find(n=>n.id===anchor.parentId);if(!parent)break;anchor=parent;}
 return {key:`${pinned?.worldId??world!.id}:${level}`,worldId:pinned?.worldId??world!.id,worldName:pinned?.name??world!.name,map:safeMap,level,name:container?.name??world?.name??pinned?.name??'Map',nodes,routes,current,anchor:ids.has(anchor.id)?anchor:null,local:Boolean(house||settlement)||map.mapType==='settlement',pinned:Boolean(pinned)};
}
export type PlayMapModel=NonNullable<ReturnType<typeof playMapModel>>;
