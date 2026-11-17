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
