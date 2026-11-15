import { z } from "zod";
import { ActorSchema, BarrierSchema, EncounterGameSchema } from "./EncounterSchema";
import { WorldMapSchema } from "../library/worldMap";
/** Shared with Storyboard; kept independent of library/session schemas. */
export const AdventureLinkSchema = z.object({
  id: z.string().min(1),
  fromSceneId: z.string().min(1),
  toSceneId: z.string().min(1),
  requiresFlags: z.array(z.string().min(1)).default([]),
  requiresOpenBarriers: z.array(z.string().min(1)).optional(),
  requiresAbsentFlags: z.array(z.string().min(1)).default([]),
  setsFlags: z.array(z.string().min(1)).default([]),
  label: z.string().default(""),
});
export const AdventureGoalSchema = z.object({
  title: z.string().trim().min(1),
  requiresFlags: z.array(z.string().min(1)).min(1),
});
/** What the story AI may know about a person. Written by the author. No pictures, no secrets. */
export const PersonaSchema = z.object({
  name: z.string().min(1).max(120),
  pronoun: z.string().max(40).optional(),
  personality: z.string().max(600).default(""),
  speech: z.string().max(600).default(""),
  mood: z.string().max(600).default(""),
  appearance: z.string().max(600).default(""),
});
export type Persona = z.infer<typeof PersonaSchema>;
export const AdventureNarrationSchema = z.object({
  /** The narrator voice card's instruction. */
  voice: z.string().max(2000).optional(),
  /** The adventure's background story. */
  background: z.string().max(4000).optional(),
  /** False turns off free replies from people in this adventure. */
  freeReplies: z.boolean().default(true),
});
export type AdventureNarration = z.infer<typeof AdventureNarrationSchema>;
export const AdventureRunSchema = z.object({
  version: z.literal(1),
  campaignId: z.string().min(1),
  title: z.string().min(1),
  currentSceneId: z.string().min(1),
  goal: AdventureGoalSchema.optional(),
  /** Keyed by actor id, for example "npc:<characterId>". Older runs have none. */
  cast: z.record(PersonaSchema).default({}),
  narration: AdventureNarrationSchema.optional(),
  exampleId: z.string().optional(),
  exampleVersion: z.number().int().nonnegative().optional(),
  geography: z
    .object({
      worldId: z.string().min(1),
      name: z.string().min(1),
      updatedAt: z.string(),
      map: WorldMapSchema,
    })
    .optional(),
  scenes: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        placeId: z.string().min(1),
        mapNodeId: z.string().min(1).optional(),
        location: z.string().min(1),
        game: EncounterGameSchema,
      }),
    )
    .min(1),
  links: z.array(AdventureLinkSchema),
  barriers: z.record(BarrierSchema).optional(),
  savedScenes: z.record(EncounterGameSchema).default({}),
  actors: z.record(ActorSchema).default({}),
  transitions: z
    .array(
      z.object({
        id: z.string().min(1),
        linkId: z.string(),
        from: z.string(),
        to: z.string(),
        stateVersion: z.number().int().nonnegative(),
      }),
    )
    .default([]),
});
export type AdventureRun = z.infer<typeof AdventureRunSchema>;
export const AdventureTransitionSchema = z
  .object({
    id: z.string().min(1),
    linkId: z.string().min(1),
    expectedStateVersion: z.number().int().nonnegative(),
  })
  .strict();
export type AdventureTransition = z.infer<typeof AdventureTransitionSchema>;
