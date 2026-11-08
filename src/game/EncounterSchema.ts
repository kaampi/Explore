import { z } from 'zod';

const id = z.string().min(1).max(120);
export const ActorSchema = z.object({
  id, name: z.string().min(1), team: id, control: z.enum(['player', 'npc']),
  anatomyTemplateId: z.string().optional(),
  position: id, hp: z.number().int().nonnegative(), maxHp: z.number().int().positive(),
  stats: z.record(z.number().finite()), weapons: z.array(id), inventory: z.array(id).default([]),
  ammunition: z.record(z.number().int().nonnegative()).default({}),
  resources: z.record(z.number().finite().nonnegative()).default({}),
  disposition: z.enum(['active', 'surrendered', 'fled']).default('active'),
  weaponReady:z.boolean().optional(),
  defending: z.boolean().default(false), actionsLeft: z.number().int().nonnegative().default(1),
  movesLeft: z.number().int().nonnegative().default(1),
  tactics: z.object({
    preferredWeapon: id, fallbackWeapon: id.optional(), retreatAt: z.number().nonnegative().default(0),
    escapeTo: id.optional(), repositionTo: z.array(id).default([])
  }).optional()
});
export type Actor = z.infer<typeof ActorSchema>;
export const WeaponSchema = z.object({
  id, name: z.string().min(1), skill: id, kind: z.enum(['melee', 'ranged']),
  damage: z.number().int().nonnegative(), range: z.number().positive().optional(), usesAmmunition: z.boolean().default(false)
});
export const PlaceSchema = z.object({
  id, name: z.string().min(1), x: z.number().finite(), y: z.number().finite(), elevation: z.number().finite().default(0),
  cover: z.number().nonnegative().default(0)
});
export const BarrierSchema = z.object({
  id, name: z.string().min(1), open: z.boolean(), locked: z.boolean(), blocked: z.boolean().default(false),
  keyId: id.optional(), position:id.optional(), shared:z.boolean().optional()
});
const LinkSchema = z.object({ from: id, to: id, barrierId: id.optional() });
const EffectSchema = z.discriminatedUnion('kind', [
  z.object({kind:z.literal('take-item'),itemId:id}).strict(),
  z.object({ kind: z.literal('flag'), flag: id }).strict(),
  z.object({ kind: z.literal('transfer-item'), itemId: id, from: id, to: id }).strict(),
  z.object({ kind: z.literal('transfer-resource'), resource: id, amount: z.number().finite().positive(), from: id, to: id }).strict()
]);
const OutcomeSchema = z.object({ text: z.string().min(1), effects: z.array(EffectSchema).default([]) });
export const InteractionSchema = z.object({
  id, label: z.string().min(1), description: z.string(), counterpartyId: id.optional(), position: id.optional(),
  dialogueTopics: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  dialogueMode:z.enum(['question','report']).optional(),
  requiresFlags: z.array(id).default([]), excludesFlags: z.array(id).default([]),
  once: z.boolean().default(true), costsAction: z.boolean().default(true),
  check: z.object({ stat: id, modifier: z.number().finite().default(0) }).optional(),
  success: OutcomeSchema, failure: OutcomeSchema
});
export type Interaction = z.infer<typeof InteractionSchema>;
export const EncounterDefinitionSchema = z.object({
  id, title: z.string().min(1), description: z.string(), playerId: id,
  descriptions:z.array(z.object({requiresFlags:z.array(id).default([]),excludesFlags:z.array(id).default([]),text:z.string().min(1)})).optional(),
  rules: z.object({ id: id.default('d100'), actionsPerTurn: z.number().int().min(1).max(10).default(1), movesPerTurn: z.number().int().min(1).max(10).default(1), defensePenalty: z.number().nonnegative().default(20), unreadyTargetBonus:z.number().nonnegative().default(20), exceptionalDamage: z.number().nonnegative().default(2) }),
  places: z.array(PlaceSchema).min(1), connections: z.array(LinkSchema),
  // Visibility is authored independently of movement: seeing a balcony does not make it reachable.
  sightLines: z.array(LinkSchema), weapons: z.array(WeaponSchema),
  items: z.array(z.object({ id, name: z.string().min(1), description:z.string().optional(), readableContent:z.string().optional(), imageDataUrl:z.string().optional() })).default([]),
  hostilities: z.array(z.tuple([id, id])), interactions: z.array(InteractionSchema).default([])
});
export type EncounterDefinition = z.infer<typeof EncounterDefinitionSchema>;
export type Weapon = z.infer<typeof WeaponSchema>;
export type Barrier = z.infer<typeof BarrierSchema>;
export const ActionCheckSchema = z.object({
  actorId: id, targetId: id.optional(), stat: id, roll: z.number().int().positive(), target: z.number().finite(),
  degree: z.enum(['exceptional', 'success', 'failure', 'severe']), damage: z.number().nonnegative().optional(), round: z.number().int().nonnegative()
});
export type ActionCheck = z.infer<typeof ActionCheckSchema>;
/** Saved presentation snapshots; showing a result never executes or rerolls an action. */
export const CombatBeatSchema = z.object({actorId:id,round:z.number().int().nonnegative(),check:ActionCheckSchema.optional(),text:z.string(),actors:z.record(ActorSchema.pick({hp:true,position:true,defending:true,disposition:true,weaponReady:true}))});
export type CombatBeat = z.infer<typeof CombatBeatSchema>;
export const EncounterActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('attack'), targetId: id, weaponId: id }).strict(),
  z.object({ kind: z.literal('move'), to: id }).strict(),
  z.object({ kind: z.literal('defend') }).strict(),
  z.object({ kind: z.literal('end-turn') }).strict(),
  z.object({ kind: z.literal('interact'), barrierId: id, operation: z.enum(['unlock', 'open']) }).strict(),
  z.object({ kind: z.literal('interaction'), interactionId: id }).strict(),
  z.object({ kind: z.literal('look') }).strict(),
  z.object({ kind: z.literal('say'), text: z.string().trim().min(1).max(1000) }).strict()
]);
export type EncounterAction = z.infer<typeof EncounterActionSchema>;
export const EncounterRequestSchema = z.object({ id, expectedRevision: z.number().int().nonnegative(), action: EncounterActionSchema, expectedSceneId:id.optional() }).strict();
export type EncounterRequest = z.infer<typeof EncounterRequestSchema>;
export const EncounterStateSchema = z.object({
  version: z.literal(1), sceneId: id, revision: z.number().int().nonnegative(),
  phase: z.enum(['exploration', 'combat', 'complete', 'defeated']), round: z.number().int().nonnegative(),
  cursor: z.number().int().nonnegative(), actors: z.record(ActorSchema), barriers: z.record(BarrierSchema),
  itemLocations:z.record(id).default({}),
  flags: z.array(id).default([]), attempts: z.array(id).default([]),
  initiative: z.object({ rolls: z.record(z.number().int().positive()), order: z.array(id).min(1) }).optional()
});
export type EncounterState = z.infer<typeof EncounterStateSchema>;
export const EncounterEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('initiative'), order: z.array(id), rolls: z.record(z.number().int().positive()) }),
  z.object({ kind: z.literal('move'), actorId: id, from: id, to: id, reason: z.enum(['advance','retreat','disengage','vantage','move']) }),
  z.object({ kind: z.literal('attack'), actorId: id, targetId: id, weaponId: id, check: ActionCheckSchema }),
  z.object({ kind: z.literal('defend'), actorId: id }),
  z.object({ kind: z.literal('surrender'), actorId: id }),
  z.object({kind:z.literal('rearm'),actorId:id}),
  z.object({kind:z.literal('surrender-broken'),actorId:id,targetId:id}),
  z.object({ kind: z.literal('flee'), actorId: id }),
  z.object({ kind: z.literal('hold-fire'), actorId: id, allyId: id }),
  z.object({ kind: z.literal('unlock'), actorId: id, barrierId: id }),
  z.object({ kind: z.literal('open'), actorId: id, barrierId: id }),
  z.object({ kind: z.literal('turn-ready') }), z.object({ kind: z.literal('combat-ended') }), z.object({ kind: z.literal('defeated') }),
  z.object({ kind: z.literal('blocked'), reason: z.string() }),
  z.object({ kind: z.literal('say'), actorId: id, text: z.string() }),
  z.object({ kind: z.literal('speech-reply'), actorId: id, text: z.string() }),
  z.object({ kind: z.literal('look'), actorId: id }),
  z.object({ kind: z.literal('interaction'), actorId: id, interactionId: id, text: z.string() })
]);
export type EncounterEvent = z.infer<typeof EncounterEventSchema>;
export const ActorTurnSchema = z.object({ actorId: id, round: z.number().int().nonnegative(), from: id, to: id, action: z.enum(['attack','defend','retreat','surrender','open','unlock','rearm']), weaponId: id.optional() });
export type ActorTurn = z.infer<typeof ActorTurnSchema>;
export type EncounterOutput = { events: EncounterEvent[]; checks: ActionCheck[]; turns: ActorTurn[]; presentation: CombatBeat[] };
export const EncounterGameSchema = z.object({
  definition: EncounterDefinitionSchema, state: EncounterStateSchema,
  history: z.array(z.object({ id, revision: z.number().int(), label: z.string(), text: z.string(), speakerId:id.optional(), combat: z.boolean().optional(), checks: z.array(ActionCheckSchema), presentation:z.array(CombatBeatSchema).optional(), events: z.array(EncounterEventSchema).default([]), turns: z.array(ActorTurnSchema).default([]) }))
});
export type EncounterGame = z.infer<typeof EncounterGameSchema>;
