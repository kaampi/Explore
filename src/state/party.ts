import { formatPersonName, personNameTerms } from "@library/personName";
import { isBarishPlace, isVenueFloor } from "./playerDestination";
import { foldPlace } from "./roomMatch";
import { matchRoomMention } from "./WorldCanon";
import type { Session } from "./StateSchema";

export const PARTY_SLOTS = 3;
export const WAITLIST_SLOTS = 2;

export type PartySlot =
  | { kind: "empty" }
  | {
      kind: "pending" | "member";
      id: string;
      name: string;
      portrait?: string;
    };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function placeKey(session: Session, pos: string): string {
  const room = matchRoomMention(pos, session);
  if (room) return foldPlace(room);
  if (isVenueFloor(pos, session) || isBarishPlace(pos)) return "__floor__";
  return foldPlace(pos);
}

export function samePlace(session: Session, a: string, b: string): boolean {
  if (!a.trim() || !b.trim()) return false;
  return foldPlace(placeKey(session, a)) === foldPlace(placeKey(session, b));
}

export function sameHere(session: Session, position: string): boolean {
  return samePlace(session, session.player?.position.value ?? "", position);
}

/** Focus is not with the player — Pass 1 writes the player's here, not their face. */
export function isLeftBehind(session: Session, characterId: string): boolean {
  const character = session.characters[characterId];
  const here = session.player?.position.value?.trim() ?? "";
  if (!character || !here) return false;
  if (travelingPartyIds(session).includes(characterId)) return false;
  return !sameHere(session, character.position.value);
}

export function isPartyLeave(text: string): boolean {
  const stripped = text.replace(/\*+/g, " ");
  return /\b(?:go(?:ing)? alone|by myself|without (?:you|her|him|them)|leave (?:her|him|them)|leave the (?:party|group)|stay behind|wait here|stay here|ensam|utan (?:dig|henne|honom|dem)|vänta här|stanna här|lämna (?:gruppen|sällskapet))\b/i.test(
    stripped
  );
}

/**
 * They want to travel with the player — not "follow me" (they lead).
 */
export function wantsToJoinPlayerParty(text: string): boolean {
  const stripped = text.replace(/\*+/g, " ");
  if (/\b(?:follow me|come with me|this way|kom med mig|följ med(?: mig)?)\b/i.test(stripped)) {
    if (!/\b(?:with you|med dig|i(?:'ll| will) come|jag (?:följer|kommer) med)\b/i.test(stripped)) {
      return false;
    }
  }
  return /\b(?:i(?:'ll| will) come(?!\s+back)|i(?:'m| am) coming\b|i(?:'ll| will) (?:come|go) with you|i(?:'ll| will) follow(?: you)?|i(?:'m| am) coming with you|come with you|go with you|comes with you|come along|follow(?:s|ing)? you|i(?:'m| am) with you|i(?:'m| am) interested|count me in|count on (?:it|us|me)|i(?:'m| am) in\b(?!\s+(?:the|a|this|that|here|there)\b)|i(?:'ll| will) join(?: you)?|take me with you|tag along|scare me off|doesn'?t scare me|make our own way|break free|in this together|where you go.{0,24}we go|we(?:'re| are) with you|got your back|watch your (?:six|back)|jag (?:följer|kommer) med(?: dig)?|jag kommer(?!\s+tillbaka)|jag följer dig|jag är intresserad|jag hänger (?:på|med)|jag är med|vi följer(?: dig)?|vi hänger (?:på|med))\b/i.test(
    stripped
  );
}

/** Names in chat, not "Emma's room" as if Emma asked to join. */
function namedCharacterIdsForOffer(session: Session, text: string): string[] {
  let hay = text.replace(/\*+/g, " ");
  for (const character of Object.values(session.characters)) {
    const terms = character.name
      ? personNameTerms(character.name, character.familyName, character.middleName)
      : [];
    for (const term of terms) {
      const t = term.trim();
      if (t.length < 2) continue;
      const stem = escapeRegExp(t);
      hay = hay.replace(new RegExp(`${stem}'?s room|${stem}s rum`, "gi"), " ");
    }
  }
  return namedCharacterIds(session, hay);
}

/** Who asked to come along this beat: named people, or the speaker if no one is named. */
export function partyOfferIds(session: Session, focusId: string, reply: string): string[] {
  if (!wantsToJoinPlayerParty(reply)) return [];
  const named = namedCharacterIdsForOffer(session, reply).filter((id) => session.characters[id]);
  const ids = named.length > 0 ? named : focusId.trim() ? [focusId.trim()] : [];
  const taken = new Set(acceptedPartyIds(session));
  return ids.filter((id) => session.characters[id] && !taken.has(id));
}

export function namedCharacterIds(session: Session, text: string): string[] {
  const hay = text.replace(/\*+/g, " ");
  const hits: string[] = [];
  for (const [id, character] of Object.entries(session.characters)) {
    const terms = character.name
      ? personNameTerms(character.name, character.familyName, character.middleName)
      : [id];
    const named = terms.some((term) => {
      const t = term.trim();
      if (t.length < 2) return false;
      return new RegExp(`\\b${escapeRegExp(t)}\\b`, "i").test(hay);
    });
    if (named) hits.push(id);
  }
  return hits;
}

export function acceptedPartyIds(session: Session): string[] {
  return (session.partyIds ?? []).filter((id) => session.characters[id]);
}

/** In the party, but they do not walk until Come. */
export function holdingPartyIds(session: Session): string[] {
  const party = new Set(acceptedPartyIds(session));
  return (session.partyHoldIds ?? []).filter((id) => party.has(id) && session.characters[id]);
}

/** Accepted members who follow a walk or a landmark. */
export function travelingPartyIds(session: Session): string[] {
  const hold = new Set(holdingPartyIds(session));
  return acceptedPartyIds(session).filter((id) => !hold.has(id));
}

export function pendingPartyIds(session: Session): string[] {
  const accepted = new Set(acceptedPartyIds(session));
  return (session.partyPendingIds ?? [])
    .filter((id) => session.characters[id] && !accepted.has(id))
    .slice(0, WAITLIST_SLOTS);
}

export function onThisPlace(session: Session, position: string): boolean {
  const pos = position.trim();
  if (!pos) return false;
  if (sameHere(session, pos)) return true;
  const playerPos = session.player?.position.value?.trim() ?? "";
  const loc = session.scene?.location ?? "";
  const playerOnMap =
    Boolean(matchRoomMention(playerPos, session)) ||
    isVenueFloor(playerPos, session) ||
    (isBarishPlace(playerPos) && isBarishPlace(loc));
  if (!playerOnMap) return false;
  if (matchRoomMention(pos, session)) return true;
  return isBarishPlace(pos) && isBarishPlace(loc);
}

/** Player is still on tonight's landmark (floor or a named room). */
export function playerOnTonightMap(session: Session): boolean {
  const playerPos = session.player?.position.value?.trim() ?? "";
  if (!playerPos) return false;
  if (matchRoomMention(playerPos, session)) return true;
  if (isVenueFloor(playerPos, session)) return true;
  const loc = session.scene?.location ?? "";
  return isBarishPlace(playerPos) && isBarishPlace(loc);
}

export function canAcceptParty(session: Session, characterId: string): boolean {
  const id = characterId.trim();
  if (!pendingPartyIds(session).includes(id)) return false;
  if (acceptedPartyIds(session).length >= PARTY_SLOTS) return false;
  return playerOnTonightMap(session);
}

function enqueueWaitlist(pending: string[], id: string): string[] {
  if (pending.includes(id)) return pending;
  if (pending.length >= WAITLIST_SLOTS) return pending;
  return [...pending, id];
}

function displayName(session: Session, id: string): string {
  const character = session.characters[id];
  return character?.name?.trim()
    ? formatPersonName(character.name, character.familyName, character.middleName)
    : id;
}

function slotFor(session: Session, id: string, kind: "pending" | "member"): PartySlot {
  return {
    kind,
    id,
    name: displayName(session, id),
    ...(session.characters[id]?.portraitDataUrl
      ? { portrait: session.characters[id]?.portraitDataUrl }
      : {})
  };
}

/** Traveling companions — three slots beside you. */
export function partySlots(session: Session): PartySlot[] {
  const filled: PartySlot[] = acceptedPartyIds(session).map((id) => slotFor(session, id, "member"));
  while (filled.length < PARTY_SLOTS) filled.push({ kind: "empty" });
  return filled.slice(0, PARTY_SLOTS);
}

/** Grey waitlist — they asked, but they are not following. */
export function waitlistSlots(session: Session): PartySlot[] {
  const filled: PartySlot[] = pendingPartyIds(session).map((id) => slotFor(session, id, "pending"));
  while (filled.length < WAITLIST_SLOTS) filled.push({ kind: "empty" });
  return filled.slice(0, WAITLIST_SLOTS);
}

/** Player leave-behind: they stop following and wait here, recruitable later. */
export function nextPartyAfterPlayerText(
  session: Session,
  playerMessage: string,
  focusId: string
): { partyIds: string[]; partyPendingIds: string[] } {
  const partyIds = acceptedPartyIds(session);
  let partyPendingIds = pendingPartyIds(session);
  if (!isPartyLeave(playerMessage)) return { partyIds, partyPendingIds };
  const named = namedCharacterIds(session, playerMessage);
  const drop = new Set(named.length > 0 ? named : focusId ? [focusId] : []);
  const nextParty = partyIds.filter((id) => !drop.has(id));
  for (const id of partyIds) {
    if (drop.has(id)) partyPendingIds = enqueueWaitlist(partyPendingIds, id);
  }
  return { partyIds: nextParty, partyPendingIds };
}

export function nextPendingAfterOffer(
  session: Session,
  characterId: string,
  reply: string
): string[] | undefined {
  return nextPendingAfterIds(session, partyOfferIds(session, characterId, reply));
}

/** Map a Pass 2 name or id onto a live character. */
export function resolvePartyPerson(session: Session, token: string): string | undefined {
  const t = token.trim();
  if (!t) return undefined;
  if (session.characters[t]) return t;
  const fold = t.toLowerCase();
  for (const [id, character] of Object.entries(session.characters)) {
    if (id.toLowerCase() === fold) return id;
    const terms = character.name
      ? personNameTerms(character.name, character.familyName, character.middleName)
      : [id];
    if (terms.some((term) => term.trim().toLowerCase() === fold)) return id;
  }
  return undefined;
}

export function idsFromOfferValue(value: string): string[] {
  return value
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Engine gate: only live people, not already in the party, waitlist not full. */
export function nextPendingAfterIds(session: Session, ids: string[]): string[] | undefined {
  if (ids.length === 0) return undefined;
  const taken = new Set(acceptedPartyIds(session));
  let pending = pendingPartyIds(session);
  let changed = false;
  for (const raw of ids) {
    const id = resolvePartyPerson(session, raw);
    if (!id || taken.has(id) || pending.includes(id)) continue;
    if (pending.length >= WAITLIST_SLOTS) break;
    pending = [...pending, id];
    changed = true;
  }
  return changed ? pending : undefined;
}

export function nextPartyAfterLeave(
  session: Session,
  characterId: string
): { partyIds: string[]; partyPendingIds: string[] } | undefined {
  const id = characterId.trim();
  if (!acceptedPartyIds(session).includes(id)) return undefined;
  return {
    partyIds: acceptedPartyIds(session).filter((item) => item !== id),
    partyPendingIds: enqueueWaitlist(pendingPartyIds(session), id)
  };
}
