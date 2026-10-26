import { z } from "zod";
import { LorebookSchema, type Lorebook } from "./LorebookSchema";

/** Portable Aventuras exchange reader. Independent implementation, no source code reused. */
const strings = z.array(z.string()).default([]);
const character = z.object({
  name: z.string().trim().min(1),
  description: z.string().nullable().default(null),
  traits: strings,
  visualDescriptors: z.record(z.unknown()).default({}),
  portrait: z.string().nullable().default(null),
  tags: strings,
});
const npc = z.object({
  name: z.string(),
  role: z.string().default(""),
  description: z.string().default(""),
  relationship: z.string().default(""),
  traits: strings,
});
const scenario = z.object({
  name: z.string().trim().min(1),
  description: z.string().nullable().default(null),
  settingSeed: z.string().default(""),
  npcs: z.array(npc).max(5000).default([]),
  primaryCharacterName: z.string().default(""),
  firstMessage: z.string().nullable().default(null),
  alternateGreetings: strings,
  startingTime: z.unknown().optional(),
});
const envelope = z.object({
  format: z.literal("aventuras-exchange"),
  formatVersion: z.string(),
  entity: z.enum(["character", "scenario"]),
  data: z.unknown(),
});
type Draft = { title: string; content: string; kind: "character" | "location" | "lore"; category: string; raw: unknown };
const clean = (s: string) => s.trim();
const join = (parts: Array<string | null | undefined>) => parts.filter((x): x is string => !!x?.trim()).join("\n\n");
const label = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2");
function descriptionParts(data: z.infer<typeof character>): string {
  const visuals = Object.entries(data.visualDescriptors).filter(([, value]) => typeof value === "string" && value.trim())
    .map(([key, value]) => `${label(key)}: ${value}`);
  return join([data.description, data.traits.length ? `Traits: ${data.traits.join(", ")}` : "", ...visuals]);
}
function makeBook(raw: unknown, sourceName: string, version: string, name: string, drafts: Draft[], notes: string[]): Lorebook {
  const entries = drafts.map((draft, i) => {
    const reasons: string[] = [];
    if (!draft.content.trim()) reasons.push("No usable text content.");
    if (/{{|^\s*@@/m.test(draft.content)) reasons.push("Macros or instructions need manual adaptation.");
    return {
      id: `aventuras:${i}`, title: draft.title, content: draft.content,
      keywords: [draft.title], mode: (reasons.length ? "dormant" : "keywords") as "dormant" | "keywords", reasons, approved: false,
      raw: draft.raw,
      entity: { id: `aventuras:${i}`, name: draft.title, kind: draft.kind, category: draft.category },
    };
  });
  return LorebookSchema.parse({
    id: crypto.randomUUID(), name: name.slice(0, 200), sourceName,
    origin: { format: "aventuras", schemaVersion: version },
    importNotes: notes, importedAt: new Date().toISOString(), raw,
    binding: { kind: "none", targetId: "" }, entries,
  });
}

/** Character and scenario exports are staged as dormant, lossless review data.
 * They cannot become active instructions or world state through import.
 */
export function importAventurasOther(raw: unknown, sourceName: string): Lorebook {
  const doc = envelope.parse(raw);
  if (!/^1\.\d+\.\d+$/.test(doc.formatVersion)) throw new Error("Unsupported Aventuras exchange version. Expected 1.x.x.");
  if (doc.entity === "character") {
    const data = character.parse(doc.data);
    return makeBook(raw, sourceName, doc.formatVersion, data.name, [{
      title: data.name, kind: "character", category: "character",
      content: descriptionParts(data), raw: doc.data,
    }], [
      "Aventuras character export staged for review. Portrait, tags, and metadata remain in the original source; no remote images are fetched.",
      "The character is not automatically created in the library or activated in a conversation.",
    ]);
  }
  const data = scenario.parse(doc.data);
  const drafts: Draft[] = [{
    title: data.name, kind: "lore", category: "scenario",
    content: join([data.description, data.settingSeed && `Setting: ${data.settingSeed}`]), raw: doc.data,
  }, ...data.npcs.filter(n => clean(n.name)).map(n => ({
    title: n.name, kind: "character" as const, category: "character",
    content: join([n.description, n.role && `Role: ${n.role}`, n.relationship && `Relationship: ${n.relationship}`, n.traits.length ? `Traits: ${n.traits.join(", ")}` : ""]),
    raw: n,
  }))];
  return makeBook(raw, sourceName, doc.formatVersion, data.name, drafts, [
    "Aventuras scenario staged as dormant review entries. Starting time, greetings, and source metadata remain in raw data.",
    "NPCs are not automatically created. Scenario instructions and opening messages are not executed.",
  ]);
}
