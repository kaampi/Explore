import {
  newObjectTemplate,
  newPlaceTemplate,
  newRealmTemplate,
  type ObjectTemplate,
  type PlaceTemplate,
  type RealmTemplate,
} from "@library/LibrarySchema";
import { FactionSchema, type Faction } from "@library/factions";
import type { CoreEntitySnapshot, CoreOrigin } from "@library/coreOrigin";
import type { CoreBibleEntity, CoreBibleSection } from "./coreBibleSchema";
import type { CoreCharacterChange } from "./coreCharacterUpdates";

/** The Story Bible sections that become places, things and factions. */
export type CoreEntityKind = Extract<CoreBibleSection["kind"], "locations" | "objects" | "groups">;
export const CORE_ENTITY_KINDS: readonly CoreEntityKind[] = ["locations", "objects", "groups"];

export type CoreEntitySource = {
  workspaceId: string;
  projectId: string;
  entityRef: string;
  revision: number;
};

type Card = PlaceTemplate | ObjectTemplate | Faction;
type CopiedCard<K extends CoreEntityKind> = K extends "locations"
  ? PlaceTemplate
  : K extends "objects"
    ? ObjectTemplate
    : Faction;

/** The one field of each card that holds the manuscript's text. */
const TEXT_FIELD: Record<CoreEntityKind, "note" | "description"> = {
  locations: "note",
  objects: "note",
  groups: "description",
};

const KIND_NAME: Record<CoreEntityKind, string> = {
  locations: "place",
  objects: "thing",
  groups: "faction",
};

/** What a person sees of a copied card: the look, then the facts, one to a line. */
export function snapshotCoreEntity(entity: CoreBibleEntity): CoreEntitySnapshot {
  const lines = [
    entity.looks?.trim() ?? "",
    ...entity.facts
      .filter((fact) => fact.value.trim())
      .map((fact) => `${fact.label.trim()}: ${fact.value.trim()}`),
  ].filter(Boolean);
  return { name: entity.name.trim(), text: lines.join("\n") };
}

function textOf(card: Card, kind: CoreEntityKind): string {
  const field = TEXT_FIELD[kind];
  return String((card as unknown as Record<string, unknown>)[field] ?? "");
}

export function sameCoreEntity(card: Card, source: CoreEntitySource): boolean {
  const origin = card.coreOrigin;
  return (
    !!origin &&
    origin.workspaceId === source.workspaceId &&
    origin.projectId === source.projectId &&
    origin.entityRef === source.entityRef
  );
}

/**
 * An explicit import makes a new card owned by Explore, with its own id. The manuscript is never
 * written to. A place needs the world it belongs to.
 */
export function copyCoreEntity<K extends CoreEntityKind>(
  kind: K,
  entity: CoreBibleEntity,
  source: Omit<CoreEntitySource, "entityRef">,
  options: { realmId?: string } = {},
): CopiedCard<K> {
  const snapshot = snapshotCoreEntity(entity);
  if (!snapshot.name || !entity.entity_ref.trim())
    throw new Error(`This ${KIND_NAME[kind]} has no usable identity.`);
  const coreOrigin: CoreOrigin = { ...source, entityRef: entity.entity_ref };
  if (kind === "locations")
    return newPlaceTemplate({
      name: snapshot.name,
      note: snapshot.text,
      ...(options.realmId ? { realmId: options.realmId } : {}),
      source: "player",
      coreOrigin,
      coreSnapshot: snapshot,
    }) as CopiedCard<K>;
  if (kind === "objects")
    return newObjectTemplate({
      name: snapshot.name,
      note: snapshot.text,
      tags: [],
      source: "player",
      coreOrigin,
      coreSnapshot: snapshot,
    }) as CopiedCard<K>;
  return FactionSchema.parse({
    id: crypto.randomUUID(),
    name: snapshot.name,
    description: snapshot.text,
    coreOrigin,
    coreSnapshot: snapshot,
  }) as CopiedCard<K>;
}

/**
 * Three-way review, as for characters: the last accepted manuscript text against the latest
 * approved one, with a flag where the card was edited here. Nothing is written.
 */
export function reviewCoreEntity(
  card: Card,
  kind: CoreEntityKind,
  previous: CoreEntitySnapshot,
  incoming: CoreBibleEntity,
): CoreCharacterChange[] {
  const next = snapshotCoreEntity(incoming);
  const pairs: [string, string, string, string, string][] = [
    ["name", "Name", previous.name, next.name, card.name],
    ["text", "Description and facts", previous.text, next.text, textOf(card, kind)],
  ];
  return pairs
    .filter(([, , before, after]) => before !== after)
    .map(([key, label, before, after, local]) => ({
      key,
      label,
      previous: before,
      incoming: after,
      local,
      conflict: local !== before && local !== after,
    }));
}

/** Apply only the approved keys, keeping the card's id and everything else the author changed. */
export function applyCoreEntityChanges<C extends Card>(
  card: C,
  kind: CoreEntityKind,
  incoming: CoreBibleEntity,
  approvedKeys: readonly string[],
  source: CoreEntitySource,
): C {
  if (!sameCoreEntity(card, source) || incoming.entity_ref !== source.entityRef)
    throw new Error("kaampi Codex identity mismatch.");
  if (source.revision < card.coreOrigin!.revision)
    throw new Error("This manuscript version is older than the local copy.");
  const selected = new Set(approvedKeys);
  const next = snapshotCoreEntity(incoming);
  const updated = { ...card } as C & Record<string, unknown>;
  if (selected.has("name")) updated.name = next.name;
  if (selected.has("text")) updated[TEXT_FIELD[kind]] = next.text;
  updated.coreOrigin = { ...card.coreOrigin!, revision: source.revision };
  // A declined change keeps its old baseline, so it can be reviewed again later.
  const baseline = card.coreSnapshot ?? { name: next.name, text: next.text };
  updated.coreSnapshot = {
    name: selected.has("name") ? next.name : baseline.name,
    text: selected.has("text") ? next.text : baseline.text,
  };
  if ("updatedAt" in card) updated.updatedAt = new Date().toISOString();
  return updated as C;
}

/** The world a manuscript's places go into: the one made from it before, or a new one named after it. */
export function manuscriptWorld(
  realms: readonly RealmTemplate[],
  source: Omit<CoreEntitySource, "entityRef">,
  title: string,
): { realm: RealmTemplate; created: boolean } {
  const known = realms.find(
    (realm) =>
      realm.coreOrigin?.workspaceId === source.workspaceId &&
      realm.coreOrigin?.projectId === source.projectId,
  );
  if (known) return { realm: known, created: false };
  return {
    created: true,
    realm: newRealmTemplate({
      name: title.trim() || "Manuscript world",
      note: "",
      source: "player",
      coreOrigin: { ...source, entityRef: "manuscript" },
    }),
  };
}
