import type { Session, PhysicalRelation } from "./StateSchema";

/**
 * Validate only entities that explicitly opt into a pinned body plan.
 * Untemplated characters, player, mounts and objects remain permissive.
 */
export function validateAnatomicalRelation(
  session: Pick<Session, "characters" | "anatomyTemplates">,
  relation: PhysicalRelation
): string | undefined {
  for (const [entityId, partId] of [
    [relation.subject, relation.subjectPart],
    [relation.target, relation.targetPart]
  ] as const) {
    if (!partId) continue;
    const character = session.characters[entityId];
    if (!character?.anatomyTemplateId) continue;
    const template = session.anatomyTemplates?.[character.anatomyTemplateId];
    // A missing snapshot cannot safely constrain a legacy or partially migrated session.
    if (!template) continue;
    const added = character.anatomyOverrides?.addedParts ?? [];
    const removed = character.anatomyOverrides?.removedParts ?? [];
    if ((!template.parts.some((part) => part.id === partId) && !added.includes(partId)) || removed.includes(partId)) {
      return `${entityId} has no available body part "${partId}" in anatomy template "${template.id}".`;
    }
  }
  return undefined;
}
