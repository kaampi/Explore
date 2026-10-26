import { inspectAvtStructure } from "./avtInspect";

type Data = Record<string, unknown>;
const obj = (value: unknown): Data | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Data : null;
const str = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export type AvtMigrationCandidate = {
  kind: "character" | "location" | "item";
  sourceId: string;
  name: string;
  description: string;
  eligible: boolean;
  reasons: string[];
};
export type AvtMigrationReview = {
  candidates: AvtMigrationCandidate[];
  chapterCount: number;
  worldStateCount: number;
  warnings: string[];
};
/** Display-only candidate extraction. No source fields become engine state or prompt layers. */
export function reviewAvtMigration(raw: unknown): AvtMigrationReview {
  const overview = inspectAvtStructure(raw);
  const root = obj(raw)!;
  const candidates: AvtMigrationCandidate[] = [];
  const seen = new Set<string>();
  for (const [field, kind] of [["characters", "character"], ["locations", "location"], ["items", "item"]] as const) {
    for (const value of list(root[field])) {
      const row = obj(value);
      const sourceId = str(row?.id);
      const name = str(row?.name);
      const reasons: string[] = [];
      if (!sourceId) reasons.push("Missing source ID");
      if (!name) reasons.push("Missing name");
      if (sourceId && seen.has(sourceId)) reasons.push("Duplicate source ID");
      if (sourceId) seen.add(sourceId);
      if (name.length > 200) reasons.push("Name exceeds 200 characters");
      const description = str(row?.description).slice(0, 600);
      candidates.push({ kind, sourceId, name: name.slice(0, 200), description, eligible: reasons.length === 0, reasons });
    }
  }
  return {
    candidates,
    chapterCount: overview.chapterCount,
    worldStateCount: overview.worldStateRecordCount,
    warnings: [
      "Candidates are untrusted source data. Names and descriptions are for human review only.",
      "Chapter summaries, item effects, relationship values and world-state changes are not activated.",
      "Nothing in this review creates a playable session or modifies an existing archive.",
    ],
  };
}
