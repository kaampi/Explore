import type { GateEncounter } from '../checks/gateEncounter';
import { EncounterDefinitionSchema, type Actor, type EncounterState } from '../game/EncounterSchema';

export const GATE_POSITIONS = ['gate', 'wall-foot', 'cover', 'road', 'courtyard', 'stairs', 'wall'] as const;
export type GatePosition = typeof GATE_POSITIONS[number];
export const POSITION_NAMES: Record<GatePosition, string> = { gate: 'At the gate', 'wall-foot': 'Below the west wall', cover: 'Behind the wagon', road: 'On the road', courtyard: 'In the courtyard', stairs: 'On the stairs', wall: 'On the battlements' };
const locations = [
  ['gate', 0, 0, 0], ['wall-foot', -6, 0, 0], ['cover', 6, -3, 0], ['road', 0, -15, 0],
  ['courtyard', 0, 6, 0], ['stairs', 3, 6, 3], ['wall', 0, 0, 6]
] as const;
const connections = [['gate', 'wall-foot'], ['gate', 'cover'], ['gate', 'road'], ['gate', 'courtyard'], ['wall-foot', 'cover'], ['wall-foot', 'road'], ['cover', 'road'], ['courtyard', 'stairs'], ['stairs', 'wall']];
const outdoors = (id: string) => ['gate', 'cover', 'road', 'wall-foot'].includes(id);
const sightLines = GATE_POSITIONS.flatMap((from, index) => GATE_POSITIONS.slice(index + 1).flatMap(to => {
  if (from === 'stairs' || to === 'stairs') return [];
  return [{ from, to, ...(from !== 'wall' && to !== 'wall' && outdoors(from) !== outdoors(to) ? { barrierId: 'port' } : {}) }];
}));
export function gateDefinition(wagonTipped = false) {
  return EncounterDefinitionSchema.parse({
    id: 'gatehouse', title: 'The gatehouse', description: 'A guarded city entrance after dusk.', playerId: 'player', rules: { id: 'd100' },
    places: locations.map(([id, x, y, elevation]) => ({ id, name: POSITION_NAMES[id], x, y, elevation, cover: id === 'cover' ? wagonTipped ? 45 : 30 : id === 'wall' ? 15 : 0 })),
    connections: connections.map(([from, to]) => ({ from, to, ...(from === 'gate' && to === 'courtyard' ? { barrierId: 'port' } : {}) })), sightLines,
    hostilities: [['travellers', 'guards']],
    items: [{ id: 'iron-key', name: 'Iron key' }],
    weapons: [
      { id: 'player-sword', name: 'Sword', skill: 'Melee', kind: 'melee', damage: 6 },
      { id: 'player-bow', name: 'Bow', skill: 'Archery', kind: 'ranged', damage: 4, range: 100, usesAmmunition: true },
      { id: 'sword', name: 'Sword', skill: 'Sword', kind: 'melee', damage: 4 },
      { id: 'bow', name: 'Bow', skill: 'Archery', kind: 'ranged', damage: 3, range: 100, usesAmmunition: true },
      { id: 'dagger', name: 'Dagger', skill: 'Dagger', kind: 'melee', damage: 2 }
    ]
  });
}
export function gateBarriers(s: Pick<GateEncounter, 'gateOpen' | 'gateLocked' | 'wagonTipped'>) {
  return { port: { id: 'port', name: 'The gate', open: s.gateOpen, locked: s.gateLocked, blocked: s.wagonTipped, keyId: 'iron-key' } };
}
/** Compatibility projection: old saves remain readable while combat runs in the shared engine. */
export function gateCombatState(s: GateEncounter): EncounterState {
  const make = (actor: Partial<Actor> & Pick<Actor, 'id' | 'name' | 'position' | 'hp' | 'maxHp' | 'weapons'>): Actor => ({ team: 'guards', control: 'npc', stats: {}, inventory: [], ammunition: {}, resources: {}, disposition: 'active', defending: false, actionsLeft: 1, movesLeft: 1, ...actor });
  const order = s.initiative?.order ?? ['player', 'mona', 'archer'];
  return {
    version: 1, sceneId: 'gatehouse', revision: s.revision, phase: s.phase === 'combat' ? 'combat' : s.phase === 'defeated' ? 'defeated' : 'exploration', round: s.round, cursor: order.indexOf('player'),
    ...(s.phase === 'combat' || s.initiative ? { initiative: { order, rolls: Object.fromEntries(Object.entries(s.initiative?.rolls ?? {}).filter((entry): entry is [string, number] => entry[1] !== undefined)) } } : {}),
    itemLocations: {}, flags: [], attempts: [], barriers: gateBarriers(s), actors: {
      player: make({ id: 'player', name: 'You', team: 'travellers', control: 'player', position: s.position, hp: s.hp, maxHp: 20, weapons: ['player-sword', 'player-bow'], stats: { Melee: 65, Archery: 55 }, inventory: s.keyOwner === 'player' ? ['iron-key'] : [], ammunition: { 'player-bow': s.arrows }, actionsLeft: s.actionUsed ? 0 : 1, movesLeft: s.moveUsed ? 0 : 1, defending: s.defending }),
      mona: make({ id: 'mona', name: 'Mona', weaponReady:s.monaWeaponReady??s.monaDisposition!=='surrendered', position: s.monaPosition, hp: s.monaHp, maxHp: 16, weapons: ['sword'], stats: { Sword: 55 }, inventory: s.keyOwner === 'mona' ? ['iron-key'] : [], defending: s.monaDefending, disposition: s.monaDisposition, tactics: { preferredWeapon: 'sword', retreatAt: 4, escapeTo: 'courtyard', repositionTo: [] } }),
      archer: make({ id: 'archer', name: 'Archer', weaponReady:s.archerWeaponReady??s.archerDisposition!=='surrendered', position: s.archerPosition, hp: s.archerHp, maxHp: 10, weapons: ['bow', 'dagger'], stats: { Archery: 50, Dagger: 45 }, ammunition: { bow: s.archerArrows }, defending: s.archerDefending, disposition: s.archerDisposition, tactics: { preferredWeapon: 'bow', fallbackWeapon: 'dagger', retreatAt: 3, escapeTo: 'courtyard', repositionTo: ['wall', 'courtyard'] } })
    }
  };
}
export function applyGateCombatState(s: GateEncounter, state: EncounterState, keepLegacyOrder = false) {
  const player = state.actors.player!, mona = state.actors.mona!, archer = state.actors.archer!;
  s.position = player.position as GatePosition; s.hp = player.hp; s.arrows = player.ammunition['player-bow']!;
  s.actionUsed = player.actionsLeft === 0; s.moveUsed = player.movesLeft === 0; s.defending = player.defending;
  s.monaWeaponReady=mona.weaponReady??true;s.archerWeaponReady=archer.weaponReady??true;
  s.monaPosition = mona.position as GatePosition; s.monaHp = mona.hp; s.monaDefending = mona.defending; s.monaDisposition = mona.disposition;
  s.archerPosition = archer.position as GatePosition; s.archerHp = archer.hp; s.archerDefending = archer.defending; s.archerDisposition = archer.disposition; s.archerArrows = archer.ammunition.bow!;
  s.gateLocked = state.barriers.port!.locked; s.gateOpen = state.barriers.port!.open; s.round = state.round;
  s.phase = state.phase === 'complete' ? 'exploration' : state.phase;
  if (!keepLegacyOrder && state.initiative) s.initiative = { order: state.initiative.order as ('player' | 'mona' | 'archer')[], rolls: { player: state.initiative.rolls.player!, ...(state.initiative.rolls.mona ? { mona: state.initiative.rolls.mona } : {}), ...(state.initiative.rolls.archer ? { archer: state.initiative.rolls.archer } : {}) } };
}
