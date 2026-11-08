import { EncounterGameSchema,InteractionSchema,type Interaction } from '../game/EncounterSchema';
import { newRealmTemplate,newCampaignTemplate,emptyCampaignScene,emptyCampaignPlayer } from '../library/LibrarySchema';
import { WorldMapSchema } from '../library/worldMap';
import { settlementPiece } from '../library/settlement';
import { ensureInterior,interiorRooms,addInteriorOpening,placeInteriorFurniture } from '../library/interior';
import { adventureMapPlaces } from '../library/adventureMap';
import { startPlayableCampaign } from '../session/adventureStart';
import type { IndexedDBRepository } from '../persistence/IndexedDBRepository';

/** Small vector backdrops demonstrate room images; authors can replace them in Map Studio. */
function roomBackdrop(store=false){
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><defs><linearGradient id="wall" x2="0" y2="1"><stop stop-color="${store?'#182b31':'#47332b'}"/><stop offset="1" stop-color="${store?'#405052':'#9b7050'}"/></linearGradient><radialGradient id="light"><stop stop-color="#ffc776" stop-opacity=".4"/><stop offset="1" stop-color="#ffc776" stop-opacity="0"/></radialGradient></defs><path fill="url(#wall)" d="M0 0h1600v900H0z"/><path fill="#312823" d="M0 690h1600v210H0z"/><g stroke="#211b19" stroke-width="26"><path d="M0 60h1600M200 0v690M800 0v690M1450 0v690"/></g>${store?'<g fill="#705337" stroke="#30291f" stroke-width="12"><path d="M980 450h230v240H980zM1220 500h220v190h-220zM1080 270h220v180h-220z"/></g><path fill="#192a2f" stroke="#83999c" stroke-width="12" d="M1110 100h170v150h-170z"/><path stroke="#83999c" stroke-width="10" d="M1195 100v150M1110 175h170"/>':'<ellipse fill="url(#light)" cx="1230" cy="470" rx="500" ry="450"/><path fill="#5b5146" stroke="#302923" stroke-width="18" d="M1050 330h350v360h-350z"/><path fill="#241b18" d="M1110 440q115-140 230 0v250h-230z"/><path fill="#e49c4c" d="M1160 680q-60-70 20-140-10 70 45 15 70 70 25 125z"/><path fill="#65462c" stroke="#2e241c" stroke-width="12" d="M900 720h600v45H900zM960 765v130M1450 765v130"/>'}<path fill="#000" opacity=".18" d="M0 0h1600v900H0z"/></svg>`;
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
const KEY='inn-brass-key',LEDGER='inn-guest-ledger',KEY_TAKEN='inn:key-taken',LEDGER_TAKEN='inn:ledger-taken',RETURNED='inn:returned-with-ledger';
function opportunity(id:string,label:string,text:string,effects:Interaction['success']['effects']=[],extra:Partial<Interaction>={}){
 return InteractionSchema.parse({id,label,description:text,position:'here',costsAction:false,once:true,success:{text,effects},failure:{text:'Nothing changes.'},...extra});
}
export function innVisitExample(){
 const village={...settlementPiece('settlement','',50,50),name:'Brookmere',description:'A quiet village with a travellers’ inn.'};
 const inn={...settlementPiece('inn',village.id,50,50),name:'The Copper Lantern',description:'A small village inn.',imageDataUrl:roomBackdrop()};
 let map=ensureInterior(WorldMapSchema.parse({background:'#d8e3ba',mapType:'world',nodes:[village,inn],routes:[]}),inn.id);
 const rooms=interiorRooms(map,inn.id),common=rooms.find(n=>n.name==='Common room')!,store=rooms.find(n=>n.name==='Store room')!;
 // A single entrance to the store, and an exterior door directly into the common room.
 const remove=new Set(map.routes.filter(r=>r.from===inn.id||r.to===inn.id||(r.from===store.id||r.to===store.id)&&!(r.from===common.id||r.to===common.id)).map(r=>r.id));
 map={...map,routes:map.routes.filter(r=>!remove.has(r.id)),nodes:map.nodes.map(n=>n.id===inn.id?{...n,interior:{...n.interior!,openings:n.interior!.openings.filter(o=>!remove.has(o.routeId??''))}}:n)};
 map=addInteriorOpening(map,inn.id,{x:50,y:10},'door');
 const storeDoor=map.routes.find(r=>(r.from===store.id||r.to===store.id)&&(r.from===common.id||r.to===common.id))!;
 map={...map,routes:map.routes.map(r=>r.id===storeDoor.id?{...r,access:'locked'}:r),nodes:map.nodes.map(n=>n.id===store.id?{...n,imageDataUrl:roomBackdrop(true)}:n.id===inn.id?{...n,interior:{...n.interior!,openings:n.interior!.openings.map(o=>o.routeId===storeDoor.id?{...o,access:'locked'}:o)}}:n)};
 map=placeInteriorFurniture(map,inn.id,{x:40,y:35},'table');
 map=placeInteriorFurniture(map,inn.id,{x:store.x,y:store.y},'storage');
 const descriptions:Record<string,string>={
  [inn.id]:'You stand outside The Copper Lantern in Brookmere. A sign swings above the open door. Retrieve the guest ledger from the locked store room, then return outside. The inn is empty during this short test.',
  [common.id]:'A fire warms the common room. A brass key lies on the table. Doors lead to the kitchen, guest room and locked store room.',
  [store.id]:'A cool, narrow store room holds crates and a guest ledger on a shelf. The brass key fits its door.'
 };
 for(const room of rooms)descriptions[room.id]??=room.name==='Kitchen'?'An empty kitchen has been tidied for the night. You can return to the common room.':'A quiet guest room is ready for a traveller. You can return to the common room.';
 map={...map,nodes:map.nodes.map(n=>descriptions[n.id]?{...n,intro:descriptions[n.id]}:n)};
 const realm=newRealmTemplate({name:'Brookmere · inn test',source:'player',note:'An editable map and interior for a small persistent exploration test.',worldMap:map});
 const places=adventureMapPlaces(realm,[]).map(e=>e.place),nodes=[inn,...rooms];
 const scenes=nodes.map((node,index)=>{
  const scene={...emptyCampaignScene(),name:node.id===inn.id?'Outside The Copper Lantern':node.name,placeId:node.placeId??node.id,mapNodeId:node.id,usePlaceIntro:false,position:{x:index*300,y:index?180:40}};
  const barriers=Object.fromEntries(map.routes.filter(r=>r.from===node.id||r.to===node.id).map(r=>[r.id,{id:r.id,name:r.id===storeDoor.id?'Store room door':r.from===inn.id||r.to===inn.id?'Inn entrance':map.nodes.find(n=>n.id===(r.from===node.id?r.to:r.from))!.name+' door',position:'here',open:r.access==='open',locked:r.access==='locked',shared:true,...(r.id===storeDoor.id?{keyId:KEY}:{})}]));
  const interactions:Interaction[]=node.id===common.id?[
   opportunity('inspect-key','Inspect the brass key','A small brass key has “Store” engraved on its bow.',[],{excludesFlags:[KEY_TAKEN],once:false}),
   opportunity('take-key','Take the brass key','You pick up the brass key. The table is now empty.',[{kind:'take-item',itemId:KEY},{kind:'flag',flag:KEY_TAKEN}],{excludesFlags:[KEY_TAKEN]})
  ]:node.id===store.id?[
   opportunity('read-ledger','Read the guest ledger','The ledger lists ordinary overnight guests. A pencilled note asks that it be brought outside.',[],{excludesFlags:[LEDGER_TAKEN],once:false}),
   opportunity('take-ledger','Take the guest ledger','You take the guest ledger from the shelf. Return outside with it.',[{kind:'take-item',itemId:LEDGER},{kind:'flag',flag:LEDGER_TAKEN}],{excludesFlags:[LEDGER_TAKEN]})
  ]:[];
  const game=EncounterGameSchema.parse({definition:{id:scene.id,title:scene.name,description:descriptions[node.id],descriptions:node.id===common.id?[{requiresFlags:[KEY_TAKEN],text:'A fire warms the common room. The table where you found the brass key is empty. The other rooms remain where you left them.'}]:node.id===store.id?[{requiresFlags:[LEDGER_TAKEN],text:'The cool store room is quiet. The shelf where you found the guest ledger is empty.'}]:[],playerId:'player',rules:{id:'d100'},places:[{id:'here',name:scene.name,x:0,y:0}],connections:[],sightLines:[],weapons:[],items:[{id:KEY,name:'Brass key',description:'A small brass key with “Store” engraved on its bow. It fits the store room door at The Copper Lantern.'},{id:LEDGER,name:'Guest ledger',description:'The Copper Lantern’s guest ledger, taken from the shelf in the store room.',readableContent:'The ledger lists ordinary overnight guests. A pencilled note asks that it be brought outside.'}],hostilities:[],interactions},state:{version:1,sceneId:scene.id,revision:0,phase:'exploration',round:0,cursor:0,actors:{player:{id:'player',name:'Traveller',team:'travellers',control:'player',position:'here',hp:20,maxHp:20,stats:{Observation:60},weapons:[]}},barriers,itemLocations:node.id===common.id?{[KEY]:'here'}:node.id===store.id?{[LEDGER]:'here'}:{}},history:[]});
  return {...scene,encounter:game};
 });
 const sceneFor=(id:string)=>scenes.find(s=>s.mapNodeId===id)!;
 const links=map.routes.flatMap(route=>[[route.from,route.to],[route.to,route.from]].flatMap(([from,to])=>{
  const source=sceneFor(from!),target=sceneFor(to!);if(!source||!target)return [];
  const base={id:crypto.randomUUID(),fromSceneId:source.id,toSceneId:target.id,label:to===inn.id?'Leave the inn':from===inn.id?'Enter the inn':'Go to '+target.name.toLowerCase(),requiresFlags:[] as string[],requiresAbsentFlags:[] as string[],requiresOpenBarriers:[route.id],setsFlags:[] as string[]};
  return to===inn.id?[{...base,requiresAbsentFlags:[LEDGER_TAKEN]},{...base,id:crypto.randomUUID(),requiresFlags:[LEDGER_TAKEN],setsFlags:[RETURNED]}]:[base];
 }));
 const campaign=newCampaignTemplate({name:'The Copper Lantern · rooms & return visits',realmId:realm.id,mapWorldId:realm.id,placeIds:places.map(p=>p.id),player:{...emptyCampaignPlayer(),name:'Traveller',stats:{Observation:'60'}},scenes,sceneLinks:links,goal:{title:'Retrieve the guest ledger from the store room and return outside.',requiresFlags:[RETURNED]}});
 return {realm,campaign,places,storeDoorId:storeDoor.id,keyId:KEY,ledgerId:LEDGER};
}
/** Explicit example creation never replaces an existing authored map or saved playthrough. */
export async function installInnExample(repo:IndexedDBRepository){
 const built=innVisitExample();await repo.saveRealm(built.realm);for(const place of built.places)await repo.savePlace(place);await repo.saveCampaign(built.campaign);return built;
}
export async function startInnExample(repo:IndexedDBRepository,id:string,model?:string){
 const built=await installInnExample(repo);if(model)built.campaign.model=model;
 return startPlayableCampaign(built.campaign,built.campaign.scenes[0]!,built.places,id,[built.realm]);
}
