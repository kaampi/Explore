import { z } from "zod";
import { ActorSchema, BarrierSchema, EncounterGameSchema } from "./EncounterSchema";
import { CutsceneFilmSchema, CutscenePlacementSchema } from "./CutsceneSchema";
import { migrateCutsceneDocument } from "../cutscenes/schema";
import { WorldMapSchema } from "../library/worldMap";
import { INITIAL_GAME_MINUTES } from "../state/gameClock";
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
  /** Travel time in minutes, when the way has one. */
  minutes: z.number().int().nonnegative().optional(),
});
export const AdventureGoalSchema = z.object({
  title: z.string().trim().min(1),
  requiresFlags: z.array(z.string().min(1)).min(1),
});
/**
 * What the story AI may know about a person. Written by the author. No secrets. The portrait is
 * for showing the person; it is never put into a prompt.
 */
export const PersonaSchema = z.object({
  name: z.string().min(1).max(120),
  pronoun: z.string().max(40).optional(),
  personality: z.string().max(600).default(""),
  speech: z.string().max(600).default(""),
  mood: z.string().max(600).default(""),
  appearance: z.string().max(600).default(""),
  /** The body, in a few words, when it is not an ordinary human one. Filled when the game starts. */
  body: z.string().max(300).optional(),
  /** The groups they belong to. Filled when the game starts. */
  factions: z.string().max(300).optional(),
  /** Copied from the character card when the game starts. Only for showing the person. */
  portraitDataUrl: z.string().optional(),
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
export const AdventureRunSchema = z.preprocess(
  migrateCutsceneDocument,
  z.object({
    version: z.literal(1),
    campaignId: z.string().min(1),
    title: z.string().min(1),
    currentSceneId: z.string().min(1),
    /** Game time in minutes. Ways and completed cut-scenes can advance it. */
    clockMinutes: z.number().int().nonnegative().default(INITIAL_GAME_MINUTES),
    /**
     * Things the player chose to keep from a free reply, by scene id. They are words the player
     * approved, not facts the engine knows, and they change nothing in the game.
     */
    notes: z.record(z.string(), z.array(z.string().min(1).max(300)).max(8)).default({}),
    /** Set from the world when the run starts: whether empty places may get invented residents. */
    openWorld: z.object({ generateResidents: z.boolean() }).optional(),
    /** Places whose residents have been settled once, however it went. They are never populated again. */
    settled: z.array(z.string().min(1)).default([]),
    goal: AdventureGoalSchema.optional(),
    /**
     * The number of the last turn of the story at the moment the goal was reached, so that the
     * story can tell of it there. Missing: not reached yet, or reached before this was kept.
     */
    goalReachedTurn: z.number().int().nonnegative().optional(),
    /** Keyed by actor id, for example "npc:<characterId>". Older runs have none. */
    cast: z.record(PersonaSchema).default({}),
    /**
     * How a person seems in one scene, by scene id and then actor id, as the author wrote it for
     * that scene. It comes before the mood on the character card. Older runs have none.
     */
    moods: z.record(z.string(), z.record(z.string(), z.string().max(600))).default({}),
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
    cutscenes: z.array(CutscenePlacementSchema).default([]),
    cutsceneFilms: z.array(CutsceneFilmSchema).default([]),
    cutscenesSeen: z.array(z.string()).default([]),
    cutscenesPending: z.array(z.string()).default([]),
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
          // Older transitions only stored the way, so their time can be reconstructed from it.
          clockMinutes: z.number().int().nonnegative().optional(),
        }),
      )
      .default([]),
  }),
);
export type AdventureRun = z.infer<typeof AdventureRunSchema>;
export const AdventureTransitionSchema = z
  .object({
    id: z.string().min(1),
    linkId: z.string().min(1),
    expectedStateVersion: z.number().int().nonnegative(),
  })
  .strict();
export type AdventureTransition = z.infer<typeof AdventureTransitionSchema>;
