import { newPlaceTemplate,type CampaignTemplate,type CampaignScene,type PlaceTemplate,type RealmTemplate } from './LibrarySchema';
import type { MapNode } from './worldMap';

export type AdventureMapPlace={node:MapNode;place:PlaceTemplate;path:string};
/** Projection of the saved map. This never creates library copies or changes identifiers. */
export function adventureMapPlaces(world:RealmTemplate|undefined,places:PlaceTemplate[]):AdventureMapPlace[]{
 if(!world?.worldMap)return [];
 const nodes=world.worldMap.nodes,byId=new Map(nodes.map(node=>[node.id,node]));
 return nodes.filter(node=>!node.isJunction).map(node=>{
  const id=node.placeId??node.id,base=places.find(p=>p.id===id&&p.realmId===world.id);
  const chain=[node.name],seen=new Set([node.id]);let parent=node.parentId;
  while(parent&&!seen.has(parent)){seen.add(parent);const p=byId.get(parent);if(!p)break;chain.unshift(p.name);parent=p.parentId;}
  const place=newPlaceTemplate({...base,id,realmId:world.id,name:node.name,note:node.intro??(node.description||base?.note||''),brief:node.description||base?.brief||'',lighting:node.lighting??base?.lighting??'',noise:node.noise??base?.noise??'',...(node.imageDataUrl!==undefined?{imageDataUrl:node.imageDataUrl,thumbDataUrl:node.imageDataUrl}:{}),...(node.audioDataUrl!==undefined?{audioDataUrl:node.audioDataUrl}:{}),...(node.images?{gallery:node.images.slice(1).map(imageDataUrl=>({imageDataUrl,thumbDataUrl:imageDataUrl}))}:{})});
  place.createdAt=base?.createdAt??world.createdAt;place.updatedAt=world.updatedAt;
  return {node,place,path:chain.join(' / ')};
 });
}
export function mapPlaceForScene(scene:CampaignScene,entries:AdventureMapPlace[]){
 if(scene.mapNodeId)return entries.find(entry=>entry.node.id===scene.mapNodeId&&entry.place.id===scene.placeId);
 const matches=entries.filter(entry=>entry.place.id===scene.placeId);return matches.length===1?matches[0]:undefined;
}
/** Rebinding preserves authored actions, actors and equipment. Only the geographic reference changes. */
export function bindSceneMapPlace(scene:CampaignScene,entry:AdventureMapPlace,useIntro=true):CampaignScene{
 const next={...scene,placeId:entry.place.id,mapNodeId:entry.node.id,usePlaceIntro:useIntro,startRoomId:''};
 if(scene.encounter){const game=structuredClone(scene.encounter);if(useIntro||scene.usePlaceIntro===true)game.definition.description=entry.place.note; if(game.definition.places.length===1)game.definition.places[0]!.name=entry.place.name;next.encounter=game;}
 return next;
}
export function chooseAdventureMap(campaign:CampaignTemplate,world:RealmTemplate,places:PlaceTemplate[]):CampaignTemplate{
 const entries=adventureMapPlaces(world,places);
 return {...campaign,mapWorldId:world.id,realmId:world.id,scenes:campaign.scenes.map(scene=>{
  // Matching IDs can preserve existing locations when a legacy world is linked for the first time.
  const matches=entries.filter(entry=>entry.place.id===scene.placeId);
  const entry=matches.length===1?matches[0]:undefined;
  if(entry){const old=places.find(p=>p.id===scene.placeId);return bindSceneMapPlace(scene,entry,scene.usePlaceIntro??(!scene.encounter?.definition.description||scene.encounter.definition.description===old?.note));}
  const {mapNodeId:_node,usePlaceIntro:_intro,...rest}=scene;return {...rest,placeId:'',startRoomId:''};
 })};
}
