import { z } from "zod";

export const LorebookSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  sourceName: z.string(),
  origin: z.object({ format: z.enum(["ai-dungeon", "onlyworlds", "azgaar", "aventuras"]), worldId: z.string().optional(), schemaVersion: z.string().optional() }).optional(),
  importNotes: z.array(z.string()).optional(),
  materializedCharacterIds: z.array(z.string()).optional(),
  materializedRealmId: z.string().optional(),
  importedAt: z.string().datetime(),
  raw: z.unknown().refine(value => value !== undefined, "Original source data is required."),
  binding: z.object({
    kind: z.enum(["none", "character", "campaign", "realm", "all"]),
    targetId: z.string().default(""),
  }),
  entries: z.array(z.object({
    id: z.string().min(1),
    title: z.string(),
    content: z.string(),
    keywords: z.array(z.string()),
    mode: z.enum(["always", "keywords", "dormant"]),
    reasons: z.array(z.string()),
    approved: z.boolean(),
    entity: z.object({ id: z.string(), name: z.string(), kind: z.enum(["character", "location", "lore"]), category: z.string(), links: z.array(z.object({ field: z.string(), id: z.string(), name: z.string() })).optional() }).optional(),
    raw: z.unknown().refine(value => value !== undefined, "Original source data is required."),
  })),
});
export type Lorebook = z.infer<typeof LorebookSchema>;
export type LoreEntry = Lorebook["entries"][number];
