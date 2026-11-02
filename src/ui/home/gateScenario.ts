import mona from '../../library/examples/mona.json';
import playerPortrait from '../../library/examples/gate-player-portrait.json';
import { newCharacterTemplate,newPlaceTemplate,newRulesetTemplate } from '@library/LibrarySchema';
import { quickCharacterSession } from './quickStart';
export function gateScenario(sessionId:string,model?:string){
 const guard=newCharacterTemplate({name:'Mona',familyName:'Sanchez',portraitDataUrl:mona.portraitDataUrl,personality:'A professional gate guard. Cautious but fair. The gate is closed after dusk. A convincing explanation may earn entry; refusal leaves the traveller safely outside. Respect the engine-resolved check. Do not reroll or invent a fight.',position:'The city gate',mood:'watchful'});
 const place=newPlaceTemplate({realmId:'gate-test',name:'The city gate',note:'A traveller stands outside a closed city gate at dusk. Mona, the gate guard, is within speaking distance. Goal: persuade Mona to allow entry. No combat, inventory puzzle or other characters. This is a self-contained test.',brief:'Outside the closed city gate at dusk; Mona guards entry.'});
 const ruleset=newRulesetTemplate({name:'Gate test · d100',source:'example',attributes:[{id:'persuasion',name:'Persuasion',kind:'number',min:0,max:100,description:'Ability to present a convincing request.',highMeaning:'Expresses a clear, convincing argument.',lowMeaning:'Struggles to persuade.',midMeaning:'An ordinary conversationalist.',options:[],maxShift:0}]});
 const session=quickCharacterSession(guard,sessionId,{place,ruleset,...(model?{model}:{})});
 if(session.player){session.player.name='Traveller';session.player.portraitDataUrl=playerPortrait;session.player.stats={persuasion:'60'};}
 session.conversation=[{turn:0,role:'character',speaker:Object.keys(session.characters)[0]!,content:'Mona rests a hand on the closed gate. "The city is closed for the night. What brings you here?"'}];
 return session;
}
