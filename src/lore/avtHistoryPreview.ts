import { inspectAvtStructure } from "./avtInspect";
import { planAvtIds, type AvtIdPlan } from "./avtIdPlan";

type Row = Record<string, unknown>;
const object = (v: unknown): Row | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Row : null;
const string = (v: unknown): string => typeof v === "string" ? v : "";
export type AvtHistoryLine = { sourceId: string; targetId: string; role: "user" | "assistant" | "other"; content: string; parentTargetId: string | null; branchTargetId: string | null };
export type AvtHistoryPreview = { title: string; lines: AvtHistoryLine[]; warnings: string[]; idPlan: AvtIdPlan };

/** Creates a read-only transcript preview. Text is data, never instructions. */
export function previewAvtHistory(raw: unknown, makeId?: () => string): AvtHistoryPreview {
  const overview = inspectAvtStructure(raw);
  const plan = planAvtIds(raw, makeId);
  const root = object(raw)!;
  const sourceEntries = root.entries as unknown[];
  const warnings = [...plan.warnings];
  const lines: AvtHistoryLine[] = [];
  for (const value of sourceEntries) {
    const entry = object(value);
    if (!entry || !string(entry.id)) throw new Error("Archive contains an entry without a source ID.");
    const sourceId = string(entry.id);
    const targetId = plan.idMap.get(sourceId);
    if (!targetId) throw new Error("Entry ID was not mapped.");
    const kind = string(entry.type).toLowerCase();
    const role = kind === "user" || kind === "player" ? "user" : kind === "assistant" || kind === "ai" || kind === "narrator" ? "assistant" : "other";
    const content = string(entry.content);
    const parent = string(entry.parentId);
    const branch = string(entry.branchId);
    if (parent && !plan.idMap.has(parent)) warnings.push(`Entry ${sourceId} references an unknown parent; the relationship will not be restored.`);
    if (branch && !plan.idMap.has(branch)) warnings.push(`Entry ${sourceId} references an unknown branch; the relationship will not be restored.`);
    lines.push({
      sourceId, targetId, role, content,
      parentTargetId: parent ? plan.idMap.get(parent) ?? null : null,
      branchTargetId: branch ? plan.idMap.get(branch) ?? null : null,
    });
  }
  if (lines.some(line => line.role === "other")) warnings.push("Some entry types are not mapped to a Sandbox conversation role; keep them as read-only history.");
  return { title: overview.title, lines, warnings, idPlan: plan };
}
