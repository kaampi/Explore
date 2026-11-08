import { AdventureRunSchema,AdventureTransitionSchema,type AdventureRun,type AdventureTransition } from './AdventureSchema';
import { EncounterGameSchema,type EncounterGame } from './EncounterSchema';
import { validateEncounter } from './EncounterEngine';
import type { Session } from '../state/StateSchema';
export function validateAdventure(run:AdventureRun){
 const ids=run.scenes.map(scene=>scene.id);
 if(new Set(ids).size!==ids.length||!ids.includes(run.currentSceneId)||new Set(run.links.map(l=>l.id)).size!==run.links.length)throw Error('The adventure needs unique scenes, connections and a valid starting scene.');
 const playerId=run.scenes[0]!.game.definition.playerId;
 for(const scene of run.scenes){validateEncounter(scene.game);if(scene.game.definition.id!==scene.id||scene.game.definition.playerId!==playerId)throw Error('Every scene must use its own ID and the same player.');}
 if(run.geography)for(const scene of run.scenes){const node=run.geography.map.nodes.find(n=>n.id===scene.mapNodeId);if(!node||node.isJunction||(node.placeId??node.id)!==scene.placeId)throw Error('Every mapped scene must refer to its pinned map place.');}
 for(const [id,game] of Object.entries(run.savedScenes)){if(!ids.includes(id)||game.definition.id!==id||game.definition.playerId!==playerId)throw Error('A saved scene must belong to this adventure and use the same player.');validateEncounter(game);}
 for(const [id,actor] of Object.entries(run.actors))if(actor.id!==id)throw Error('A persistent character must use its own ID.');
 for(const link of run.links)if(!ids.includes(link.fromSceneId)||!ids.includes(link.toSceneId)||link.fromSceneId===link.toSceneId)throw Error('A connection must lead to another existing scene.');
 for(const link of run.links){const from=run.scenes.find(s=>s.id===link.fromSceneId)!;for(const id of link.requiresOpenBarriers??[])if(!from.game.state.barriers[id])throw Error('A connection requires an unknown door.');}
 const shared=new Map<string,string|undefined>();for(const scene of run.scenes)for(const barrier of Object.values(scene.game.state.barriers))if(barrier.shared){if(shared.has(barrier.id)&&shared.get(barrier.id)!==barrier.keyId)throw Error('A shared door must use the same key.');shared.set(barrier.id,barrier.keyId);}
 for(const [id,barrier] of Object.entries(run.barriers??{}))if(id!==barrier.id||!barrier.shared||!shared.has(id)||shared.get(id)!==barrier.keyId)throw Error('An unknown persistent door cannot be restored.');
 return run;
}
export function adventureBarriers(session:Session){return {...session.adventure?.barriers,...session.encounter?.state.barriers};}
export function adventureOptions(session:Session){
 const run=session.adventure;if(!run)return [];
 const doors=adventureBarriers(session);
 const flags=new Set([...session.storyFlags,...(session.encounter?.state.flags??[])]);
 return run.links.filter(link=>link.fromSceneId===run.currentSceneId&&link.requiresFlags.every(f=>flags.has(f))&&link.requiresAbsentFlags.every(f=>!flags.has(f))&&(link.requiresOpenBarriers??[]).every(id=>doors[id]?.open&&!doors[id]?.locked&&!doors[id]?.blocked)).map(link=>({id:link.id,label:link.label||run.scenes.find(s=>s.id===link.toSceneId)!.name}));
}
export function adventureCompleted(session:Session){
 const goal=session.adventure?.goal,flags=new Set([...session.storyFlags,...(session.encounter?.state.flags??[])]);
 return !!goal&&goal.requiresFlags.every(flag=>flags.has(flag));
}
/** Pure, revision-checked transition. The live encounter is the latest truth for the departing scene. */
export function advanceAdventure(session:Session,raw:AdventureTransition){
 const request=AdventureTransitionSchema.parse(raw),run=validateAdventure(AdventureRunSchema.parse(structuredClone(session.adventure))),current=session.encounter;
 if(!current||current.definition.id!==run.currentSceneId)throw Error('This adventure has no active scene.');
 if(run.transitions.some(t=>t.id===request.id))throw Error('This connection has already been taken.');
 if(request.expectedStateVersion!==session.stateVersion)throw Error('The adventure changed. Choose a connection again.');
 if(current.state.phase==='combat'||current.state.phase==='defeated'||current.state.actors[current.definition.playerId]!.hp===0)throw Error('Resolve the current encounter before continuing.');
 const link=run.links.find(l=>l.id===request.linkId);if(!link||!adventureOptions(session).some(l=>l.id===link.id))throw Error('That connection is not available from this scene.');
 const target=run.scenes.find(s=>s.id===link.toSceneId)!;
 run.savedScenes[run.currentSceneId]=structuredClone(current);
 run.barriers??={};for(const [id,b] of Object.entries(current.state.barriers))if(b.shared)run.barriers[id]=structuredClone(b);
 for(const actor of Object.values(current.state.actors))run.actors[actor.id]=structuredClone(actor);
 const game=EncounterGameSchema.parse(structuredClone(run.savedScenes[target.id]??target.game));
 const owners=new Map(Object.entries(run.actors).flatMap(([id,a])=>a.inventory.map(item=>[item,id] as const)));
 for(const [id,authored] of Object.entries(game.state.actors)){
  const carried=run.actors[id];
  if(carried)game.state.actors[id]={...structuredClone(carried),position:authored.position,actionsLeft:game.definition.rules.actionsPerTurn,movesLeft:game.definition.rules.movesPerTurn,defending:false};
  game.state.actors[id]!.inventory=game.state.actors[id]!.inventory.filter(item=>!owners.has(item)||owners.get(item)===id);
 }
 for(const item of Object.keys(game.state.itemLocations))if(owners.has(item))delete game.state.itemLocations[item];
 for(const [id,b] of Object.entries(game.state.barriers)){const shared=run.barriers[id];if(b.shared&&shared)game.state.barriers[id]={...b,open:shared.open,locked:shared.locked,blocked:shared.blocked};}
 const flags=[...new Set([...session.storyFlags,...current.state.flags,...link.setsFlags])];
 game.state.flags=[...new Set([...game.state.flags,...flags])];
 validateEncounter(game);
 const from=run.currentSceneId;run.currentSceneId=target.id;run.transitions.push({id:request.id,linkId:link.id,from,to:target.id,stateVersion:session.stateVersion+1});
 return {run,game,flags:game.state.flags,target,label:link.label||target.name};
}
export function adventureHistoryEntry(session:Session,turn:{actionId?:string;actionSceneId?:string},index:number){
 if(!session.adventure)return session.encounter?.history[Math.floor((index-1)/2)];
 if(!turn.actionId)return undefined;
 const game=turn.actionSceneId===session.adventure.currentSceneId?session.encounter:session.adventure.savedScenes[turn.actionSceneId??''];
 return game?.history.find(entry=>entry.id===turn.actionId);
}
/** Shared equipment definitions keep carried weapons usable after a scene change. */
export function unifyAdventureEquipment(run:AdventureRun){
 const weapons=new Map<string,EncounterGame['definition']['weapons'][number]>(),items=new Map<string,EncounterGame['definition']['items'][number]>();
 for(const scene of run.scenes){for(const weapon of scene.game.definition.weapons){const old=weapons.get(weapon.id);if(old&&JSON.stringify(old)!==JSON.stringify(weapon))throw Error('A shared weapon must have the same rules in every scene.');weapons.set(weapon.id,weapon);}for(const item of scene.game.definition.items)items.set(item.id,{...items.get(item.id),...item});}
 for(const scene of run.scenes){scene.game.definition.weapons=[...weapons.values()];scene.game.definition.items=[...items.values()];}
 return validateAdventure(run);
}
