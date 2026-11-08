import { EncounterGameSchema,InteractionSchema,type EncounterGame } from '../game/EncounterSchema';
import { MESSENGER_ASK,MESSENGER_NOTE,upgradeMissingMessengerCampaign } from '../scenarios/missingMessenger';
import { emptyCampaignScene,emptyCampaignPlayer,newCampaignTemplate,newRealmTemplate,newPlaceTemplate,newCharacterTemplate,newObjectTemplate,type CampaignTemplate,type CampaignScene,type PlaceTemplate,type CharacterTemplate,type ObjectTemplate } from './LibrarySchema';
export function newOpportunity(label='New action',result='Describe what the player discovers.'){
 const id=crypto.randomUUID();return InteractionSchema.parse({id,label,description:'',success:{text:result,effects:[{kind:'flag',flag:`done:${id}`}]},failure:{text:'The attempt does not succeed.',effects:[{kind:'flag',flag:`failed:${id}`}]}});
}
/** Starter scene uses the existing interaction engine. The editor adds no AI authority. */
export function makePlayableScene(campaign:CampaignTemplate,scene:CampaignScene,places:PlaceTemplate[],characters:CharacterTemplate[],objects:ObjectTemplate[]):CampaignScene{
 const place=places.find(p=>p.id===scene.placeId),stats=Object.fromEntries(Object.entries(campaign.player?.stats??{}).filter(([,v])=>v.trim()!==''&&Number.isFinite(Number(v))).map(([id,v])=>[id,Math.max(0,Math.min(100,Number(v)))]));
 const carried=objects.filter(o=>campaign.objectIds.includes(o.id)&&o.startingLocation?.kind==='player');
 const actors:Record<string,unknown>={player:{id:'player',name:campaign.player?.name||'Traveller',team:'player',control:'player',position:'here',hp:20,maxHp:20,weapons:[],stats:Object.keys(stats).length?stats:{Observation:60,Persuasion:60},inventory:carried.map(o=>o.id)}};
 for(const pick of scene.people){const person=characters.find(c=>c.id===pick.characterId);if(person)actors[`npc:${person.id}`]={id:`npc:${person.id}`,name:person.name,team:'residents',control:'npc',position:'here',hp:12,maxHp:12,weapons:[],stats:{},inventory:objects.filter(o=>scene.objectIds.includes(o.id)&&o.startingLocation?.kind==='character'&&o.startingLocation.characterId===person.id).map(o=>o.id)};}
 const game=EncounterGameSchema.parse({definition:{id:scene.id,title:scene.name||'New scene',description:scene.encounter?.definition.description||place?.note||'Describe what the player sees on arrival.',playerId:'player',rules:{id:'d100'},places:[{id:'here',name:place?.name||scene.name||'Here',x:0,y:0}],connections:[],sightLines:[],weapons:[],items:objects.filter(o=>campaign.objectIds.includes(o.id)||scene.objectIds.includes(o.id)).map(o=>({id:o.id,name:o.name,description:o.note,...(o.readableContent?{readableContent:o.readableContent}:{}),...(o.imageDataUrl?{imageDataUrl:o.imageDataUrl}:{})})),hostilities:[],interactions:scene.encounter?.definition.interactions??[]},state:{version:1,sceneId:scene.id,revision:0,phase:'exploration',round:0,cursor:0,actors,barriers:{},flags:[],attempts:[]},history:[]});
 return {...scene,encounter:game};
}
export function adventureFacts(campaign:CampaignTemplate){
 const facts=new Map<string,string>();for(const scene of campaign.scenes)for(const action of scene.encounter?.definition.interactions??[])for(const [outcome,value] of [['succeeded',action.success],['failed',action.failure]] as const)if(outcome==='succeeded'||action.check)for(const effect of value.effects)if(effect.kind==='flag')facts.set(effect.flag,`${action.label} · ${outcome}`);
 for(const flag of campaign.storyFlags)if(!facts.has(flag))facts.set(flag,flag);
 return [...facts].map(([id,label])=>({id,label}));
}
export function connectedAdventureExample(){
 const realm=newRealmTemplate({name:'Brookmere',note:'A small village and its surroundings.',source:'player'}),square=newPlaceTemplate({name:'The village square',realmId:realm.id,note:'A messenger has not returned. Edda waits beside the village well.'}),tower=newPlaceTemplate({name:'The old watchtower',realmId:realm.id,note:'Grass bends along the path to an abandoned watchtower. A fresh note is tucked under a loose stone.'}),edda=newCharacterTemplate({name:'Edda',personality:'A careful village archivist who knows the missing messenger.'}),key=newObjectTemplate({name:'Brass key',source:'player',tags:[],note:'The traveller’s own worn brass key.',startingLocation:{kind:'player'}});
 const first={...emptyCampaignScene(),name:'A missing messenger',placeId:square.id,position:{x:35,y:65},people:[{characterId:edda.id,position:'By the well',mood:'concerned',clothing:'',holding:'',trust:'20',familiarity:'10',tension:'0'}]};
 const second={...emptyCampaignScene(),name:'A note at the watchtower',placeId:tower.id,position:{x:340,y:65}};
 const campaign=newCampaignTemplate({name:'The missing messenger · connected preview',realmId:realm.id,placeIds:[square.id,tower.id],player:{...emptyCampaignPlayer(),name:'Traveller',stats:{Observation:'60',Persuasion:'60'}},people:[{characterId:edda.id,stats:{}}],objectIds:[key.id],scenes:[first,second]});
 campaign.scenes=campaign.scenes.map(scene=>makePlayableScene(campaign,scene,[square,tower],[edda],[key]));
 const ask=newOpportunity('Ask Edda about the messenger',MESSENGER_ASK);
 ask.counterpartyId=`npc:${edda.id}`;
 ask.dialogueTopics=['messenger','budbäraren'];
 const read=newOpportunity('Read the note',MESSENGER_NOTE);
 campaign.scenes[0]!.encounter!.definition.interactions=[ask];campaign.scenes[1]!.encounter!.definition.interactions=[read];
 const flag=(game:EncounterGame)=>game.definition.interactions[0]!.success.effects.find(e=>e.kind==='flag')!.flag;
 campaign.sceneLinks=[{id:crypto.randomUUID(),fromSceneId:first.id,toSceneId:second.id,label:'Follow the lead to the watchtower',requiresFlags:[flag(campaign.scenes[0]!.encounter!)],requiresAbsentFlags:[],setsFlags:[]},{id:crypto.randomUUID(),fromSceneId:second.id,toSceneId:first.id,label:'Return to the village',requiresFlags:[flag(campaign.scenes[1]!.encounter!)],requiresAbsentFlags:[],setsFlags:[]}];
 return {campaign:upgradeMissingMessengerCampaign(campaign),places:[square,tower],characters:[edda],objects:[key],realm};
}
