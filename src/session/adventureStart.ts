import type { CampaignTemplate,CampaignScene,PlaceTemplate,RealmTemplate } from '../library/LibrarySchema';
import { adventureMapPlaces,bindSceneMapPlace,mapPlaceForScene } from '../library/adventureMap';
import { AdventureRunSchema } from '../game/AdventureSchema';
import { unifyAdventureEquipment } from '../game/AdventureEngine';
import { createSessionFromSetup } from './createSession';
import { parseSession } from '../state/StateSchema';
export function startPlayableCampaign(campaign:CampaignTemplate,scene:CampaignScene,places:PlaceTemplate[],id:string,worlds:RealmTemplate[]=[]){
 const world=campaign.mapWorldId?worlds.find(w=>w.id===campaign.mapWorldId):undefined;
 if(campaign.mapWorldId&&!world?.worldMap)throw Error('The adventure’s world map is unavailable. Choose a saved map in Storyboard Editor.');
 const mapped=campaign.mapWorldId?adventureMapPlaces(world,places):undefined;
 const scenes=campaign.scenes.map(s=>{
  const entry=mapped?mapPlaceForScene(s,mapped):undefined;
  if(mapped&&!entry)throw Error(`Choose an existing map place for “${s.name||'Untitled scene'}”. The previous place may have been removed.`);
  const place=entry?.place??places.find(p=>p.id===s.placeId),bound=entry?bindSceneMapPlace(s,entry,s.usePlaceIntro===true):s;
  if(!bound.encounter||!place)throw Error(`Choose a place and make “${s.name||'Untitled scene'}” playable before testing the adventure.`);
  if(mapped&&!bound.encounter.definition.description.trim())throw Error(`Add an arrival introduction for “${s.name||'Untitled scene'}” in the scene or its map place.`);
  return {id:s.id,name:s.name,placeId:place.id,location:place.name,...(entry?{mapNodeId:entry.node.id}:{}),game:structuredClone(bound.encounter)};
 });
 const run=unifyAdventureEquipment(AdventureRunSchema.parse({version:1,campaignId:campaign.id,title:campaign.name,currentSceneId:scene.id,scenes,links:campaign.sceneLinks,goal:campaign.goal,exampleId:campaign.exampleId,exampleVersion:campaign.exampleVersion,...(world?.worldMap?{geography:{worldId:world.id,name:world.name,updatedAt:world.updatedAt,map:structuredClone(world.worldMap)}}:{})})),current=run.scenes.find(s=>s.id===scene.id);
 if(!current)throw Error('The starting scene is missing.');
 const game=structuredClone(current.game);game.state.flags=[...new Set([...game.state.flags,...campaign.storyFlags])];
 const session=createSessionFromSetup({location:current.location,placeId:current.placeId,placeNote:game.definition.description,lighting:'',noise:'',music:false,characters:[],campaignId:campaign.id,sceneId:scene.id,ruleset:{name:'Adventure · d100',attributes:[]},...(campaign.model?{model:campaign.model}:{}),playerIdentity:{name:campaign.player?.name||'Traveller',...(campaign.player?.portraitDataUrl?{portraitDataUrl:campaign.player.portraitDataUrl}:{}),stats:Object.fromEntries(Object.entries(game.state.actors[game.definition.playerId]!.stats).map(([k,v])=>[k,String(v)]))}},id);
 session.adventure=run;session.encounter=game;session.storyFlags=[...game.state.flags];session.conversation=[{turn:0,role:'character',toldBy:'narrator',content:game.definition.description,adventureSceneId:scene.id}];
 if(world){session.scene!.realm=world.name;session.spatialPlaces=(mapped??[]).map(entry=>({id:entry.place.id,name:entry.place.name,kind:entry.node.kind}));if(session.player)session.player.locationRef={placeId:current.placeId,side:'at'};}
 return parseSession(session);
}
