import archerFighting from '../assets/archer-fighting.png';
import monaFighting from '../assets/mona-fighting.png';
import playerSword from '../assets/player-sword.png';
import type { Session } from '../../state/StateSchema';
import { POSITION_NAMES } from '../../scenarios/gateWorld';
import { hostile } from '../../game/EncounterEngine';
export type Fighter = {
  id: string; name: string; hp: number; maxHp: number; position: string; status: string[];
  image?: string | undefined; portrait?: string | undefined; anatomyId?: string | undefined; parts?: string[] | undefined;
};
const condition = (hp: number, disposition: string, defending: boolean,ready?:boolean) => hp === 0 ? ['Incapacitated'] : disposition === 'surrendered' ? ['Surrendered'] : disposition === 'fled' ? ['Retreated'] : ready===false?['Weapon down']:defending ? ['Defending'] : [];
export function gateFighters(session: Session): { player: Fighter; opponents: Fighter[] } {
  const s = session.gateEncounter!, mona = Object.values(session.characters)[0];
  return {
    player: { id: 'player', name: session.player?.name || 'Traveller', hp: s.hp, maxHp: 20, position: POSITION_NAMES[s.position], status: s.defending ? ['Defending'] : [], anatomyId: 'builtin-humanoid', portrait: session.player?.portraitDataUrl, image: session.combatArtwork?.player?.imageDataUrl ?? playerSword },
    opponents: [
      { id: 'mona', name: 'Mona', hp: s.monaHp, maxHp: 16, position: POSITION_NAMES[s.monaPosition], status: condition(s.monaHp, s.monaDisposition, s.monaDefending,s.monaWeaponReady), anatomyId: mona?.anatomyTemplateId ?? 'builtin-humanoid', parts: mona?.anatomyTemplateId ? session.anatomyTemplates?.[mona.anatomyTemplateId]?.parts.map(p => p.id) : undefined, portrait: mona?.portraitDataUrl, image: session.combatArtwork?.mona?.imageDataUrl ?? monaFighting },
      { id: 'archer', name: 'Archer', hp: s.archerHp, maxHp: 10, position: POSITION_NAMES[s.archerPosition] + (s.archerPosition === 'wall' ? ' · +6 m' : ''), status: condition(s.archerHp, s.archerDisposition, s.archerDefending,s.archerWeaponReady), anatomyId: 'builtin-humanoid', image: session.combatArtwork?.archer?.imageDataUrl ?? archerFighting }
    ]
  };
}
export function encounterFighters(session: Session): { player: Fighter; opponents: Fighter[] } {
  const { definition: d, state: s } = session.encounter!, player = s.actors[d.playerId]!;
  const view = (id: string): Fighter => {
    const a = s.actors[id]!, place = d.places.find(p => p.id === a.position)!;
    return { id, name: a.name, hp: a.hp, maxHp: a.maxHp, position: place.name + (place.elevation ? ` · +${place.elevation} m` : ''), status: condition(a.hp, a.disposition, a.defending,a.weaponReady), anatomyId: a.anatomyTemplateId, parts: a.anatomyTemplateId ? session.anatomyTemplates?.[a.anatomyTemplateId]?.parts.map(p => p.id) : undefined, portrait: id === d.playerId ? session.player?.portraitDataUrl : undefined, image: session.combatArtwork?.[id]?.imageDataUrl };
  };
  return { player: view(player.id), opponents: Object.values(s.actors).filter(a => hostile(d, player, a)).map(a => view(a.id)) };
}

export function projectFighters(session:Session, snapshot:import('../../game/EncounterSchema').CombatBeat['actors']|undefined){
 const fighters=session.encounter?encounterFighters(session):gateFighters(session);
 if(!snapshot)return fighters;
 const view=(fighter:Fighter):Fighter=>{const a=snapshot[fighter.id];if(!a)return fighter;const place=session.encounter?.definition.places.find(p=>p.id===a.position);
 return {...fighter,hp:a.hp,status:condition(a.hp,a.disposition,a.defending,a.weaponReady),position:place?place.name+(place.elevation?` · +${place.elevation} m`:''):(POSITION_NAMES[a.position as keyof typeof POSITION_NAMES]??a.position)+(fighter.id==='archer'&&a.position==='wall'?' · +6 m':'')};};
 return {player:view(fighters.player),opponents:fighters.opponents.map(view)};
}
