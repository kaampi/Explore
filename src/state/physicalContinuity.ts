import { z } from "zod";
import { PhysicalRelationSchema, PhysicalStateSchema, type PhysicalRelation, type PhysicalState } from "./StateSchema";

/**
 * Independent semantic continuity rules. No humanoid anatomy is assumed:
 * subjects and targets may be actors, body parts, equipment or mounts.
 * A caller must explicitly commit the resulting state via the State Engine.
 */
const PhysicalChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stance"), actor: z.string().min(1).max(100), stance: z.enum(["standing", "sitting", "lying", "kneeling", "crouching", "all_fours", "moving"]) }),
  z.object({ kind: z.literal("set_relation"), relation: PhysicalRelationSchema }),
  z.object({ kind: z.literal("remove_relation"), id: z.string().min(1).max(100) })
]);

export type PhysicalChange =
  | { kind: "stance"; actor: string; stance: PhysicalState["stances"][string] }
  | { kind: "set_relation"; relation: PhysicalRelation }
  | { kind: "remove_relation"; id: string };

export type PhysicalChangeResult =
  | { ok: true; state: PhysicalState }
  | { ok: false; reason: string };

const OPPOSITES: Record<string, string> = {
  behind: "in_front_of",
  in_front_of: "behind"
};

export function applyPhysicalChange(
  input: PhysicalState | undefined,
  change: PhysicalChange
): PhysicalChangeResult {
  const parsedChange = PhysicalChangeSchema.safeParse(change);
  if (!parsedChange.success) return { ok: false, reason: "Invalid physical change." };
  change = parsedChange.data;
  const current = PhysicalStateSchema.parse(input ?? {});
  if (change.kind === "stance") {
    if (!change.actor.trim()) return { ok: false, reason: "Actor is required." };
    return { ok: true, state: { ...current, stances: { ...current.stances, [change.actor]: change.stance } } };
  }
  if (change.kind === "remove_relation") {
    if (!current.relations.some((r) => r.id === change.id))
      return { ok: false, reason: "Relation does not exist." };
    return { ok: true, state: { ...current, relations: current.relations.filter((r) => r.id !== change.id) } };
  }

  const parsed = PhysicalRelationSchema.safeParse(change.relation);
  if (!parsed.success) return { ok: false, reason: "Invalid physical relation." };
  const relation = parsed.data;
  if (relation.subject === relation.target && !relation.subjectPart && !relation.targetPart)
    return { ok: false, reason: "An entity cannot relate spatially to itself." };
  const others = current.relations.filter((r) => r.id !== relation.id);
  if (others.some((r) =>
    r.subject === relation.subject &&
    r.target === relation.target &&
    r.subjectPart === relation.subjectPart &&
    r.targetPart === relation.targetPart &&
    (r.relation === OPPOSITES[relation.relation] || OPPOSITES[r.relation] === relation.relation)
  )) return { ok: false, reason: "Conflicting spatial relation; remove or update the previous fact explicitly." };
  // An explicit exclusive grip occupies exactly the named part.
  // Generic contact, support and unnamed limbs do not reserve capacity.
  // An unknown body plan must never be assumed to have two arms.
  if (relation.exclusive && (relation.relation === "holding" || relation.relation === "restraining") && relation.subjectPart) {
    const conflict = others.find((other) =>
      other.exclusive &&
      (other.relation === "holding" || other.relation === "restraining") &&
      other.subject === relation.subject &&
      other.subjectPart === relation.subjectPart &&
      (other.target !== relation.target || other.targetPart !== relation.targetPart)
    );
    if (conflict) return {
      ok: false,
      reason: `Body part ${relation.subject}.${relation.subjectPart} is already occupied by relation ${conflict.id}; release it explicitly first.`
    };
  }
  const next = PhysicalStateSchema.safeParse({ ...current, relations: [...others, relation] });
  if (!next.success) return { ok: false, reason: "Physical state exceeds its limits." };
  return { ok: true, state: next.data };
}

/** A deterministic, compact scene summary without an extra model call. */
export function describePhysicalState(state: PhysicalState | undefined, limit = 30): string[] {
  if (!state) return [];
  const lines = Object.entries(state.stances).map(([actor, stance]) => `${actor}: ${stance}`);
  for (const r of state.relations) {
    lines.push(`${r.subject}${r.subjectPart ? `.${r.subjectPart}` : ""} ${r.relation.replaceAll("_", " ")} ${r.target}${r.targetPart ? `.${r.targetPart}` : ""}${r.note ? ` (${r.note})` : ""}`);
  }
  return lines.slice(0, Math.max(0, limit));
}
