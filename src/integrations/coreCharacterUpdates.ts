import type { CharacterTemplate } from "@library/LibrarySchema";
import type { CoreBibleEntity } from "./coreBibleSchema";

/** Stable provenance; revision is intentionally not part of identity. */
export type CoreCharacterSource = {
  workspaceId: string;
  projectId: string;
  entityRef: string;
  revision: number;
};

export type CoreCharacterSnapshot = {
  name: string;
  personality: string;
  appearance: string;
  pronoun?: string;
  approximateAge?: number;
  facts: { predicate: string; label: string; value: string }[];
};

export type CoreCharacterChange = {
  key: string;
  label: string;
  previous: string;
  incoming: string;
  local: string;
  conflict: boolean;
};

const fields = [
  ["name", "Name"],
  ["personality", "Personality"],
  ["appearance", "Appearance"],
  ["pronoun", "Pronoun"],
  ["approximateAge", "Age"],
] as const;

export function sameCoreCharacter(character: CharacterTemplate, source: CoreCharacterSource): boolean {
  const origin = character.coreOrigin;
  return !!origin && origin.workspaceId === source.workspaceId &&
    origin.projectId === source.projectId && origin.entityRef === source.entityRef;
}

export function snapshotCoreCharacter(entity: CoreBibleEntity): CoreCharacterSnapshot {
  return {
    name: entity.name.trim(),
    personality: entity.personality?.trim() ?? "",
    appearance: entity.looks?.trim() ?? "",
    ...(entity.pronoun ? { pronoun: entity.pronoun.trim() } : {}),
    ...(entity.approximateAge !== undefined ? { approximateAge: entity.approximateAge } : {}),
    facts: entity.facts.filter(f => f.value.trim()).map(f => ({
      predicate: f.predicate.trim(), label: f.label.trim(), value: f.value.trim(),
    })),
  };
}

function fieldValue(record: CoreCharacterSnapshot, key: string): string {
  const value = record[key as keyof Omit<CoreCharacterSnapshot, "facts">];
  return value === undefined ? "" : String(value);
}

function localField(character: CharacterTemplate, key: string): string {
  const value = character[key as keyof CharacterTemplate];
  return value === undefined ? "" : String(value);
}

/**
 * Three-way review: compare the last accepted Core snapshot to the latest
 * approved export, and flag local edits rather than silently overwriting them.
 * No writes occur here.
 */
export function reviewCoreCharacter(
  character: CharacterTemplate,
  previous: CoreCharacterSnapshot,
  incoming: CoreBibleEntity,
): CoreCharacterChange[] {
  const next = snapshotCoreCharacter(incoming);
  const changes: CoreCharacterChange[] = [];
  for (const [key, label] of fields) {
    const before = fieldValue(previous, key);
    const after = fieldValue(next, key);
    if (before === after) continue;
    const local = localField(character, key);
    changes.push({ key, label, previous: before, incoming: after, local,
      conflict: local !== before && local !== after });
  }
  const oldFacts = new Map(previous.facts.map(f => [f.predicate, f]));
  for (const fact of next.facts) {
    const old = oldFacts.get(fact.predicate);
    if (old?.value === fact.value) continue;
    const localEntry = character.lore.find(entry => entry.id === coreFactId(fact.predicate));
    const local = localEntry?.content ?? "";
    const expected = old ? coreFactContent(previous.name, old.label, old.value) : "";
    changes.push({
      key: "fact:" + fact.predicate, label: fact.label,
      previous: old?.value ?? "", incoming: fact.value, local,
      conflict: !!localEntry && local !== expected &&
        local !== coreFactContent(next.name, fact.label, fact.value),
    });
  }
  return changes;
}

export function coreFactId(predicate: string): string {
  return "core-fact-" + encodeURIComponent(predicate);
}

function coreFactContent(name: string, label: string, value: string): string {
  return `${name}: ${label}: ${value}`;
}

/** Apply only explicitly approved keys, preserving the card's local identity and fields. */
export function applyCoreCharacterChanges(
  character: CharacterTemplate,
  incoming: CoreBibleEntity,
  approvedKeys: readonly string[],
  source: CoreCharacterSource,
): CharacterTemplate {
  if (!sameCoreCharacter(character, source)) throw new Error("Core identity mismatch.");
  const selected = new Set(approvedKeys);
  const next = snapshotCoreCharacter(incoming);
  const updated: CharacterTemplate = { ...character, lore: [...character.lore] };
  for (const [key] of fields) {
    if (!selected.has(key)) continue;
    if (key === "name") updated.name = next.name;
    if (key === "personality") updated.personality = next.personality;
    if (key === "appearance") updated.appearance = next.appearance;
    if (key === "pronoun") updated.pronoun = next.pronoun as CharacterTemplate["pronoun"];
    if (key === "approximateAge") updated.approximateAge = next.approximateAge as CharacterTemplate["approximateAge"];
  }
  for (const fact of next.facts) {
    if (!selected.has("fact:" + fact.predicate)) continue;
    const id = coreFactId(fact.predicate);
    const entry = { id, title: fact.label, content: coreFactContent(next.name, fact.label, fact.value), keywords: [] as string[] };
    const index = updated.lore.findIndex(item => item.id === id);
    if (index >= 0) updated.lore[index] = { ...updated.lore[index], ...entry };
    else updated.lore.push(entry);
  }
  updated.coreOrigin = { ...character.coreOrigin!, revision: source.revision };
  updated.updatedAt = new Date().toISOString();
  return updated;
}
