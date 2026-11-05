import { InteractionSchema,type EncounterGame } from '../game/EncounterSchema';
import type { CampaignTemplate } from '../library/LibrarySchema';
import type { Session } from '../state/StateSchema';

export const MESSENGER_EXAMPLE_ID='missing-messenger';
export const MESSENGER_ASK='Edda points to the north path. “He was going to the old watchtower. Start there.” You now know where to look.';
export const MESSENGER_NOTE='The messenger’s note says he stopped to help an injured merchant and will return at dawn. You have learned why he is late.';
type Parts={square:EncounterGame;tower:EncounterGame};
function identify(games:EncounterGame[]):Parts|undefined{
 if(games.length!==2)return;
 const square=games.find(g=>g.definition.title==='A missing messenger'&&g.definition.interactions.some(a=>a.label==='Ask Edda about the messenger'&&a.success.text===MESSENGER_ASK)),tower=games.find(g=>g.definition.title==='A note at the watchtower'&&g.definition.interactions.some(a=>a.label==='Read the note'&&a.success.text===MESSENGER_NOTE));
 if(square&&tower)return {square,tower};
}
function ending(parts:Parts){
 const ask=parts.square.definition.interactions.find(a=>a.success.text===MESSENGER_ASK)!,read=parts.tower.definition.interactions.find(a=>a.success.text===MESSENGER_NOTE)!;
 const readFlag=read.success.effects.find(e=>e.kind==='flag')?.flag;
 if(!readFlag||!ask.counterpartyId)return;
 const id=`report:${ask.id}`,done=`done:${id}`;
 return {askId:ask.id,readFlag,report:InteractionSchema.parse({id,label:'Tell Edda what the note says',description:'Tell Edda why the messenger is late. Read the note at the watchtower first.',counterpartyId:ask.counterpartyId,dialogueMode:'report',dialogueTopics:['note','message','messenger','meddelandet','budbäraren'],requiresFlags:[readFlag],success:{text:'Edda lets out a relieved breath. “Helping an injured merchant — that sounds like him. Thank you for finding out. Now we know to expect him at dawn.” You have brought the news back to Edda.',effects:[{kind:'flag',flag:done}]},failure:{text:'You have not yet told Edda what you learned.',effects:[]}}),goal:{title:'Bring the messenger’s news back to Edda',requiresFlags:[done]}};
}
function patch(game:EncounterGame,update:NonNullable<ReturnType<typeof ending>>){
 const ask=game.definition.interactions.find(a=>a.id===update.askId);if(!ask)return;
 if(!ask.excludesFlags.includes(update.readFlag))ask.excludesFlags.push(update.readFlag);
 if(!game.definition.interactions.some(a=>a.id===update.report.id))game.definition.interactions.push(structuredClone(update.report));
}
/** Explicit content upgrade for this bundled sample; never rewrites player progress or unrelated adventures. */
export function upgradeMissingMessengerCampaign(original:CampaignTemplate):CampaignTemplate{
 if((original.exampleVersion??0)>=2||original.exampleId&&original.exampleId!==MESSENGER_EXAMPLE_ID)return original;
 const parts=identify(original.scenes.flatMap(s=>s.encounter?[s.encounter]:[]));if(!parts)return original;
 const update=ending(parts);if(!update)return original;
 const next=structuredClone(original);for(const scene of next.scenes)if(scene.encounter)patch(scene.encounter,update);
 next.goal??=update.goal;next.exampleId=MESSENGER_EXAMPLE_ID;next.exampleVersion=2;return next;
}
export function upgradeMissingMessengerSession(original:Session):Session{
 const run=original.adventure;
 if(!run||(run.exampleVersion??0)>=2||run.exampleId&&run.exampleId!==MESSENGER_EXAMPLE_ID)return original;
 const parts=identify(run.scenes.map(s=>s.game));if(!parts)return original;
 const update=ending(parts);if(!update)return original;
 const next=structuredClone(original),upgraded=next.adventure!;
 for(const scene of upgraded.scenes)patch(scene.game,update);
 for(const game of Object.values(upgraded.savedScenes))patch(game,update);
 if(next.encounter)patch(next.encounter,update);
 upgraded.goal??=update.goal;upgraded.exampleId=MESSENGER_EXAMPLE_ID;upgraded.exampleVersion=2;return next;
}
