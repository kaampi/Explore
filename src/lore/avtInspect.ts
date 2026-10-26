import { z } from "zod";

/**
 * Independent structural reader for Aventuras .avt JSON exports.
 * Read-only: never executes source prompts or changes a running session.
 * Large embeddedImages payloads are deliberately not loaded by this adapter.
 */
const archiveSchema = z.object({
  version: z.union([z.string(), z.number()]).optional(),
  story: z.record(z.unknown()).optional(),
  entries: z.array(z.unknown()).max(100_000).optional(),
  characters: z.array(z.unknown()).max(5_000).optional(),
  lorebookEntries: z.array(z.unknown()).max(5_000).optional(),
  locations: z.array(z.unknown()).max(5_000).optional(),
  items: z.array(z.unknown()).max(5_000).optional(),
  chapters: z.array(z.unknown()).max(5_000).optional(),
  checkpoints: z.array(z.unknown()).max(5_000).optional(),
  branches: z.array(z.unknown()).max(5_000).optional(),
  worldStateRecords: z.array(z.unknown()).max(100_000).optional(),
  embeddedImages: z.array(z.unknown()).max(5_000).optional(),
}).passthrough();
export type AvtOverview = {
  title: string;
  entryCount: number;
  characterCount: number;
  lorebookCount: number;
  locationCount: number;
  itemCount: number;
  chapterCount: number;
  checkpointCount: number;
  branchCount: number;
  worldStateRecordCount: number;
  imageCount: number;
  warnings: string[];
};
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function inspectAvtStructure(raw: unknown): AvtOverview {
  const doc = archiveSchema.parse(raw);
  if (!doc.version || !doc.story || !doc.entries?.length) throw new Error("Missing required Aventuras version, story or story entries.");
  const story = record(doc.story);
  const title = typeof story?.title === "string" ? story.title : typeof story?.name === "string" ? story.name : "Imported Aventuras story";
  return {
    title, entryCount: doc.entries?.length ?? 0, characterCount: doc.characters?.length ?? 0,
    lorebookCount: doc.lorebookEntries?.length ?? 0, imageCount: doc.embeddedImages?.length ?? 0,
    locationCount: doc.locations?.length ?? 0, itemCount: doc.items?.length ?? 0,
    chapterCount: doc.chapters?.length ?? 0, checkpointCount: doc.checkpoints?.length ?? 0,
    branchCount: doc.branches?.length ?? 0, worldStateRecordCount: doc.worldStateRecords?.length ?? 0,
    warnings: [
      "Read-only inspection. No imported history is replayed as instructions.",
      "Image payloads require a separate size-limited import; never embed them in conversation context.",
      "References and session state require ID remapping and explicit confirmation before import.",
    ],
  };
}
export async function inspectAvtFile(file: File): Promise<AvtOverview> {
  if (!file.name.toLowerCase().endsWith(".avt")) throw new Error("Choose an .avt story export.");
  if (file.size > 20 * 1024 * 1024) throw new Error("This browser inspector supports .avt files up to 20 MB; larger archives need streaming import.");
  return inspectAvtStructure(JSON.parse(await file.text()) as unknown);
}
