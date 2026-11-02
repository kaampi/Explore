import type { Session } from "./StateSchema";
import { INITIAL_GAME_MINUTES } from "./gameClock";
export type LocationRef={placeId:string;side:"at"|"inside"|"outside"};
export type SpatialPlace={id:string;name:string;kind?:string|undefined};
const fold=(value:string)=>value.trim().toLowerCase().replace(/\s+/g," ");
export function resolveLocation(session:Session,text:string):LocationRef|undefined{
 let value=text.trim(),side:LocationRef["side"]="at";
 if(/^(?:outside|utanför)\s+/i.test(value)){side="outside";value=value.replace(/^(?:outside|utanför)\s+/i,"");}
 else if(/^(?:inside|inuti|in)\s+/i.test(value)){side="inside";value=value.replace(/^(?:inside|inuti|in)\s+/i,"");}
 const matches=(session.spatialPlaces??[]).filter(p=>fold(p.name)===fold(value)||p.id===value);
 if(matches.length!==1)return;
 const p=matches[0]!;if(side!=="outside"&&["building","house","cottage","room"].includes(p.kind?.toLowerCase()??""))side="inside";
 return {placeId:p.id,side};
}
export function locationLabel(session:Session,ref:LocationRef):string{const name=session.spatialPlaces?.find(p=>p.id===ref.placeId)?.name??ref.placeId;return ref.side==="outside"?"Outside "+name:name;}
export function initializeSpatialReferences(session:Session,places:SpatialPlace[]=[]):void{
 if(!session.spatialPlaces?.length&&!places.length)return;
 session.gameClock ??= {totalMinutes: INITIAL_GAME_MINUTES};
 const catalog=new Map((session.spatialPlaces??[]).map(p=>[p.id,p]));for(const p of places)catalog.set(p.id,{...catalog.get(p.id),...p});
 if(session.scene?.placeId&&!catalog.has(session.scene.placeId))catalog.set(session.scene.placeId,{id:session.scene.placeId,name:session.scene.location.replace(/^Outside\s+/i,"")});
 session.spatialPlaces=[...catalog.values()];
 for(const actor of [session.player,...Object.values(session.characters)]){if(!actor)continue;const value=actor.position.value.trim();const location=actor.locationRef??resolveLocation(session,/^(?:here|här)$/i.test(value)?session.scene?.location??value:value);if(location){const kind=catalog.get(location.placeId)?.kind?.toLowerCase();if(location.side!=="outside"&&kind&&["room","building","house","cottage"].includes(kind))location.side="inside";actor.locationRef=location;actor.position={...actor.position,value:locationLabel(session,location)};}}
}
