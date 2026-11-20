import type { z } from "zod";
import { LegacyCutsceneSchema } from "../cutscenes/schema";

export {
  CutsceneTriggerSchema,
  CutsceneFilmSchema,
  CutscenePlacementSchema,
  type CutsceneFilm,
  type CutscenePlacement,
} from "../cutscenes/schema";

// The existing game integration still reads version 1 until the player is connected.
export { LegacyCutsceneSchema as CutsceneSchema };
export type Cutscene = z.infer<typeof LegacyCutsceneSchema>;
