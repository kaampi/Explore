import { z } from "zod";

/** Where a local card was copied from in a shared manuscript. Never grants writes back to it. */
export const CoreOriginSchema = z.object({
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  entityRef: z.string().min(1),
  revision: z.number().int().positive(),
});
export type CoreOrigin = z.infer<typeof CoreOriginSchema>;

/**
 * What a place, thing or group looked like in the manuscript when it was last accepted: its name
 * and one text made of its look and its facts. Updates are compared with it, so changes made
 * here are noticed and never overwritten without asking.
 */
export const CoreEntitySnapshotSchema = z.object({
  name: z.string(),
  text: z.string(),
});
export type CoreEntitySnapshot = z.infer<typeof CoreEntitySnapshotSchema>;

/**
 * What a manuscript's event leaves on a scene draft: where it came from, what it says, and the
 * people, place and things on the author's cards it seems to mention. Notes for the author to
 * work from, never game content: nothing here is played, and it is never sent to a model.
 */
export const SceneDraftSchema = z.object({
  origin: CoreOriginSchema,
  facts: z.array(z.object({ label: z.string().max(120), value: z.string().max(2000) })).max(40),
  suggestedCharacterIds: z.array(z.string()).default([]),
  /** Set only when exactly one place matched. */
  suggestedPlaceId: z.string().optional(),
  /** Set when several places matched, so the author can choose. */
  otherPlaceIds: z.array(z.string()).default([]),
  suggestedObjectIds: z.array(z.string()).default([]),
});
export type SceneDraft = z.infer<typeof SceneDraftSchema>;
