import { z } from "zod";

export const LorebookSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  sourceName: z.string(),
  importedAt: z.string().datetime(),
  raw: z.unknown().refine(value => value !== undefined, "Original source data is required."),
  binding: z.object({
    kind: z.enum(["none", "character", "campaign", "all"]),
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
    raw: z.unknown().refine(value => value !== undefined, "Original source data is required."),
  })),
});
export type Lorebook = z.infer<typeof LorebookSchema>;
export type LoreEntry = Lorebook["entries"][number];
