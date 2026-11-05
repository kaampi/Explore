import { CombatBeatSchema,type CombatBeat } from '../game/EncounterSchema';
import { gateCombatState } from '../scenarios/gateWorld';
import { output,recordCombatBeat } from '../game/EncounterEngine';
import { percentileRules } from '../game/rules';
import { z } from 'zod';

import { GATE_POSITIONS,POSITION_NAMES,isNeighbour,gateLineOfSight,type GatePosition } from './gateGeometry';
import { startGateCombat,finishGatePlayerTurn,enemyState,enemyActive,combatFinished,gateAttackTarget,gateAttack,breakGateSurrender,type EnemyTurn } from './gateCombat';
export { GATE_POSITIONS,POSITION_NAMES,type GatePosition } from './gateGeometry';
const InitiativeSchema=z.object({rolls:z.object({player:z.number().int().min(1).max(100),mona:z.number().int().min(1).max(100).optional(),archer:z.number().int().min(1).max(100).optional()}),order:z.array(z.enum(['player','mona','archer'])).min(1).max(3)}).refine(v=>v.order.includes('player')&&new Set(v.order).size===v.order.length&&v.order.every(id=>v.rolls[id]!==undefined));
const EnemyTurnSchema=z.object({actor:z.enum(['mona','archer']),round:z.number().int().nonnegative(),from:z.enum(GATE_POSITIONS),to:z.enum(GATE_POSITIONS),action:z.enum(['attack','defend','retreat','surrender','open','unlock','rearm']),weapon:z.enum(['sword','bow','dagger']).optional()});
const CheckSchema = z.object({actor:z.string(),stat:z.string(),roll:z.number().int().min(1).max(100),target:z.number().int().min(0).max(100),degree:z.enum(['exceptional','success','failure','severe']),damage:z.number().int().nonnegative().optional(),round:z.number().int().nonnegative().optional()});
export type GateCheck = z.infer<typeof CheckSchema>;
export const GateEncounterSchema = z.object({
  version:z.literal(1), revision:z.number().int().nonnegative(), phase:z.enum(['exploration','combat','entered','escaped','defeated']),
  position:z.enum(GATE_POSITIONS), hp:z.number().int().min(0).max(20), monaHp:z.number().int().min(0).max(16), archerHp:z.number().int().min(0).max(10),
  monaPosition:z.enum(GATE_POSITIONS).default('gate'),archerPosition:z.enum(GATE_POSITIONS).default('wall'),
  monaDefending:z.boolean().default(false),archerDefending:z.boolean().default(false),
  monaDisposition:z.enum(['active','surrendered','fled']).default('active'),archerDisposition:z.enum(['active','surrendered','fled']).default('active'),
  monaWeaponReady:z.boolean().optional(),archerWeaponReady:z.boolean().optional(),
  archerArrows:z.number().int().min(0).max(6).default(6),initiative:InitiativeSchema.optional(),
  gateLocked:z.boolean(), gateOpen:z.boolean(), admitted:z.boolean(), suspicious:z.number().int().min(0).max(3),
  posternFound:z.boolean(), keyOwner:z.enum(['mona','player']), arrows:z.number().int().min(0).max(4),
  wagonTipped:z.boolean().default(false),
  actionUsed:z.boolean(), moveUsed:z.boolean(), defending:z.boolean(), round:z.number().int().nonnegative(),
  attempts:z.array(z.string()), flags:z.array(z.string()),
  history:z.array(z.object({id:z.string(),revision:z.number().int(),action:z.string(),combat:z.boolean().optional(),intention:z.string().max(1000).optional(),speaker:z.enum(['mona','narrator']).optional(),enemyTurns:z.array(EnemyTurnSchema).optional(),renewedSurrender:z.enum(['mona','archer']).optional(),initiative:InitiativeSchema.optional(),text:z.string(),checks:z.array(CheckSchema),presentation:z.array(CombatBeatSchema).optional()}))
});
export type GateEncounter = z.infer<typeof GateEncounterSchema>;
export const GateActionSchema = z.discriminatedUnion('kind',[
  z.object({kind:z.literal('look')}),z.object({kind:z.literal('finish')}),z.object({kind:z.literal('inspect-gate')}),z.object({kind:z.literal('search-wall')}),
  z.object({kind:z.literal('persuade')}),z.object({kind:z.literal('force')}),z.object({kind:z.literal('pick-lock')}),
  z.object({kind:z.literal('take-key')}),z.object({kind:z.literal('unlock')}),z.object({kind:z.literal('open')}),
  z.object({kind:z.literal('tip-wagon')}),z.object({kind:z.literal('clear-wagon')}),
  z.object({kind:z.literal('postern')}),z.object({kind:z.literal('defend')}),z.object({kind:z.literal('end-turn')}),
  z.object({kind:z.literal('move'),to:z.enum(GATE_POSITIONS)}),
  z.object({kind:z.literal('attack'),target:z.enum(['mona','archer']),weapon:z.enum(['sword','bow'])}),
  z.object({kind:z.literal('say'),text:z.string().trim().min(1).max(1000)})
]);
export type GateAction = z.infer<typeof GateActionSchema>;
export type GateRequest = {id:string;expectedRevision:number;action:GateAction;intention?:string};
export function newGateEncounter():GateEncounter{return GateEncounterSchema.parse({version:1,revision:0,phase:'exploration',position:'gate',hp:20,monaHp:16,archerHp:10,gateLocked:true,gateOpen:false,admitted:false,suspicious:0,posternFound:false,keyOwner:'mona',arrows:4,actionUsed:false,moveUsed:false,defending:false,round:0,attempts:[],flags:[],history:[]});}
function describeEnemy(s:GateEncounter,id:'mona'|'archer'){
 const a=enemyState(s,id),name=id==='mona'?'Mona':'The archer';
 return a.disposition==='fled'?name+' has left the fight.':name+(a.hp===0?' lies incapacitated ':a.disposition==='surrendered'?' has surrendered ':' is ')+POSITION_NAMES[a.position].toLowerCase()+'.';
}
const terminal=(s:GateEncounter)=>['entered','escaped','defeated'].includes(s.phase);
export function gateActionLabel(a:GateAction):string {
  if(a.kind==='move')return `Move · ${POSITION_NAMES[a.to]}`;
  if(a.kind==='attack')return `${a.weapon==='sword'?'Sword':'Bow'} · ${a.target==='mona'?'Mona':'Archer'}`;
  if(a.kind==='say')return a.text;
  return ({look:'Look around',finish:'Continue into the city','tip-wagon':'Tip the wagon','clear-wagon':'Clear the barricade','inspect-gate':'Examine the lock','search-wall':'Inspect the ivy','persuade':'Persuade Mona','force':'Force the gate','pick-lock':'Pick the lock','take-key':'Take the key','unlock':'Unlock the gate',open:'Open the gate',postern:'Use the hidden passage',defend:'Defend','end-turn':'End turn'} as const)[a.kind];
}
/** All eligibility checks are authoritative and run again at commit. No text can set state. */
export function gateActionBlock(s:GateEncounter,a:GateAction):string|undefined {
  if(terminal(s))return 'This test has ended. Start a new gate scenario to try another approach.';
  if(a.kind==='finish')return s.position!=='courtyard'?'Reach the courtyard first.':s.phase==='combat'&&s.actionUsed?'You have used your action. Move or end your turn.':undefined;
  if(a.kind==='say')return;
  if(a.kind==='look')return;
  if(a.kind==='end-turn')return s.phase==='combat'?undefined:'There is no combat turn to end.';
  if(a.kind==='move'){
    if(s.phase==='combat'&&s.moveUsed)return 'You have used your movement this turn.';
    if(!isNeighbour(s.position,a.to))return 'There is no direct route. Use the gate and courtyard stairs to reach the wall.';
    if((s.position==='gate'&&a.to==='courtyard')||(s.position==='courtyard'&&a.to==='gate')){
      if(s.wagonTipped)return 'The tipped wagon blocks the main gate. Clear the barricade or find another route.';
      if(!s.gateOpen)return 'The gate is closed.';
      if(!s.admitted&&enemyActive(s,'mona')&&s.monaPosition==='gate'&&s.phase!=='combat')return 'Mona blocks entry. Gain permission or choose another approach.';
    }
    return;
  }
  if(s.phase==='combat'&&s.actionUsed)return 'You have used your action. Move or end your turn.';
  if(a.kind==='tip-wagon'||a.kind==='clear-wagon'){
    if(s.position!=='cover')return 'Move to the wagon first.';
    if(a.kind==='clear-wagon')return s.wagonTipped?undefined:'The wagon is not blocking the gate.';
    return s.wagonTipped?'The wagon is already a barricade.':s.attempts.includes('tip-wagon')?'The unchanged wagon has already resisted that attempt.':undefined;
  }
  if(a.kind==='attack'){
    const target=enemyState(s,a.target);
    if(target.hp<=0)return 'That opponent is already incapacitated.';
    if(target.disposition==='fled')return 'That opponent has left the fight.';
    if(a.weapon==='sword'&&s.position!==target.position)return 'Out of sword reach. You must reach the same position first.';
    if(a.weapon==='bow'){
      if(!s.arrows)return 'You have no arrows left.';
      if(s.position===target.position)return 'Too close to use the bow. Use your sword or move away.';
      if(!gateLineOfSight(s,s.position,target.position))return 'The stonework or barricade blocks your line of sight.';
    }
    return;
  }
  if(a.kind==='search-wall')return s.position!=='wall-foot'?'Move below the west wall to inspect the ivy.':s.posternFound?'You have already found the passage.':undefined;
  if(a.kind==='postern')return s.position!=='wall-foot'?'Move below the west wall first.':!s.posternFound?'You have not discovered a passage here.':undefined;
  if(a.kind==='defend')return s.phase==='combat'?undefined:'Defending is available during combat.';
  if(a.kind==='take-key'){
    if(s.keyOwner==='player')return 'You already have the key.';
    if(s.monaDisposition==='fled')return 'Mona has left the encounter with the key.';
    if(s.position!==s.monaPosition)return 'Move to Mona first.';
    return enemyActive(s,'mona')?'Mona wears the key at her belt. She will not let you simply take it.':undefined;
  }
  if(a.kind==='persuade'&&s.position!==s.monaPosition)return 'Move within speaking distance of Mona first.';
  if(s.position!=='gate'&&a.kind!=='persuade')return 'You must be at the gate to do that.';
  if(a.kind==='inspect-gate')return;
  if(a.kind==='persuade')return s.monaDisposition!=='active'?'Mona has already surrendered or left the fight.':s.phase==='combat'?'Mona will not negotiate while the attack continues. Escape first.':s.monaHp<=0?'Mona is incapacitated.':s.admitted?'Mona has already granted entry.':s.attempts.includes('persuade')?'This appeal is resolved. Try a different approach; repeating it gives no new roll.':undefined;
  if(a.kind==='unlock')return !s.gateLocked?'The gate is already unlocked.':s.keyOwner!=='player'?'You need the iron key carried by Mona.':undefined;
  if(a.kind==='open')return s.gateLocked?'The gate is locked.':s.gateOpen?'The gate is already open.':undefined;
  if(a.kind==='force'||a.kind==='pick-lock')return !s.gateLocked?'The gate is already unlocked.':s.attempts.includes(a.kind)?'That attempt is resolved. No repeated rolls against the unchanged lock.':undefined;
}
export function gateActionPreview(s:GateEncounter,a:GateAction):{label:string;stat?:string;target?:number;risk?:string;blocked?:string} {
  const blocked=gateActionBlock(s,a),label=gateActionLabel(a);
  if(a.kind==='persuade')return {label,stat:'Persuasion',target:60,risk:'A failed appeal ends this approach. A severe failure makes Mona suspicious.',...(blocked?{blocked}:{})};
  if(a.kind==='tip-wagon')return {label,stat:'Strength',target:35,risk:'A successful attempt creates stronger cover, but blocks the main gate for everyone. Uses an action in combat.',...(blocked?{blocked}:{})};
  if(a.kind==='force')return {label,stat:'Strength',target:35,risk:'Forcing the guarded gate starts combat, whether you break the lock or not.',...(blocked?{blocked}:{})};
  if(a.kind==='pick-lock')return {label,stat:'Dexterity',target:40,risk:'Mona can see you tampering with the lock. This starts combat.',...(blocked?{blocked}:{})};
  if(a.kind==='attack')return {label,stat:a.weapon==='sword'?'Melee':'Archery',target:gateAttackTarget(s,a.target,a.weapon),risk:enemyState(s,a.target).disposition==='surrendered'?'This opponent has surrendered. Attacking breaks the surrender and resumes combat. Other hostile participants can intervene.':'Attacking starts combat. An attack uses your action; a bow shot also uses one arrow.',...(blocked?{blocked}:{})};
  return {label,...(blocked?{blocked}:{})};
}
/** Talking and looking are free, but must not hold up an exhausted combat turn. */
export function gateTurnExhausted(s:GateEncounter):boolean {
  return s.phase==='combat' && s.actionUsed && !GATE_POSITIONS.some(to=>!gateActionBlock(s,{kind:'move',to}));
}
function rollCheck(actor:string,stat:string,target:number,rng:()=>number):GateCheck{
  const {actorId:_id,round:_round,...check}=percentileRules.check(actor,stat,target,0,rng);
  return {actor,...check};
}
const passed=(c:GateCheck)=>c.degree==='success'||c.degree==='exceptional';
/** Pure, atomic reducer. Unknown fields are not used as instructions. IDs/revisions prevent replay. */
export function resolveGateAction(current:GateEncounter,request:GateRequest,rng:()=>number=Math.random):GateEncounter {
  if(current.history.some(item=>item.id===request.id))throw new Error('This action has already been resolved.');
  if(request.expectedRevision!==current.revision)throw new Error('The scene changed. Review your action again.');
  if(!request.id.trim())throw new Error('An action needs an ID.');
  const intention=request.intention===undefined?undefined:z.string().trim().min(1).max(1000).parse(request.intention);
  const a=GateActionSchema.parse(request.action),blocked=gateActionBlock(current,a);if(blocked)throw new Error(blocked);
  const s=structuredClone(current),checks:GateCheck[]=[],enemyTurns:EnemyTurn[]=[],presentation:CombatBeat[]=[];let text='',opening='';
  const combatRecord=(current.phase==='combat'||['attack'].includes(a.kind))&&['attack','move','defend','end-turn'].includes(a.kind);
  const renewedSurrender=a.kind==='attack'&&enemyState(current,a.target).disposition==='surrendered'?a.target:undefined;
  if(renewedSurrender)opening=breakGateSurrender(s,renewedSurrender,rng);
  const combatStarts=current.phase!=='combat'&&(!!renewedSurrender||!combatFinished(current))&&['attack','force','pick-lock'].includes(a.kind);
  if(combatStarts){opening+=(opening?' ':'')+startGateCombat(s,checks,enemyTurns,rng,presentation);const changed=gateActionBlock(s,a);
    if(s.phase==='defeated'||changed){
      text=opening+(changed?' Your intended action is no longer possible: '+changed+' Choose a different action.':'');
      s.revision++;s.history.push({id:request.id,revision:s.revision,action:gateActionLabel(a),combat:combatRecord,...(renewedSurrender?{renewedSurrender}:{}),...(intention?{intention}:{}),speaker:'narrator',text,checks,enemyTurns,presentation,initiative:s.initiative});return GateEncounterSchema.parse(s);
    }
  }
  if(a.kind==='attack'&&enemyState(s,a.target).disposition==='surrendered'){s.phase='combat';breakGateSurrender(s,a.target,rng);}
  const isAction=!['look','say','move','end-turn'].includes(a.kind);
  if(a.kind==='look')text=`${POSITION_NAMES[s.position]}. ${describeEnemy(s,'mona')} ${s.gateLocked?'The gate lock is secured.':s.gateOpen?'The gate stands open.':'The gate lock is released, but the gate is closed.'} ${describeEnemy(s,'archer')} A wagon offers cover. Ivy covers part of the west wall.${s.posternFound?' You know of the narrow passage behind that ivy.':''}`;
  if(a.kind==='inspect-gate')text='The keyhole is reachable from outside beside the handle. The lock opens with an iron key. '+(s.keyOwner==='player'?'You have the iron key.':s.monaDisposition==='fled'?'Mona left with the iron key.':'Mona has the iron key on her belt, '+POSITION_NAMES[s.monaPosition].toLowerCase()+'.')+' You have a sword, a bow and lockpicks. Permission and an unlocked gate are separate things.';
  if(a.kind==='tip-wagon'){
    const c=rollCheck('Traveller','Strength',35,rng);checks.push(c);s.attempts.push('tip-wagon');
    if(passed(c)){s.wagonTipped=true;s.flags.push('wagon_barricade_created');s.suspicious=Math.max(1,s.suspicious);text='You tip the wagon across the gate approach. Its solid bed makes stronger cover against arrows, but blocks passage through the main gate. Mona demands that you clear it. The act alone does not start combat.';}
    else text='You strain against the heavy wagon, but it does not tip. Its position and the gate remain unchanged. Repeating the unchanged attempt gives no new roll.';
  }
  if(a.kind==='clear-wagon'){s.wagonTipped=false;text='You haul the wagon clear of the passage. The main gate is no longer barricaded; its lock and permission requirements remain unchanged. The wagon provides ordinary cover again.';}
  if(a.kind==='search-wall'){s.posternFound=true;s.flags.push('postern_discovered');text='You part the ivy where flattened grass meets the wall. Behind it is a narrow unlocked passage into the courtyard. Careful inspection reveals it without a roll. Mona cannot see this recess from the gate.';}
  if(a.kind==='persuade'){
    const c=rollCheck('Traveller','Persuasion',60,rng);checks.push(c);s.attempts.push('persuade');
    if(passed(c)){s.admitted=true;s.gateLocked=false;s.flags.push('entry_granted');text=c.degree==='exceptional'?'Mona smiles. “Of course. Welcome to the city.” She unlocks the gate. You may open it and enter.':'Mona nods. “All right. You may enter.” She unlocks the gate. It is still closed; your next move is yours.';}
    else{s.suspicious=c.degree==='severe'?2:1;text=c.degree==='severe'?'Mona stiffens and signals the archer to watch you. “No. Step away from the gate.” Entry is refused; nobody attacks.':'Mona shakes her head. “Not tonight. You must wait until morning.” The gate remains locked. This appeal is finished.';}
  }
  if(a.kind==='force'||a.kind==='pick-lock'){
    const c=rollCheck('Traveller',a.kind==='force'?'Strength':'Dexterity',a.kind==='force'?35:40,rng);checks.push(c);s.attempts.push(a.kind);
    if(passed(c)){s.gateLocked=false;s.flags.push('lock_bypassed');text=a.kind==='force'?'The lock breaks, but the gate remains closed.':'The lock clicks open; the gate remains closed.';}else text='The lock holds.';
    text+=s.phase==='combat'?' The guards resist your attempt. Your action is used. Confirm its result to pass to the next combatant.':' No guard is still resisting, so the attempt does not start another fight.';
  }
  if(a.kind==='take-key'){s.keyOwner='player';text=s.monaDisposition==='surrendered'?'Mona hands over the iron key without resistance. It fits the gate.':'You take the iron key from the incapacitated Mona’s belt. It fits the gate.';}
  if(a.kind==='unlock'){s.gateLocked=false;text='The iron key turns. The gate is unlocked, but still closed.';}
  if(a.kind==='open'){s.gateOpen=true;text='You push the gate open. The passage to the courtyard is now physically open.';}
  if(a.kind==='postern'){s.position='courtyard';s.flags.push('courtyard_reached');text='You pass through the narrow passage and reach the courtyard without changing the main gate’s lock. Stairs lead up to the battlements; you can also continue into the city.';}
  if(a.kind==='move'){
    s.position=a.to;s.moveUsed=true;text=({gate:'You approach the city gate.','wall-foot':'You move below the west wall.',cover:'You move behind the wagon.',road:'You step out onto the road.',courtyard:'You enter the courtyard.',stairs:'You move onto the stairs.',wall:'You reach the battlements.'} as const)[a.to];
    if(a.to===s.monaPosition&&s.monaHp===0)text+=s.keyOwner==='mona'?' Mona lies incapacitated here. The iron key is still on her belt; you can take it.':' Mona lies incapacitated here. You already have her iron key.';
    if(a.to==='courtyard'){s.flags.push('courtyard_reached');text+=' Stairs lead up to the battlements. You can also continue into the city to finish the test.';}
    else if(a.to==='road'&&s.phase==='combat'){s.phase='escaped';s.flags.push('escaped');text+=' You retreat beyond the gatehouse engagement. The guards hold the entrance rather than pursue. This test is complete.';}
  }
  if(a.kind==='attack'){
    const c=gateAttack(s,a.target,a.weapon,rng,presentation);checks.push(c);
    text=c.damage?`Your ${a.weapon==='sword'?'sword strike':'arrow'} hits ${a.target==='mona'?'Mona':'the archer'} for ${c.damage} damage.`:'Your attack misses.';
    if((a.target==='mona'?s.monaHp:s.archerHp)===0)text+=' The opponent is incapacitated and can no longer act.';
    if(combatFinished(s)){s.phase='exploration';s.actionUsed=false;s.moveUsed=false;text+=' The fighting is over. The gate and its key still need to be dealt with.';}
    else text+=' Confirm the result to pass to the next combatant.';
  }
  if(a.kind==='defend'){s.defending=true;text='You brace yourself and watch for attacks. Enemy hit chances are reduced until your next turn.';}
  if(a.kind==='finish'){s.phase='entered';s.flags.push('city_entered');text='You leave the gatehouse behind and enter the city. The test is complete. Your choices, discoveries and rolls are saved.';}
  if(a.kind==='end-turn')text=finishGatePlayerTurn(s,checks,enemyTurns,rng,presentation);
  if(a.kind==='say'){
    text=s.monaDisposition==='fled'?'Mona has left; there is no answer from her.':s.monaHp===0?'You speak, but Mona remains incapacitated and cannot answer.':s.monaDisposition==='surrendered'?'Mona lowers her eyes. “I yield. Take the key.”':s.phase==='combat'?'Your words carry over the clash. Neither guard lowers their weapon. Talking grants no extra action and does not advance the turn.':s.admitted?'Mona gestures to the gate. “You have my permission. Open it and go through.”':s.suspicious?'Mona keeps watch. “I have given you my answer.” You can look for another approach.':'Mona answers, “The city is closed after dusk. If you want an exception, make your appeal.” Use Persuade Mona to resolve that request.';
  }
  if(s.phase==='combat'&&isAction)s.actionUsed=true;
  if(a.kind!=='attack'&&a.kind!=='end-turn'&&a.kind!=='say'&&a.kind!=='look'&&(s.phase==='combat'||checks.some(c=>c.actor==='Traveller'))){
    const out=output(),check=checks.filter(c=>c.actor==='Traveller').at(-1);
    if(check){const {actor:_actor,...rest}=check;out.checks.push({...rest,actorId:'player',round:check.round??s.round});}
    recordCombatBeat(gateCombatState(s),out,'player',gateActionLabel(a),out.checks[0]);presentation.push(...out.presentation);
  }
  if(gateTurnExhausted(s))text+=' No actions remain. The enemies take their turn. '+finishGatePlayerTurn(s,checks,enemyTurns,rng);
  if(opening)text=opening+' '+text;
  const speaker=a.kind==='persuade'||(a.kind==='say'&&current.phase!=='combat'&&current.monaHp>0&&current.monaDisposition!=='fled')?'mona':'narrator';
  s.revision++;s.history.push({id:request.id,revision:s.revision,action:gateActionLabel(a),combat:combatRecord,...(renewedSurrender?{renewedSurrender}:{}),...(intention?{intention}:{}),speaker,text,checks,enemyTurns,presentation,...(combatStarts?{initiative:s.initiative}:{})});
  return GateEncounterSchema.parse(s);
}

/** Small explicit vocabulary, never a language model with authority to invent actions. */
export function proposeGateText(text:string):GateAction|null {
  const t=text.trim().toLowerCase().replace(/[.!?]$/,'').replace(/^(?:i |jag )/,'');
  const aliases:Record<string,GateAction>={
    'look around':{kind:'look'},'ser mig omkring':{kind:'look'},'tittar mig omkring':{kind:'look'},
    'examine the lock':{kind:'inspect-gate'},'undersöker låset':{kind:'inspect-gate'},
    'inspect the ivy':{kind:'search-wall'},'undersöker murgrönan':{kind:'search-wall'},
    'open the gate':{kind:'open'},'öppnar porten':{kind:'open'},
    'force the gate':{kind:'force'},'försöker bryta upp porten':{kind:'force'},'bryter upp porten':{kind:'force'},
    'pick the lock':{kind:'pick-lock'},'dyrkar låset':{kind:'pick-lock'},
    'persuade mona':{kind:'persuade'},'försöker övertala mona':{kind:'persuade'},
    'unlock the gate':{kind:'unlock'},'låser upp porten':{kind:'unlock'},
    'take the key':{kind:'take-key'},'tar nyckeln':{kind:'take-key'},
    'går in genom porten':{kind:'move',to:'courtyard'},'enter the courtyard':{kind:'move',to:'courtyard'},
    'use the hidden passage':{kind:'postern'},'använder den hemliga ingången':{kind:'postern'},
    'hugger skytten':{kind:'attack',target:'archer',weapon:'sword'},'skjuter skytten':{kind:'attack',target:'archer',weapon:'bow'},
    'hugger mona':{kind:'attack',target:'mona',weapon:'sword'},'försvarar mig':{kind:'defend'},'end turn':{kind:'end-turn'},'avslutar turen':{kind:'end-turn'}
  };
  return aliases[t]??null;
}
