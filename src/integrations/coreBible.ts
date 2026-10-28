import { newCharacterTemplate, type CharacterTemplate } from "@library/LibrarySchema";
import { portraitSrc } from "@ui/studio/portrait";
import type { CoreBibleEntity } from "./coreBibleSchema";
import { coreFactId, snapshotCoreCharacter } from "./coreCharacterUpdates";

/** An explicit import creates a new Sandbox-owned card. It never reuses a Storybook ID. */
export function copyCoreCharacter(
  entity: CoreBibleEntity,
  source: { workspaceId: string; projectId: string; revision: number },
): CharacterTemplate {
  const name = entity.name.trim();
  if (!name || !entity.entity_ref.trim()) throw new Error("This character has no usable identity.");
  const portrait = portraitSrc(entity.referenceImages[0]);
  return newCharacterTemplate({
    name,
    personality: entity.personality?.trim() ?? "",
    appearance: entity.looks?.trim() ?? "",
    ...(entity.pronoun && entity.pronoun.trim().length <= 32 ? { pronoun: entity.pronoun.trim() } : {}),
    ...(Number.isInteger(entity.approximateAge) && entity.approximateAge! >= 1 && entity.approximateAge! <= 130 ? { approximateAge: entity.approximateAge } : {}),
    ...(portrait ? { portraitDataUrl: portrait } : {}),
    lore: entity.facts.filter(fact => fact.value.trim()).map((fact) => ({
      id: coreFactId(fact.predicate.trim()), title: fact.label.trim(), content: `${name}: ${fact.label.trim()}: ${fact.value.trim()}`, keywords: [],
    })),
    coreOrigin: { workspaceId: source.workspaceId, projectId: source.projectId, entityRef: entity.entity_ref, revision: source.revision },
    coreSnapshot: snapshotCoreCharacter(entity),
  });
}
