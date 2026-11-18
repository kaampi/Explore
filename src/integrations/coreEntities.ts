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
import { WorldMapSchema, type MapNode } from "@library/worldMap";
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

/** Closest two points may be on the map: points of imported places are never nearer than this. */
export const MAP_POINT_GAP = 6;

/** Free spots for new points: a grid from (10, 10) at first, then closer, never nearer than the gap to anything. */
function freeSpots(
  taken: readonly { x: number; y: number }[],
  wanted: number,
): { x: number; y: number }[] {
  const far = (x: number, y: number) =>
    taken.every((node) => Math.hypot(node.x - x, node.y - y) >= MAP_POINT_GAP);
  for (const [start, spacing] of [
    [10, 12],
    [5, 8],
    [5, MAP_POINT_GAP],
  ] as const) {
    const spots: { x: number; y: number }[] = [];
    for (let y = start; y <= 95; y += spacing)
      for (let x = start; x <= 95; x += spacing) if (far(x, y)) spots.push({ x, y });
    if (spots.length >= wanted) return spots.slice(0, wanted);
  }
  // More places than the map can hold apart: put the rest closer rather than leave one out.
  const spots: { x: number; y: number }[] = [];
  for (let y = 5; y <= 95; y += 3)
    for (let x = 5; x <= 95; x += 3) if (far(x, y)) spots.push({ x, y });
  while (spots.length < wanted)
    spots.push(...spots.slice(0, wanted - spots.length), { x: 50, y: 50 });
  return spots.slice(0, wanted);
}

/**
 * Put places on a world's map as points, so a world made from a manuscript can be explored and
 * its places chosen in adventures that use a map. A world with no map gets one. A place that
 * already has a point is left out, and nothing already on the map moves or changes. No ways are
 * drawn: the author moves the points and draws the roads in the map studio.
 */
export function placeOnWorldMap(
  realm: RealmTemplate,
  places: readonly PlaceTemplate[],
): RealmTemplate {
  const map = realm.worldMap ?? WorldMapSchema.parse({ mapType: "world", nodes: [], routes: [] });
  const onMap = new Set(map.nodes.flatMap((node) => (node.placeId ? [node.placeId] : [])));
  const missing = places.filter(
    (place, index) => !onMap.has(place.id) && places.findIndex((p) => p.id === place.id) === index,
  );
  if (missing.length === 0 && realm.worldMap) return realm;
  const spots = freeSpots(map.nodes, missing.length);
  const nodes: MapNode[] = missing.map((place, index) => ({
    id: crypto.randomUUID(),
    placeId: place.id,
    name: place.name,
    kind: "Point of Interest",
    x: spots[index]!.x,
    y: spots[index]!.y,
    description: "",
    population: "",
    characterIds: [],
  }));
  const next = WorldMapSchema.parse({ ...map, nodes: [...map.nodes, ...nodes] });
  return { ...realm, worldMap: next, updatedAt: new Date().toISOString() };
}

/**
 * A place renamed from the manuscript renames its point on the map too, but only if the point
 * still has the place's old name: a point the author has renamed keeps the author's name.
 */
export function renameOnWorldMap(
  realm: RealmTemplate,
  placeId: string,
  oldName: string,
  newName: string,
): RealmTemplate {
  const map = realm.worldMap;
  if (!map || !map.nodes.some((node) => node.placeId === placeId && node.name === oldName))
    return realm;
  const next = WorldMapSchema.parse({
    ...map,
    nodes: map.nodes.map((node) =>
      node.placeId === placeId && node.name === oldName ? { ...node, name: newName } : node,
    ),
  });
  return { ...realm, worldMap: next, updatedAt: new Date().toISOString() };
}
