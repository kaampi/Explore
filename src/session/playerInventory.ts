import type { Session } from '../state/StateSchema';
import type { EncounterAction } from '../game/EncounterSchema';
import { actionBlock } from '../game/EncounterEngine';
import { actionLabel } from '../game/narration';
import { effectiveObjectLocation } from '../library/objectLocation';

export type InventoryEntry={key:string;id:string;name:string;kind:'item'|'weapon'|'ammunition'|'resource';quantity:number;description?:string|undefined;readableContent?:string|undefined;imageDataUrl?:string|undefined;container?:string|undefined;facts?:Array<{label:string;value:string}>};
const nameOf=(id:string)=>id.replace(/[-_]/g,' ').replace(/^./,c=>c.toUpperCase());
/** A read-only view of canonical possession. Opening the bag never grants or duplicates anything. */
export function playerInventory(session:Session):InventoryEntry[]{
 const game=session.encounter;
 if(game){
  const {definition:d,state:s}=game,player=s.actors[d.playerId]!;
  return [
   ...player.inventory.map(id=>{const item=d.items.find(i=>i.id===id);return {key:'item:'+id,id,name:item?.name??nameOf(id),kind:'item' as const,quantity:1,description:item?.description,readableContent:item?.readableContent,imageDataUrl:item?.imageDataUrl};}),
   ...player.weapons.map(id=>{const weapon=d.weapons.find(w=>w.id===id);return {key:'weapon:'+id,id,name:weapon?.name??nameOf(id),kind:'weapon' as const,quantity:1,description:weapon?.kind==='ranged'?'A ranged weapon.':'A melee weapon.',facts:weapon?[{label:'Skill',value:weapon.skill},{label:'Base damage',value:String(weapon.damage)},...(weapon.range!==undefined?[{label:'Range',value:weapon.range+' m'}]:[])]:[]};}),
   ...Object.entries(player.ammunition).map(([id,quantity])=>({key:'ammunition:'+id,id,name:(d.weapons.find(w=>w.id===id)?.name??nameOf(id))+' ammunition',kind:'ammunition' as const,quantity,description:'Remaining ammunition for this weapon.'})),
   ...Object.entries(player.resources).map(([id,quantity])=>({key:'resource:'+id,id,name:nameOf(id),kind:'resource' as const,quantity}))
  ];
 }
 if(session.gateEncounter){const s=session.gateEncounter;return [
  {key:'weapon:sword',id:'sword',name:'Sword',kind:'weapon',quantity:1,description:'Your melee weapon.'},
  {key:'weapon:bow',id:'bow',name:'Bow',kind:'weapon',quantity:1,description:'Your ranged weapon.'},
  {key:'item:lockpicks',id:'lockpicks',name:'Lockpicks',kind:'item',quantity:1,description:'Tools for attempting to pick the gate lock.'},
  ...(s.keyOwner==='player'?[{key:'item:iron-key',id:'iron-key',name:'Iron key',kind:'item' as const,quantity:1,description:'The iron key taken from Mona. It fits the city gate.'}]:[]),
  {key:'ammunition:bow',id:'bow',name:'Arrows',kind:'ammunition',quantity:s.arrows}
 ];}
 const objects=session.objects??[];
 return objects.filter(object=>{
  if(effectiveObjectLocation(object,objects)?.kind!=='player')return false;
  let location=object.startingLocation;const seen=new Set<string>();
  while(location?.kind==='object'){if(seen.has(location.objectId))return false;const parentId=location.objectId;seen.add(parentId);const parent=objects.find(o=>o.id===parentId);if(!parent||parent.openable&&parent.isOpen!==true)return false;location=parent.startingLocation;}
  return true;
 }).map(object=>({key:'item:'+object.id,id:object.id,name:object.name,kind:'item',quantity:1,description:object.note,readableContent:object.readableContent,...(object.startingLocation?.kind==='object'?{container:objects.find(o=>o.id===(object.startingLocation as {objectId:string}).objectId)?.name}:{})}));
}
export function inventoryActions(session:Session,entry:InventoryEntry){
 const game=session.encounter;if(!game||entry.kind!=='item'||!game.state.actors[game.definition.playerId]!.inventory.includes(entry.id))return [];
 const {definition:d,state:s}=game,choices:EncounterAction[]=[];
 for(const door of Object.values(s.barriers))if(door.keyId===entry.id&&door.locked)choices.push({kind:'interact',barrierId:door.id,operation:'unlock'});
 for(const interaction of d.interactions){
  if(interaction.once&&s.attempts.includes(interaction.id)||interaction.requiresFlags.some(f=>!s.flags.includes(f))||interaction.excludesFlags.some(f=>s.flags.includes(f)))continue;
  if([...interaction.success.effects,...interaction.failure.effects].some(effect=>effect.kind==='transfer-item'&&effect.from===d.playerId&&effect.itemId===entry.id))choices.push({kind:'interaction',interactionId:interaction.id});
 }
 return choices.map(action=>({action,label:actionLabel(d,s,action),blocked:actionBlock(d,s,action)}));
}
