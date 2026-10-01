import { usesGameRules } from "./playMode";
import type { Session } from "./StateSchema";
import { matchRoomMention, namedRoomsInCanon } from "./WorldCanon";
import { foldPlace } from "./roomMatch";
import { roomGateAllowsEntry } from "./roomGate";

/** Tick on Reachable from: the landmark default Here (outside / the cabin). */
export const ROOM_FROM_LANDMARK = "__floor__";

/**
 * Player walking into a named room is their own body — engine truth,
 * not an AI favor. Detect the destination so SessionEngine can write
 * player.position before Pass 1 still thinks everyone is at the bar.
 */
const MOTION =
  /\b(?:walk(?:s|ed|ing)?|go(?:es|ing)?|went|enter(?:s|ed|ing)?|come[sd]?|coming|head(?:s|ed|ing)?|step(?:s|ped|ping)?|sneak(?:s|ed|ing)?|slip(?:s|ped|ping)?|follow(?:s|ed|ing)?|climb(?:s|ed|ing)?|crawl(?:s|ed|ing)?|lie[sd]?|lay|lying|curl(?:s|ed|ing)?|spoon(?:s|ed|ing)?|take me|gå(?:r)?|kommer|kom|klättr(?:ar|a)|lägger|lägg)\b/i;

const TOGETHER =
  /\b(?:follow(?:s|ed|ing)?|följ(?:er|de)?|with (?:you|her|him|me)|med (?:dig|henne|honom|mig)|let'?s go|lets go|we go|vi går|kom(?:mer)? med|take me|ta mig|gå vi)\b/i;

/** Asking others to come along is not the player walking into a room. */
export function isRecruitingFollowers(text: string): boolean {
  const stripped = text.replace(/\*+/g, " ");
  return /\b(?:who wants to (?:follow|come)|who(?:'s| is) (?:up for(?: it)?|in|coming)|follow me\b|come with me\b|följ med(?: mig)?|kom med mig|vem (?:följer|vill komma|hänger på))\b/i.test(
    stripped
  );
}

const SHARED_CLOSE =
  /\b(?:bed|säng|spoon|sked|cuddle|hold me|håll om|next to|beside|bredvid|behind me|bakom mig|in her arms|in his arms)\b/i;

const BAR_RETURN =
  /\b(?:the |a )?(?:bar|counter)\b|\bbaren\b|\bbakom baren\b|\bat the bar\b|\bbehind the bar\b/i;

const FLOOR_RETURN = /\b(?:the floor|stay here|stay on the floor)\b/i;

const BARISH = /\b(?:bar|counter|tap)\b|polish|glassware|wiping glasses|pouring/i;

const NIGHT =
  /\b(?:asleep|slept|sleeping|sovit|somnade|en natt|a night|the night|woke|wake[sd]?|waking|vaknad(?:e)?|morning|morgon|next day|nästa dag|dawn|gryning)\b/i;

export function isTogetherWalk(text: string, session?: Session): boolean {
  const stripped = text.replace(/\*+/g, " ");
  if (TOGETHER.test(stripped)) return true;
  if (!session) return false;
  for (const character of Object.values(session.characters)) {
    const name = character.name?.trim();
    if (!name) continue;
    const stem = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b(?:with|med) ${stem}\\b`, "i").test(stripped)) return true;
  }
  return false;
}

/**
 * Most recently named canon room in live chat. Used when the player
 * says "let's go" / "I follow you" without repeating the room.
 */
export function lastNamedRoomInRecentChat(session: Session, maxTurns = 12): string | undefined {
  const recent = session.conversation.slice(-maxTurns);
  for (let i = recent.length - 1; i >= 0; i--) {
    const entry = recent[i] as { role?: unknown; content?: unknown } | undefined;
    if (entry?.role !== "player") continue;
    const content = typeof entry.content === "string" ? entry.content : "";
    const room = reachableRoomMention(content, session);
    if (room) return room;
  }
  return undefined;
}

function currentFocalId(session: Session): string {
  const stage = sideRoomStage(session);
  if (!stage) return ROOM_FROM_LANDMARK;
  const rooms = session.scene?.rooms ?? [];
  const hit = rooms.find((room) => foldPlace(room.label) === foldPlace(stage));
  return hit?.id ?? ROOM_FROM_LANDMARK;
}

function currentFocalRoom(session: Session) {
  const id = currentFocalId(session);
  if (id === ROOM_FROM_LANDMARK) return undefined;
  return (session.scene?.rooms ?? []).find((room) => room.id === id);
}

/** Empty Reachable from = the landmark floor, not every other room. */
export function roomEntryFromIds(room: { fromRoomIds?: string[] } | undefined): string[] {
  const from = (room?.fromRoomIds ?? []).map((id) => id.trim()).filter(Boolean);
  return from.length > 0 ? from : [ROOM_FROM_LANDMARK];
}

export function canWalkToLandmark(session: Session): boolean {
  if (!sideRoomStage(session)) return false;
  if (!usesGameRules(session)) return true;
  const hereRoom = currentFocalRoom(session);
  if (!hereRoom) return true;
  return roomEntryFromIds(hereRoom).includes(ROOM_FROM_LANDMARK);
}

export function roomIsReachable(
  room: { id?: string; fromRoomIds?: string[] },
  session: Session
): boolean {
  const here = currentFocalId(session);
  if (room.id && here === room.id) return false;
  if (!usesGameRules(session)) return true;
  if (roomEntryFromIds(room).includes(here)) return true;
  const hereRoom = currentFocalRoom(session);
  if (hereRoom && room.id && roomEntryFromIds(hereRoom).includes(room.id)) return true;
  return false;
}

function reachableRoomMention(text: string, session: Session): string | undefined {
  const hit = matchRoomMention(text, session);
  if (!hit) return undefined;
  const room = (session.scene?.rooms ?? []).find((item) => item.label === hit);
  if (!room) return hit;
  if (!roomIsReachable(room, session)) return undefined;
  return roomGateAllowsEntry(session, room) ? hit : undefined;
}

export function destinationRoomFromPlayerText(text: string, session: Session): string | undefined {
  const stripped = text.replace(/\*+/g, " ").trim();
  if (!stripped || !MOTION.test(stripped)) return undefined;
  if (isRecruitingFollowers(stripped)) return undefined;
  return (
    reachableRoomMention(stripped, session) ??
    (isTogetherWalk(stripped, session) ? lastNamedRoomInRecentChat(session) : undefined)
  );
}

/** Named room, or back to the public bar when the player is in a side room. */
export function destinationPlaceFromPlayerText(text: string, session: Session): string | undefined {
  const named = destinationRoomFromPlayerText(text, session);
  if (named) return named;
  const stripped = text.replace(/\*+/g, " ").trim();
  if (!stripped) return undefined;
  if (!sideRoomStage(session)) return undefined;
  const returning =
    BAR_RETURN.test(stripped) ||
    FLOOR_RETURN.test(stripped) ||
    isBarishPlace(stripped) ||
    namesThisVenue(stripped, session);
  if (!returning) return undefined;
  if (!MOTION.test(stripped) && !FLOOR_RETURN.test(stripped)) return undefined;
  if (!canWalkToLandmark(session)) return undefined;
  return venueFloorToken(session);
}

export function isSharedCloseBeat(text: string): boolean {
  return SHARED_CLOSE.test(text.replace(/\*+/g, " "));
}

/** A named side room the player is already in — the stage for this beat. */
export function sideRoomStage(session: Session): string | undefined {
  const pos = session.player?.position.value?.trim();
  if (!pos) return undefined;
  const mentioned = matchRoomMention(pos, session);
  if (mentioned) return mentioned;
  const needle = pos.toLowerCase();
  return namedRoomsInCanon(session).find(
    (room) => needle === room.toLowerCase() || needle.includes(room.toLowerCase())
  );
}

export function isBarishPlace(value: string): boolean {
  return BARISH.test(value);
}

/** Live token for the venue floor this night — the bar, the grove, the deck. */
export function venueFloorToken(session: Session): string {
  const loc = session.scene?.location?.trim() ?? "";
  if (!loc) return WHAT_NOW_FLOOR;
  if (isBarishPlace(loc) || /\bbar\b/i.test(loc)) return WHAT_NOW_FLOOR;
  const venue = venueBuildingName(loc);
  return venue ? `at ${venue}` : WHAT_NOW_FLOOR;
}

export function isVenueFloor(value: string, session: Session): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (v === WHAT_NOW_FLOOR.toLowerCase() || isBarishPlace(value)) return true;
  const floor = venueFloorToken(session).toLowerCase();
  if (v === floor) return true;
  const venue = venueBuildingName(session.scene?.location).toLowerCase();
  if (venue && (v === venue || v === `at ${venue}`)) return true;
  return v === "here";
}

function namesThisVenue(text: string, session: Session): boolean {
  const venue = venueBuildingName(session.scene?.location);
  if (!venue) return false;
  const stem = venue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${stem}\\b`, "i").test(text);
}

/** Canon token for What now? → this night’s floor. Live value is `venueFloorToken`. */
export const WHAT_NOW_FLOOR = "at the bar";

/** What now? stays in this beat — a lie, a door, a stone. No new room. */
export const WHAT_NOW_STAY = "this beat";

export function isWhatNowStay(room: string | undefined): boolean {
  return room?.trim().toLowerCase() === WHAT_NOW_STAY.toLowerCase();
}

/** Resolve a What now? destination, or undefined if it is not in this night. */
export function resolveWhatNowRoom(session: Session, room: string): string | undefined {
  const wanted = room.trim();
  if (!wanted || isWhatNowStay(wanted)) return undefined;
  if (wanted === WHAT_NOW_FLOOR || isVenueFloor(wanted, session)) return venueFloorToken(session);
  const rooms = namedRoomsInCanon(session);
  const hit = rooms.find((label) => label.toLowerCase() === wanted.toLowerCase());
  return hit;
}

/** First clause of a scene location — the building, not the room. */
export function venueBuildingName(location: string | undefined): string {
  const trimmed = location?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.split(/[—–-]/)[0]?.trim() || trimmed;
}

/** Where this beat is — a named room if the player is in one. */
export function beatLocation(session: Session): string | undefined {
  const stage = sideRoomStage(session);
  if (stage) return stage;
  const pos = session.player?.position.value?.trim();
  if (pos) return pos;
  return session.scene?.location?.trim();
}

/**
 * Scene-break key: a named side room, or the venue. Moving from "at the
 * bar" to "behind the bar" is not a new scene; entering Emma's room is.
 */
export function sceneStageKey(session: Session): string {
  const room = sideRoomStage(session)?.trim();
  if (room) return room.toLowerCase();
  const venue = venueBuildingName(session.scene?.location);
  if (venue) return venue.toLowerCase();
  return "here";
}

export function sceneStageLabel(session: Session): string {
  return sideRoomStage(session)?.trim() || venueBuildingName(session.scene?.location) || "here";
}

export function roomBelongsToCharacter(
  room: string,
  characterId: string,
  characterName?: string
): boolean {
  const hay = room.toLowerCase();
  const tokens = [characterId, characterName]
    .map((token) => token?.trim().toLowerCase())
    .filter((token): token is string => Boolean(token));
  return tokens.some((token) => hay.includes(token));
}

export interface SpatialWrite {
  path: string;
  value: string;
}

/**
 * Player body + co-location in a private-room / in-bed beat.
 * SessionEngine commits these as player_manual_state before Pass 1.
 */
export function spatialWritesForTurn(
  session: Session,
  playerMessage: string,
  characterId: string,
  goTo?: string
): SpatialWrite[] {
  if (isWhatNowStay(goTo)) return [];
  const dest =
    (goTo?.trim() ? resolveWhatNowRoom(session, goTo) : undefined) ??
    destinationPlaceFromPlayerText(playerMessage, session) ??
    (isSharedCloseBeat(playerMessage) ? sideRoomStage(session) : undefined);
  if (!dest) return [];

  const writes: SpatialWrite[] = [];
  const player = session.player;
  if (player && player.position.lock === "unlocked" && player.position.value !== dest) {
    writes.push({ path: "player.position", value: dest });
  }
  if (
    player &&
    player.status.lock === "unlocked" &&
    /\basleep\b/i.test(player.status.value)
  ) {
    writes.push({ path: "player.status", value: "awake" });
  }

  const character = session.characters[characterId];
  const hold = new Set(
    (session.partyHoldIds ?? []).filter((id) => (session.partyIds ?? []).includes(id) && session.characters[id])
  );
  const party = (session.partyIds ?? []).filter((id) => session.characters[id] && !hold.has(id));
  const enteringTheirRoom = Boolean(
    character &&
      !hold.has(characterId) &&
      roomBelongsToCharacter(dest, characterId, character.name) &&
      !isVenueFloor(dest, session)
  );
  const sharedHere =
    isSharedCloseBeat(playerMessage) && Boolean(sideRoomStage(session)) && !hold.has(characterId);
  const bringFocus = Boolean(
    character && (party.includes(characterId) || enteringTheirRoom || sharedHere)
  );
  const moving = new Set<string>(party);
  if (bringFocus) moving.add(characterId);

  for (const id of moving) {
    const member = session.characters[id];
    if (!member) continue;
    if (member.position.lock === "unlocked" && member.position.value !== dest) {
      writes.push({ path: `characters.${id}.position`, value: dest });
    }
    const pose = member.pose?.value ?? "";
    if (member.pose && member.pose.lock === "unlocked" && pose && isBarishPlace(pose)) {
      writes.push({ path: `characters.${id}.pose`, value: "" });
    }
  }
  return writes;
}

/** Player body is engine truth. A reply naming a door or relic is not a walk. */
export function dropAiPlayerPosition<T extends { path: string }>(proposals: T[]): T[] {
  return proposals.filter((item) => item.path !== "player.position");
}

/** Pass 2 must not walk a non-party NPC to wherever the player just went. */
export function filterUninvitedFollowProposals<T extends { path: string; value: unknown }>(
  proposals: T[],
  session: Session,
  characterId: string
): T[] {
  if (
    (session.partyIds ?? []).includes(characterId) &&
    !(session.partyHoldIds ?? []).includes(characterId)
  ) {
    return proposals;
  }
  const character = session.characters[characterId];
  if (!character) return proposals;
  const proposedPlayer = proposals.find((item) => item.path === "player.position")?.value;
  const playerDest =
    typeof proposedPlayer === "string" && proposedPlayer.trim()
      ? proposedPlayer
      : session.player?.position.value;
  if (!playerDest?.trim()) return proposals;
  const dest = playerDest.trim().toLowerCase();
  const posPath = `characters.${characterId}.position`;
  return proposals.filter((item) => {
    if (item.path !== posPath || typeof item.value !== "string") return true;
    const next = item.value.trim();
    if (!next || next.toLowerCase() === character.position.value.trim().toLowerCase()) return true;
    if (roomBelongsToCharacter(next, characterId, character.name) && !isVenueFloor(next, session)) {
      return true;
    }
    return next.toLowerCase() !== dest;
  });
}

export function isVenueStageKey(session: Session, key: string): boolean {
  const k = key.trim().toLowerCase();
  if (!k || k === "here") return true;
  const venue = venueBuildingName(session.scene?.location).toLowerCase();
  return Boolean(venue) && k === venue;
}

/** Morning after, a time-skip, or walking back to the bar from a named room. */
export function sceneContinuesAfterNight(
  session: Session,
  playerMessage: string,
  previousStage: string,
  currentStage: string
): boolean {
  if (
    previousStage !== currentStage &&
    isVenueStageKey(session, currentStage) &&
    !isVenueStageKey(session, previousStage)
  ) {
    return true;
  }
  if (NIGHT.test(playerMessage)) return true;
  for (const entry of session.conversation.slice(-12)) {
    const content = typeof (entry as { content?: unknown })?.content === "string" ? (entry as { content: string }).content : "";
    if (NIGHT.test(content)) return true;
  }
  return false;
}

