import { z } from "zod";

/** Canvas placement on the Storyboard. Missing means it has not been placed. */
export const StoryboardPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type StoryboardPosition = z.infer<typeof StoryboardPositionSchema>;
