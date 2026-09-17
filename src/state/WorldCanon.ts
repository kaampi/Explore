import type { Session } from "./StateSchema";
import { isEffectivelyActive } from "@layers/LayerEngine";
import { matchSceneRoom } from "./roomMatch";
import { roomIsVisible } from "./roomGate";

/**
 * Places and lodging that a local model likes to invent when the player
 * asks to sleep. Dialogue is not canon — only the scene, story, and
 * in-context place notes are. Keyword-gated lore is not canon until it wakes.
 */
const PLACE_CLAIMS: RegExp[] = [
  /spare room/i,
  /guest room/i,
  /hotel/i,
  /apartment/i,
  /bedroom/i,
  /down the hall/i,
  /upstairs/i,
  /'s room/i,
  /\bmy room\b/i,
  /\byour room\b/i
];

/** Labels to list when lore names them and the place card has no slots yet. */
const LORE_ROOMS: { pattern: RegExp; label: string }[] = [
  { pattern: /guest room/i, label: "guest room" },
  { pattern: /spare room/i, label: "spare room" },
  { pattern: /\bcellar\b/i, label: "cellar" },
  { pattern: /\btoilets?\b/i, label: "toilets" }
];

const OWNED_ROOM = /([A-Za-z][A-Za-z]+(?: [A-Za-z]+)?)'s room/gi;

const POSSESSIVE =
  /\b(?:her|his|my|your) room\b|\b(?:her|his|my|your) bed\b|\bhennes (?:rum|säng)\b|\bhans (?:rum|säng)\b|\bmitt rum\b/i;

export function canonSettingText(session: Session): string {
  const bits: string[] = [];
  if (session.scene?.location) bits.push(session.scene.location);
  if (session.scene?.note) bits.push(session.scene.note);
  if (session.scene?.brief) bits.push(session.scene.brief);
  const env = session.scene?.environment;
  if (env?.lighting) bits.push(env.lighting);
  if (env?.noise) bits.push(env.noise);
  if (session.story?.title) bits.push(session.story.title);
  if (session.story?.premise) bits.push(session.story.premise);
  if (session.player?.position.value) bits.push(session.player.position.value);
  for (const character of Object.values(session.characters)) {
    bits.push(character.position.value);
  }
  for (const room of session.scene?.rooms ?? []) {
    if (!roomIsVisible(session, room)) continue;
    bits.push(room.label);
    if (room.description?.trim()) bits.push(room.description);
    if (room.brief?.trim()) bits.push(room.brief);
    for (const keyword of room.keywords ?? []) bits.push(keyword);
  }
  for (const layer of session.layers) {
    if (layer.type === "environment" && isEffectivelyActive(session, layer)) bits.push(layer.content);
  }
  for (const object of session.objects ?? []) {
    bits.push(object.name);
    if (object.note) bits.push(object.note);
  }
  return bits.join("\n");
}

/** True when `proposed` names lodging/rooms that are not in canon. */
export function isUngroundedPlace(proposed: string, session: Session): boolean {
  const canon = canonSettingText(session);
  return PLACE_CLAIMS.some((claim) => claim.test(proposed) && !claim.test(canon));
}

/**
 * Pets and strays a local model likes to drop into the room. Grounded
 * when an object card or an in-context place note already names them.
 */
const CREATURE_CLAIMS: RegExp[] = [
  /\b(?:stray\s+)?dogs?\b/i,
  /\b(?:stray\s+)?cats?\b/i,
  /\bpupp(?:y|ies)\b/i,
  /\bkittens?\b/i
];

/** True when `proposed` names a creature that is not in canon. */
export function isUngroundedObject(proposed: string, session: Session): boolean {
  const canon = canonSettingText(session);
  return CREATURE_CLAIMS.some((claim) => claim.test(proposed) && !claim.test(canon));
}

/** Place or creature invented out of nothing — same bar as Pass 2 positions. */
export function isUngroundedInvention(proposed: string, session: Session): boolean {
  return isUngroundedPlace(proposed, session) || isUngroundedObject(proposed, session);
}

/** Room names that are currently in canon — for the trusted state summary. */
export function namedRoomsInCanon(session: Session): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  const push = (label: string) => {
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    labels.push(label.trim());
  };
  for (const room of session.scene?.rooms ?? []) {
    if (!roomIsVisible(session, room)) continue;
    if (room.label.trim()) push(room.label);
  }
  const canon = canonSettingText(session);
  for (const match of canon.matchAll(OWNED_ROOM)) {
    const who = match[1]?.trim();
    if (who) push(`${who}'s room`);
  }
  for (const room of LORE_ROOMS) {
    if (room.pattern.test(canon)) push(room.label);
  }
  return labels;
}

function uniqueOwnedRoom(session: Session, available: Set<string>): string | undefined {
  const owned: string[] = [];
  for (const room of session.scene?.rooms ?? []) {
    const label = room.label.trim();
    if (!label || !available.has(label)) continue;
    const hay = label.toLowerCase();
    const hit = Object.entries(session.characters).some(([id, character]) => {
      const name = character.name?.trim().toLowerCase();
      return Boolean((id && hay.includes(id.toLowerCase())) || (name && hay.includes(name)));
    });
    if (hit) owned.push(label);
  }
  if (owned.length === 1) return owned[0];
  const fromCanon = [...available].filter((label) => /'s room$/i.test(label));
  if (fromCanon.length === 1) return fromCanon[0];
  return owned.length === 1 ? owned[0] : undefined;
}

/** Spoken aliases that resolve to a listed room when that room is in canon. */
const GENERIC_ALIASES: { pattern: RegExp; resolvesTo: string }[] = [
  { pattern: /gästrum/i, resolvesTo: "guest room" },
  { pattern: /toalett(?:en|er(?:na)?)?/i, resolvesTo: "toilets" },
  { pattern: /källare(?:n)?/i, resolvesTo: "cellar" }
];

/** First canon room named in `text`, or an alias that maps to one. */
export function matchRoomMention(text: string, session: Session): string | undefined {
  const slot = matchSceneRoom(text, session.scene?.rooms ?? []);
  if (slot) return slot.label;
  const rooms = namedRoomsInCanon(session);
  if (rooms.length === 0) return undefined;
  const available = new Set(rooms);
  for (const room of LORE_ROOMS) {
    if (available.has(room.label) && room.pattern.test(text)) return room.label;
  }
  for (const alias of GENERIC_ALIASES) {
    if (alias.pattern.test(text) && available.has(alias.resolvesTo)) return alias.resolvesTo;
  }
  const owned = uniqueOwnedRoom(session, available);
  if (owned && (POSSESSIVE.test(text) || /staff room/i.test(text))) {
    return owned;
  }
  if (owned) {
    const who = owned.replace(/'s room$/i, "").trim();
    if (who) {
      const stem = who.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`${stem}'?s room|${stem}s rum`, "i").test(text)) return owned;
    }
  }
  return undefined;
}

/**
 * Pass 2 must not yank someone out of a named room into the venue title
 * or back behind the bar. The scene name is the building, not the room.
 */
export function collapsesNamedRoomToVenue(
  proposed: string,
  current: string,
  session: Session
): boolean {
  const currentRoom = matchRoomMention(current, session);
  if (!currentRoom) return false;
  if (matchRoomMention(proposed, session)) return false;
  const venue = (session.scene?.location ?? "").trim().toLowerCase();
  const head = venue.split(/[—–-]/)[0]?.trim() ?? "";
  const p = proposed.trim().toLowerCase();
  if (!p) return false;
  if (head && (p === head || p === venue)) return true;
  return /\b(?:bar|counter)\b/i.test(proposed) && !/\b(?:bar|counter)\b/i.test(currentRoom);
}
