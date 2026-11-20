import { z } from "zod";
import { StoryboardPositionSchema } from "../library/storyboardPosition";

export const CutsceneTriggerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("link"), linkId: z.string().min(1) }),
  z.object({
    kind: z.literal("scene"),
    sceneId: z.string().min(1),
    every: z.boolean().default(false),
  }),
  z.object({ kind: z.literal("facts"), flags: z.array(z.string().min(1)).min(1) }),
]);

export const CutsceneSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  paragraphs: z.array(z.string().trim().min(1).max(1200)).min(1).max(20),
  imageDataUrl: z.string().optional(),
  trigger: CutsceneTriggerSchema,
  setsFlags: z.array(z.string().min(1)).default([]),
  minutes: z.number().int().nonnegative().optional(),
  position: StoryboardPositionSchema.optional(),
  storyboardSectionId: z.string().min(1).optional(),
});
export type Cutscene = z.infer<typeof CutsceneSchema>;
