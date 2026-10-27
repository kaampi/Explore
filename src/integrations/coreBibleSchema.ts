import { z } from "zod";

export const CoreBibleSectionSchema = z.object({
  kind: z.enum(["characters", "locations", "objects", "groups", "events", "concepts"]),
  label: z.string(),
  entities: z.array(z.object({
    entity_ref: z.string().min(1),
    name: z.string(),
    facts: z.array(z.object({ predicate: z.string(), label: z.string(), value: z.string() })),
    pronoun: z.string().optional(),
    approximateAge: z.number().optional(),
    looks: z.string().optional(),
    personality: z.string().optional(),
    referenceImages: z.array(z.string()),
  })),
});

export const CoreBibleSchema = z.array(CoreBibleSectionSchema);
export type CoreBibleSection = z.infer<typeof CoreBibleSectionSchema>;
export type CoreBibleEntity = CoreBibleSection["entities"][number];
