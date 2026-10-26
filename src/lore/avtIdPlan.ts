import { inspectAvtStructure } from "./avtInspect";

type Row = Record<string, unknown>;
const obj = (v: unknown): Row | null => v && typeof v === "object" && !Array.isArray(v) ? v as Row : null;
const rows = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const id = (v: unknown): string => typeof v === "string" ? v : "";
export type AvtIdPlan = {
  storyId: string;
  idMap: ReadonlyMap<string, string>;
  warnings: string[];
  overview: ReturnType<typeof inspectAvtStructure>;
};
/** Builds an isolated import plan. No writes, source IDs never reused in the destination. */
export function planAvtIds(raw: unknown, generateId: () => string = () => crypto.randomUUID()): AvtIdPlan {
  const overview = inspectAvtStructure(raw);
  const root = obj(raw)!;
  const collections = ["entries", "characters", "locations", "items", "chapters", "checkpoints", "branches", "lorebookEntries", "worldStateRecords", "worldStateMarks", "timeAnchors"];
  const seen = new Set<string>();
  const idMap = new Map<string, string>();
  const storyId = id(obj(root.story)?.id);
  if (!storyId) throw new Error("Story is missing its source ID.");
  const warnings: string[] = [...overview.warnings];
  const add = (old: string, context: string) => {
    if (!old) throw new Error(`Missing source ID in ${context}.`);
    if (seen.has(old)) throw new Error(`Duplicate source ID: ${old}.`);
    seen.add(old);
    const next = generateId();
    if (!next || next === old || [...idMap.values()].includes(next)) throw new Error("ID generator returned a duplicate or unsafe ID.");
    idMap.set(old, next);
  };
  add(storyId, "story");
  for (const collection of collections) {
    for (const value of rows(root[collection])) {
      const row = obj(value);
      if (!row) throw new Error(`Invalid row in ${collection}.`);
      if (!id(row.id)) {
        warnings.push(`Unidentified record in ${collection} must remain read-only until a schema-specific mapping is available.`);
        continue;
      }
      add(id(row.id), collection);
    }
  }
  return { storyId: idMap.get(storyId)!, idMap, warnings, overview };
}
