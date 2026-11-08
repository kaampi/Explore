import { z } from "zod";

export const FactionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().default(""),
  history: z.string().trim().optional(),
  images: z.array(z.object({
    imageDataUrl: z.string().startsWith("data:image/"),
    thumbDataUrl: z.string().startsWith("data:image/")
  })).optional(),
  alliedFactionIds: z.array(z.string().min(1)).optional(),
  hostileFactionIds: z.array(z.string().min(1)).optional()
});

export type Faction = z.infer<typeof FactionSchema>;
