import { EncounterGameSchema, type EncounterGame } from '../game/EncounterSchema';
import { validateEncounter } from '../game/EncounterEngine';

/** A second authored scene. There are no scene-specific combat functions or special actor IDs in the engine. */
export function loadingBayGame(): EncounterGame {
  return validateEncounter(EncounterGameSchema.parse({
    definition: {
      id: 'orbital-depot', title: 'The orbital loading bay', playerId: 'courier',
      description: 'A courier reaches an orbital depot. Quartermaster Imani sells a sealed medical kit at the docking hatch for 10 credits; you can try to bargain for a price of 8. Beyond a locked cargo shutter, a security officer blocks the cargo floor, a drone watches from the gantry, and a second officer guards the airlock. Freight containers provide cover. The courier carries the shutter access card.',
      rules: { id: 'd100' }, hostilities: [['couriers', 'security']],
      items: [{ id: 'cargo-access', name: 'Cargo access card' }, { id: 'medical-kit', name: 'Sealed medical kit' }],
      places: [
        { id: 'dock', name: 'At the docking hatch', x: 0, y: 0 },
        { id: 'freight', name: 'Behind the freight containers', x: 6, y: 0, cover: 35 },
        { id: 'cargo', name: 'On the cargo floor', x: 0, y: 8 },
        { id: 'ladder', name: 'On the gantry ladder', x: 7, y: 8, elevation: 2 },
        { id: 'gantry', name: 'On the overhead gantry', x: 7, y: 8, elevation: 4, cover: 10 },
        { id: 'airlock', name: 'At the service airlock', x: 12, y: 8 }
      ],
      connections: [
        { from: 'dock', to: 'freight' }, { from: 'dock', to: 'cargo', barrierId: 'shutter' },
        { from: 'cargo', to: 'ladder' }, { from: 'ladder', to: 'gantry' }, { from: 'cargo', to: 'airlock' }
      ],
      sightLines: [
        { from: 'dock', to: 'freight' }, { from: 'dock', to: 'cargo', barrierId: 'shutter' },
        { from: 'freight', to: 'cargo', barrierId: 'shutter' }, { from: 'cargo', to: 'gantry' },
        { from: 'cargo', to: 'airlock' }, { from: 'gantry', to: 'airlock' }
      ],
      interactions: [
        { id: 'negotiate-price', label: 'Bargain with Imani', description: 'Ask Imani to reduce the medical kit price from 10 to 8 credits. A failed attempt leaves the original offer available.', counterpartyId: 'quartermaster', check: { stat: 'Negotiation' }, excludesFlags: ['kit_bought'], success: { text: 'Imani agrees to 8 credits for the medical kit. Nothing has been bought yet.', effects: [{ kind: 'flag', flag: 'discount_agreed' }] }, failure: { text: 'Imani declines the discount. The kit still costs 10 credits.', effects: [] } },
        { id: 'buy-kit', label: 'Buy medical kit · 10 credits', description: 'Pay the listed price. The payment and medical kit change hands together; no roll is needed.', counterpartyId: 'quartermaster', excludesFlags: ['discount_agreed', 'kit_bought'], success: { text: 'You pay Imani 10 credits and receive the sealed medical kit.', effects: [{ kind: 'transfer-resource', resource: 'credits', amount: 10, from: 'courier', to: 'quartermaster' }, { kind: 'transfer-item', itemId: 'medical-kit', from: 'quartermaster', to: 'courier' }, { kind: 'flag', flag: 'kit_bought' }] }, failure: { text: 'The exchange does not take place.' } },
        { id: 'buy-discount-kit', label: 'Buy medical kit · 8 credits', description: 'Use the agreed discount. No new bargaining roll is made.', counterpartyId: 'quartermaster', requiresFlags: ['discount_agreed'], excludesFlags: ['kit_bought'], success: { text: 'You pay the agreed 8 credits and receive Imani’s medical kit.', effects: [{ kind: 'transfer-resource', resource: 'credits', amount: 8, from: 'courier', to: 'quartermaster' }, { kind: 'transfer-item', itemId: 'medical-kit', from: 'quartermaster', to: 'courier' }, { kind: 'flag', flag: 'kit_bought' }] }, failure: { text: 'The exchange does not take place.' } }
      ],
      weapons: [
        { id: 'shock-baton', name: 'Shock baton', skill: 'Close combat', kind: 'melee', damage: 5 },
        { id: 'pulse-pistol', name: 'Pulse pistol', skill: 'Marksmanship', kind: 'ranged', damage: 5, range: 30, usesAmmunition: true },
        { id: 'security-baton', name: 'Security baton', skill: 'Close combat', kind: 'melee', damage: 3 },
        { id: 'drone-emitter', name: 'Drone emitter', skill: 'Targeting', kind: 'ranged', damage: 2, range: 20, usesAmmunition: true },
        { id: 'shock-probe', name: 'Shock probe', skill: 'Close combat', kind: 'melee', damage: 2 }
      ]
    },
    state: {
      version: 1, sceneId: 'orbital-depot', revision: 0, phase: 'exploration', round: 0, cursor: 0,
      barriers: { shutter: { id: 'shutter', name: 'Cargo shutter', open: false, locked: true, keyId: 'cargo-access' } },
      actors: {
        courier: { id: 'courier', anatomyTemplateId: 'builtin-humanoid', name: 'Courier', team: 'couriers', control: 'player', position: 'dock', hp: 24, maxHp: 24, stats: { 'Close combat': 65, Marksmanship: 60, Negotiation: 60 }, weapons: ['shock-baton', 'pulse-pistol'], ammunition: { 'pulse-pistol': 6 }, inventory: ['cargo-access'], resources: { credits: 30 } },
        quartermaster: { id: 'quartermaster', anatomyTemplateId: 'builtin-humanoid', name: 'Quartermaster Imani', team: 'civilians', control: 'npc', position: 'dock', hp: 12, maxHp: 12, stats: {}, weapons: [], inventory: ['medical-kit'], resources: { credits: 0 } },
        officer: { id: 'officer', anatomyTemplateId: 'builtin-humanoid', name: 'Officer Vale', team: 'security', control: 'npc', position: 'cargo', hp: 14, maxHp: 14, stats: { 'Close combat': 50 }, weapons: ['security-baton'], tactics: { preferredWeapon: 'security-baton', retreatAt: 3, escapeTo: 'airlock' } },
        drone: { id: 'drone', anatomyTemplateId: 'mechanical-drone', name: 'Patrol drone', team: 'security', control: 'npc', position: 'gantry', hp: 10, maxHp: 10, stats: { Targeting: 45, 'Close combat': 35 }, weapons: ['drone-emitter', 'shock-probe'], ammunition: { 'drone-emitter': 4 }, tactics: { preferredWeapon: 'drone-emitter', fallbackWeapon: 'shock-probe', retreatAt: 2, escapeTo: 'airlock', repositionTo: ['gantry', 'cargo'] } },
        sentry: { id: 'sentry', anatomyTemplateId: 'builtin-humanoid', name: 'Airlock sentry', team: 'security', control: 'npc', position: 'airlock', hp: 12, maxHp: 12, stats: { 'Close combat': 45 }, weapons: ['security-baton'], tactics: { preferredWeapon: 'security-baton', retreatAt: 3, escapeTo: 'airlock' } }
      }
    }, history: []
  }));
}
