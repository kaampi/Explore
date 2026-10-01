import { z } from "zod";

export const ActionDefinitionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(100),
  attributeId: z.string().trim().min(1),
  when: z.string().trim().min(1).max(1000),
  successMeaning: z.string().trim().min(1).max(1000),
  prerequisites: z.string().trim().max(2000).optional(),
  limits: z.string().trim().max(2000).optional()
});
export type ActionDefinition = z.infer<typeof ActionDefinitionSchema>;

export function validateActionDefinitions(
  ruleset: { attributes: { id: string; kind: string }[]; actions?: ActionDefinition[] | undefined },
  ctx: z.RefinementCtx
) {
  const ids = new Set<string>();
  for (const [index, action] of (ruleset.actions ?? []).entries()) {
    if (ids.has(action.id)) ctx.addIssue({ code: "custom", path: ["actions", index, "id"], message: "Action IDs must be unique." });
    ids.add(action.id);
    if (!ruleset.attributes.some((def) => def.id === action.attributeId && def.kind === "number")) {
      ctx.addIssue({ code: "custom", path: ["actions", index, "attributeId"], message: "Each action must use an existing numeric attribute." });
    }
  }
}
