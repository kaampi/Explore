import { z } from "zod";
import { LorebookSchema, type Lorebook } from "./LorebookSchema";

/**
 * Independently implemented reader for Aventuras' documented user-data exchange envelope.
 * No Aventuras runtime code or prompt templates are used.
 */
const Entry = z.object({
  name: z.string().min(1),
  type: z.enum(["character", "location", "item", "faction", "concept", "event"]),
  description: z.string().default(""),
  keywords: z.array(z.string()).default([]),
  aliases: z.array(z.string()).default([]),
  injectionMode: z.enum(["always", "keyword", "never"]).default("keyword"),
  priority: z.number().default(100),
  hiddenInfo: z.string().nullable().optional(),
  loreManagementBlacklisted: z.boolean().optional(),
});
const Document = z.object({
  format: z.literal("aventuras-exchange"),
  formatVersion: z.string(),
  entity: z.literal("lorebook"),
  data: z.object({
    name: z.string().min(1),
    description: z.string().nullable().default(null),
    entries: z.array(Entry).max(5000).default([]),
  }),
});

export function importAventurasLorebook(raw: unknown, sourceName: string): Lorebook {
  const envelope = Document.parse(raw);
  if (!/^1\.\d+\.\d+$/.test(envelope.formatVersion)) {
    throw new Error("Unsupported Aventuras exchange version. Expected 1.x.x.");
  }
  const entries = envelope.data.entries.map((entry, index) => {
    const reasons: string[] = [];
    if (!entry.description.trim()) reasons.push("No usable text content.");
    if (entry.injectionMode === "never") reasons.push("Disabled in source.");
    if (entry.hiddenInfo?.trim()) reasons.push("Contains private story information; review original before activation.");
    if (entry.loreManagementBlacklisted) reasons.push("Excluded from source lore management.");
    if (/{{|^\s*@@/m.test(entry.description) || entry.keywords.some(key => /^\/.+\/[a-z]*$/i.test(key))) {
      reasons.push("Macros or regex require manual adaptation.");
    }
    const keywords = [...new Set([...entry.keywords, ...entry.aliases].map(s => s.trim()).filter(Boolean))];
    if (entry.injectionMode === "keyword" && !keywords.length) reasons.push("No activation keywords.");
    return {
      id: `aventuras:${index}`,
      title: entry.name,
      content: entry.description,
      keywords,
      mode: (reasons.length || entry.injectionMode === "never" ? "dormant" : entry.injectionMode === "always" ? "always" : "keywords") as "dormant" | "always" | "keywords",
      reasons,
      approved: false,
      raw: entry,
      entity: {
        id: `aventuras:${index}`,
        name: entry.name,
        kind: entry.type === "character" ? "character" as const : entry.type === "location" ? "location" as const : "lore" as const,
        category: entry.type,
      },
    };
  });
  return LorebookSchema.parse({
    id: crypto.randomUUID(),
    name: envelope.data.name.slice(0, 200),
    sourceName,
    origin: { format: "aventuras", schemaVersion: envelope.formatVersion },
    importNotes: [
      "Aventuras lorebook exchange only. Character/scenario exchange and .avt story archives require separate import paths.",
      "Entries are disabled until reviewed. Source priorities and injection semantics are not executed; original fields remain in raw data.",
      "Story-only information is never activated automatically.",
    ],
    importedAt: new Date().toISOString(),
    raw,
    binding: { kind: "none", targetId: "" },
    entries,
  });
}
