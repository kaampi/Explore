import { z } from 'zod';
import { ActorSchema,BarrierSchema,EncounterGameSchema } from './EncounterSchema';
import { WorldMapSchema } from '../library/worldMap';
/** Shared with Storyboard; kept independent of library/session schemas. */
export const AdventureLinkSchema=z.object({id:z.string().min(1),fromSceneId:z.string().min(1),toSceneId:z.string().min(1),requiresFlags:z.array(z.string().min(1)).default([]),requiresOpenBarriers:z.array(z.string().min(1)).optional(),requiresAbsentFlags:z.array(z.string().min(1)).default([]),setsFlags:z.array(z.string().min(1)).default([]),label:z.string().default('')});
export const AdventureGoalSchema=z.object({title:z.string().trim().min(1),requiresFlags:z.array(z.string().min(1)).min(1)});
export const AdventureRunSchema=z.object({
 version:z.literal(1),campaignId:z.string().min(1),title:z.string().min(1),currentSceneId:z.string().min(1),
 goal:AdventureGoalSchema.optional(),exampleId:z.string().optional(),exampleVersion:z.number().int().nonnegative().optional(),
 geography:z.object({worldId:z.string().min(1),name:z.string().min(1),updatedAt:z.string(),map:WorldMapSchema}).optional(),
 scenes:z.array(z.object({id:z.string().min(1),name:z.string(),placeId:z.string().min(1),mapNodeId:z.string().min(1).optional(),location:z.string().min(1),game:EncounterGameSchema})).min(1),links:z.array(AdventureLinkSchema),
 barriers:z.record(BarrierSchema).optional(),
 savedScenes:z.record(EncounterGameSchema).default({}),actors:z.record(ActorSchema).default({}),
 transitions:z.array(z.object({id:z.string().min(1),linkId:z.string(),from:z.string(),to:z.string(),stateVersion:z.number().int().nonnegative()})).default([])
});
export type AdventureRun=z.infer<typeof AdventureRunSchema>;
export const AdventureTransitionSchema=z.object({id:z.string().min(1),linkId:z.string().min(1),expectedStateVersion:z.number().int().nonnegative()}).strict();
export type AdventureTransition=z.infer<typeof AdventureTransitionSchema>;
