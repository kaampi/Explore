import { inheritedMapImage,interiorPlaceBrief } from "../library/interior";
import type { RealmTemplate,PlaceTemplate } from "@library/LibrarySchema";
import type { Session } from "@state/StateSchema";
import { foldPlace } from "@state/roomMatch";
import { findCrossings } from "@library/mapCrossings";
import type { WorldMap } from "@library/worldMap";
import { authoredRouteInfo } from "@library/routeContext";
import { RoutePlanSchema, type RoutePlan } from "@library/routePlan";
import { routeWorkMinutes } from "@library/plannerRoutes";
import { parseTravelMinutes, travelDaysFromDuration } from "@state/gameClock";
export class MapMovementError extends Error {}
export type MapMovement={handled:boolean;place?:PlaceTemplate;travelMinutes?:number;travelDays?:number;routeInfo?:string;encounter?:NonNullable<Session["journey"]>["encounter"]};

export function resolvePlannedMapMovement(text:string,session:Session,worlds:RealmTemplate[],places:PlaceTemplate[],plan:RoutePlan):MapMovement{
 const valid=RoutePlanSchema.parse(plan);
 if(valid.fromPlaceId!==session.scene?.placeId)throw new MapMovementError("Your position changed. Open the route planner again.");
 if(!valid.legs)return resolveMapMovement(text,session,worlds,places,undefined,valid);
 const world=worlds.find(w=>w.id===valid.worldId);
 if(!world?.worldMap)throw new MapMovementError("The planned world map no longer exists.");
 const virtual=structuredClone(session),notes:string[]=[];
 let total=0,last:MapMovement={handled:true},encounter:MapMovement["encounter"];
 for(const leg of valid.legs){
   if(virtual.scene?.placeId!==leg.fromPlaceId)throw new MapMovementError("The planned route is not continuous.");
   const result=resolveMapMovement(text,virtual,worlds,places,leg.toPlaceId,{worldId:valid.worldId,routeId:leg.routeId});
   const actual=world.worldMap.routes.find(r=>r.id===leg.routeId);
   const work=actual?routeWorkMinutes(actual.duration):undefined;
   if(!result.place||result.place.id!==leg.toPlaceId||work===undefined)throw new MapMovementError("A planned connection has changed or has no travel time. Open the planner again.");
   total+=work;
   if(!Number.isSafeInteger(total))throw new MapMovementError("The planned journey is too long.");
   if(result.routeInfo)notes.push(result.routeInfo);
   const rank={never:0,rarely:1,sometimes:2,often:3};
   if(result.encounter&&(!encounter||rank[result.encounter.frequency]>rank[encounter.frequency]))encounter=result.encounter;
   virtual.scene={...virtual.scene!,placeId:result.place.id,location:result.place.name};
   last=result;
 }
 const {travelDays:_days,...result}=last;
 return {...result,travelMinutes:total,routeInfo:notes.join("\n"),...(encounter?{encounter}: {})};
}

function crossingProblem(map: WorldMap, routeId: string, text: string): string | undefined {
 for (const crossing of findCrossings(map).filter(c=>c.routeId===routeId)) {
  const info=map.crossings?.find(c=>c.id===crossing.id);
  if(info?.access==="blocked")return "This river crossing is currently blocked.";
  if(info?.type==="bridge"||info?.type==="ferry")continue;
  if(info?.type==="none"&&info.naturalPassage==="ford") {
   if(!/\b(?:wade|wading|vada|vadar)\b/i.test(text))return "This crossing has a ford. Explicitly choose to wade across the river to use it.";
  } else if(info?.type==="none"&&info.naturalPassage==="swim") {
   if(!/\b(?:swim|swimming|simma|simmar)\b/i.test(text))return "This crossing requires swimming. Explicitly choose to swim across the river to use it.";
  } else return "The route has no established river crossing. Define a bridge, ferry, ford or swimming passage in Map Studio.";
 }
 return;
}
/** Resolve explicit player movement against authored routes, never AI narration. */
export function resolveMapMovement(text:string,session:Session,worlds:RealmTemplate[],places:PlaceTemplate[],requestedPlaceId?:string,routeSelection?:{worldId:string;routeId:string}):MapMovement {
 const world=worlds.find(w=>(!routeSelection||w.id===routeSelection.worldId)&&w.worldMap?.nodes.some(n=>n.placeId===session.scene?.placeId));
 if(routeSelection&&!world?.worldMap)throw new MapMovementError("The planned route is no longer on your current map. Open the planner again.");
 if(!world?.worldMap)return {handled:false};
 const map=world.worldMap,current=map.nodes.find(n=>n.placeId===session.scene?.placeId)!;
 const motion=/^\s*(?:gå|go|walk|enter|leave|exit|swim|wade)(?:\s|$)/i.test(text)||/(?:^|[.!]\s+)\s*\*?\s*(?:(?:i|we)\s+(?:(?:now|then)\s+)?(?:walk|go|step|head|enter|leave|exit|return|climb|follow|swim|wade)|(?:jag|vi)\s+(?:går|kliver|lämnar|återvänder|följer|simmar|vadar))\b/i.test(text);
 if(!requestedPlaceId&&(!motion||/\?|\b(?:do not|don't|not going|inte|would|might|want to|plan to)\b/i.test(text)))return {handled:true};
 const entering=/\b(?:enter|inside|step in|go in|walk in|into)\b|(?:går|gå|kliver)\s+in/i.test(text);
 const exterior=session.scene?.location===`Outside ${current.name}`;
 const hay=foldPlace(text),named=map.nodes.filter(n=>n.placeId&&n.id!==current.id&&n.name.trim().length>1&&hay.includes(foldPlace(n.name)));
 const outgoing=map.routes.filter(r=>(!routeSelection||r.id===routeSelection.routeId)&&(r.from===current.id||r.bothWays&&r.to===current.id));
 if(routeSelection&&!outgoing.length)throw new MapMovementError("The planned route is no longer reachable from your current place.");
 const adjacent=outgoing.map(r=>({route:r,node:map.nodes.find(n=>n.id===(r.from===current.id?r.to:r.from))!})).filter(item=>item.node);
 let targets=requestedPlaceId?map.nodes.filter(n=>n.placeId===requestedPlaceId):named;
 if(!requestedPlaceId&&targets.length>1&&current.kind.toLowerCase()==='room'){
  const local=targets.filter(n=>n.id===current.parentId||n.kind.toLowerCase()==='room'&&n.parentId===current.parentId);if(local.length)targets=local;
 }
 if(entering&&exterior&&!targets.length)targets=[current];
 const outside=/\b(?:outside|out of|step out|go out|walk out|ut|utanför)\b/i.test(text);
 if(!targets.length&&outside&&exterior&&current.parentId){const parent=map.nodes.find(n=>n.id===current.parentId);if(parent)targets=[parent];}
 if(!targets.length&&outside&&!exterior&&["building","house","cottage"].includes(current.kind.toLowerCase()))targets=[current];
 if(!targets.length&&outside){targets=adjacent.filter(item=>item.node.id===current.parentId||!["room","building"].includes(item.node.kind.toLowerCase())).map(item=>item.node);if(!targets.length)throw new MapMovementError("No mapped exit is available from "+current.name+". Add an open connection to the outside in Map Studio, or specify a reachable destination.");}
 if(!targets.length){if(/\b(?:follow|följer)\b/i.test(text))throw new MapMovementError("Where do you want to go? Specify a connected place by name.");return {handled:true};}
 const unique=[...new Map(targets.map(n=>[n.id,n])).values()];
 if(unique.length!==1)throw new MapMovementError("Which destination do you mean? "+unique.map(n=>n.name).join(", ")+". Specify one place.");
 let target=unique[0]!;
 const building=(n:typeof current)=>["building","house","cottage"].includes(n.kind.toLowerCase());
 const openArea=(n:typeof current)=>!building(n)&&n.kind.toLowerCase()!=="room"&&!['river','lake'].includes(n.kind.toLowerCase())&&n.passage!=="blocked";
 const parentOf=(n:typeof current)=>map.nodes.find(p=>p.id===n.parentId);
 const currentArea=exterior?parentOf(current):current;
 const sameArea=Boolean(currentArea&&openArea(currentArea)&&(target.parentId===currentArea.id||currentArea.parentId===target.id||target.parentId&&target.parentId===currentArea.parentId&&parentOf(target)&&openArea(parentOf(target)!)));
 const placeFor=(n:typeof current)=>{const source=places.find(p=>p.id===n.placeId);if(!source)throw new MapMovementError("Save the destination in Map Studio before travelling there.");const place={...source};const local=interiorPlaceBrief(map,n.id);if(local)place.brief=local;const image=inheritedMapImage(map,n.id,places);return image?{...place,imageDataUrl:image,thumbDataUrl:image,...(image===place.imageDataUrl?{}:{gallery:[]})}:place;};
 if(session.player?.position.lock!=="unlocked")throw new MapMovementError("The player's position is locked. Unlock it before travelling.");
 if(outside&&!exterior&&building(current)&&session.scene?.location===current.name){
  if(current.entrance!==undefined){
   const internal=(id:string)=>{const seen=new Set<string>();let n=map.nodes.find(n=>n.id===id);while(n?.parentId&&!seen.has(n.id)){seen.add(n.id);if(n.parentId===current.id)return true;n=map.nodes.find(p=>p.id===n!.parentId);}return false;};
   const doors=map.routes.filter(r=>r.mode.toLowerCase()==='door'&&(r.from===current.id&&!internal(r.to)||r.to===current.id&&!internal(r.from)));
   if(doors.length&&!doors.some(r=>(r.from===current.id||r.bothWays&&r.to===current.id)&&r.access==='open'&&r.duration!=='Blocked by terrain'))throw new MapMovementError('The mapped exit from '+current.name+' is locked, hidden or one-way.');
  }
  const place=placeFor(current),description="You are outside "+current.name+". You have left the interior.";return {handled:true,place:{...place,name:"Outside "+current.name,note:description,brief:description,rooms:[]}};
 }
 // Open terrain permits local movement without an authored path. A building is approached, not entered.
 if(sameArea&&!entering&&(openArea(target)||building(target))){
  if(target.visibility==="hidden")throw new MapMovementError("This destination has not been revealed yet.");
  const localRoute = adjacent.find(item => item.node.id === target.id && item.route.access === "open" && item.route.duration !== "Blocked by terrain");
  if(localRoute){const problem=crossingProblem(map,localRoute.route.id,text);if(problem)throw new MapMovementError(problem);}
  const localMinutes = localRoute ? parseTravelMinutes(localRoute.route.duration) : undefined;
  const localDays = localRoute ? travelDaysFromDuration(localRoute.route.duration) : undefined;
  const localTiming = {...(localMinutes !== undefined ? {travelMinutes: localMinutes} : {}), ...(localDays !== undefined ? {travelDays:localDays} : {}), ...(localRoute?.route.encounter ? {encounter:localRoute.route.encounter} : {}), ...(localRoute ? {routeInfo:authoredRouteInfo(map,localRoute.route.id)} : {})};
  const place=placeFor(target);
  if(building(target)){const description="You are outside "+target.name+". You have not passed its entrance or entered any room.";return {handled:true,...localTiming,place:{...place,name:"Outside "+target.name,note:description,brief:description,rooms:[]}};}
  return {handled:true,place,...localTiming};
 }
 let routes=adjacent.filter(item=>item.node.id===target.id).map(item=>item.route);
 if(entering&&building(target)){
  const inside=(id:string)=>{const seen=new Set<string>();let n=map.nodes.find(n=>n.id===id);while(n?.parentId&&!seen.has(n.id)){seen.add(n.id);if(n.parentId===target.id)return true;n=map.nodes.find(p=>p.id===n!.parentId);}return false;};
  if(target.interior&&(sameArea||exterior&&current.id===target.id)){
   const internal=(id:string)=>id===target.id||inside(id),externalDoors=map.routes.filter(r=>r.mode.toLowerCase()==='door'&&internal(r.from)!==internal(r.to));
   const outsideSources=new Set([current.id,...(exterior&&current.parentId?[current.parentId]:[])]);
   if(externalDoors.length&&!externalDoors.some(r=>r.access==='open'&&r.duration!=='Blocked by terrain'&&(!internal(r.from)&&outsideSources.has(r.from)&&internal(r.to)||r.bothWays&&!internal(r.to)&&outsideSources.has(r.to)&&internal(r.from))))throw new MapMovementError('The mapped entrance to '+target.name+' is locked, hidden or one-way.');
  }
  const sources=new Set([current.id,...(exterior&&current.parentId?[current.parentId]:[]),...(target.interior&&(sameArea||exterior&&current.id===target.id)?[target.id]:[])]);
  const entrances=map.routes.filter(r=>r.mode.toLowerCase()==="door").flatMap(r=>{if(sources.has(r.from)&&inside(r.to))return [{route:r,node:map.nodes.find(n=>n.id===r.to)!}];if(r.bothWays&&sources.has(r.to)&&inside(r.from))return [{route:r,node:map.nodes.find(n=>n.id===r.from)!}];return [];});
  const destinations=[...new Map(entrances.map(item=>[item.node.id,item.node])).values()];
  if(destinations.length>1)throw new MapMovementError("Which entrance? "+destinations.map(n=>n.name).join(", ")+".");
  if(destinations[0]){target=destinations[0];routes=entrances.filter(item=>item.node.id===target.id).map(item=>item.route);}
  else if(target.entrance!==undefined){
   // A default entrance never replaces an authored exterior doorway, including locked/one-way doors.
   const authoredDoors=map.routes.filter(r=>r.mode.toLowerCase()==='door'&&((r.to===target.id||inside(r.to))&&!(r.from===target.id||inside(r.from))||(r.from===target.id||inside(r.from))&&!(r.to===target.id||inside(r.to))));
   if(authoredDoors.length){routes=authoredDoors.filter(r=>sources.has(r.from)&&r.to===target.id||r.bothWays&&sources.has(r.to)&&r.from===target.id);}
   else {
    if(target.visibility==='hidden')throw new MapMovementError('This destination has not been revealed yet.');
    if(target.entrance==='locked')throw new MapMovementError('The entrance to '+target.name+' is locked.');
    if(target.entrance==='hidden')throw new MapMovementError('No known entrance is available to '+target.name+'.');
    if(target.entrance==='none')throw new MapMovementError('No entrance is defined for '+target.name+'.');
    const atEntrance=exterior&&current.id===target.id;
    if(atEntrance||sameArea){
     const route=routes.find(r=>r.access==='open'&&r.duration!=='Blocked by terrain'&&!crossingProblem(map,r.id,text));
     if(routes.length&&!route)throw new MapMovementError('The passage to '+target.name+' is locked, hidden or blocked.');
     const minutes=route?parseTravelMinutes(route.duration):undefined,days=route?travelDaysFromDuration(route.duration):undefined;
     return {handled:true,place:placeFor(target),...(minutes!==undefined?{travelMinutes:minutes}:{}),...(days!==undefined?{travelDays:days}:{}),...(route?{routeInfo:authoredRouteInfo(map,route.id),...(route.encounter?{encounter:route.encounter}:{})}:{})};
    }
   }
  }
 }
 if(!routes.length)throw new MapMovementError("No open doorway or passage is defined from "+current.name+" to "+target.name+". Buildings and rooms need an entrance; open terrain does not need a drawn path.");
 const route=routes.find(r=>r.access==="open"&&r.duration!=="Blocked by terrain"&&!crossingProblem(map,r.id,text));
 if(!route){const candidate=routes.find(r=>r.access==="open"&&r.duration!=="Blocked by terrain");throw new MapMovementError(candidate?crossingProblem(map,candidate.id,text)!:"The passage to "+target.name+" is locked, hidden or blocked.");}
 if(session.player?.position.lock!=="unlocked")throw new MapMovementError("The player's position is locked. Unlock it before travelling.");
 const place=placeFor(target);
 const minutes = parseTravelMinutes(route.duration);
 const days = travelDaysFromDuration(route.duration);
 const timing = {...(minutes !== undefined ? {travelMinutes: minutes} : {}), ...(days !== undefined ? {travelDays:days} : {}), ...(route.encounter ? {encounter:route.encounter} : {}),routeInfo:authoredRouteInfo(map,route.id)};
 if((outside||!entering)&&building(target)){const description="You are outside "+target.name+". You have not entered any room.";return {handled:true,...timing,place:{...place,name:"Outside "+target.name,note:description,brief:description,rooms:[]}};}
 return {handled:true,place,...timing};
}
