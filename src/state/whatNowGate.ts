import { usesStoryline } from "./playMode";
import type { Session } from "./StateSchema";
import { keywordHitsText } from "@layers/keywords";
import {
  destinationPlaceFromPlayerText,
  isVenueFloor,
  isWhatNowStay,
  resolveWhatNowRoom,
  sideRoomStage,
  WHAT_NOW_STAY
} from "./playerDestination";

const OFF_RAILS =
  /\b(?:sleep|slept|sova|sovit|somna(?:de)?|hotel|alley|gränd|street|gatan)\b/i;

const MOTION =
  /\b(?:walk(?:s|ed|ing)?|go(?:es|ing)?|went|enter(?:s|ed|ing)?|come[sd]?|coming|head(?:s|ed|ing)?|step(?:s|ped|ping)?|sneak(?:s|ed|ing)?|slip(?:s|ped|ping)?|follow(?:s|ed|ing)?|climb(?:s|ed|ing)?|take me|gå(?:r)?|kommer|kom|klättr(?:ar|a))\b/i;

const TOGETHER =
  /\b(?:follow(?:s|ed|ing)?|följ(?:er|de)?|let'?s go|lets go|we go|vi går|kom(?:mer)? med|take me|ta mig|gå vi)\b/i;

/** She actually asks them to come — not a question about lodging, not a hotel pitch. */
const INVITE =
  /\b(?:follow me|come with me|come with us|come on(?: back)?|come upstairs|come up(?:stairs)?|this way|show you|show it to you|let me show|i(?:'ll| will) show|i(?:'ll| will) take you|följ med|kom med(?: mig)?|ta med dig|visa dig|jag visar)\b/i;

const DENIAL =
  /\b(?:don'?t|do not|doesn't|no)\b.{0,48}\b(?:guest room|rooms? here|a room)\b/i;

const HOTEL_PITCH = /\b(?:local hotels?|recommend\w*.{0,24}hotel|hotels? that might)\b/i;

export type WhatNowSetLive = {
  id: string;
  keywords: string[];
  choices: Array<{ id: string; label: string; room: string }>;
};

export type WhatNowIntercept =
  | { kind: "pass"; goTo?: string }
  | { kind: "open"; setId: string }
  | { kind: "blocked" };

export function copyWhatNowChoices(
  items: Array<{ id: string; label: string; room: string }> | undefined
): Array<{ id: string; label: string; room: string }> {
  return (items ?? [])
    .filter((item) => item.label.trim())
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      label: item.label.trim(),
      room: !item.room.trim() || isWhatNowStay(item.room) ? WHAT_NOW_STAY : item.room.trim()
    }));
}

export function copyWhatNowSets(
  sets: Array<{ id: string; keywords?: string[]; choices?: Array<{ id: string; label: string; room: string }> }> | undefined
): WhatNowSetLive[] {
  return (sets ?? [])
    .map((set) => ({
      id: set.id,
      keywords: (set.keywords ?? []).map((word) => word.trim()).filter(Boolean),
      choices: copyWhatNowChoices(set.choices)
    }))
    .filter((set) => set.choices.length > 0);
}

/** Authored groups, or one group from a leftover single list. */
export function sessionWhatNowSets(session: Session): WhatNowSetLive[] {
  if (!usesStoryline(session)) return [];
  const authored = copyWhatNowSets(session.whatNowSets);
  if (authored.length > 0) return authored;
  const choices = copyWhatNowChoices(session.whatNow);
  if (!choices.length) return [];
  return [
    {
      id: session.whatNowActiveSetId?.trim() || "replies",
      keywords: (session.whatNowKeywords ?? []).map((word) => word.trim()).filter(Boolean),
      choices
    }
  ];
}

export function whatNowPending(session: Session): boolean {
  return sessionWhatNowSets(session).length > 0;
}

export function whatNowOnFloor(session: Session): boolean {
  return whatNowPending(session) && !sideRoomStage(session);
}

/** Composer is chips only — the opening is over, pick a listed way. */
export function whatNowBlocksComposer(session: Session): boolean {
  return Boolean(session.whatNowOpen) && whatNowOnFloor(session);
}

function activeChoices(session: Session): Array<{ id: string; label: string; room: string }> {
  if (!usesStoryline(session)) return [];
  if (session.whatNowOpen) return copyWhatNowChoices(session.whatNow);
  return sessionWhatNowSets(session).flatMap((set) => set.choices);
}

export function listedWhatNowDest(session: Session, room: string | undefined): string | undefined {
  if (!room?.trim()) return undefined;
  const choices = activeChoices(session);
  if (isWhatNowStay(room)) {
    const hit = choices.some((item) => item.label.trim() && isWhatNowStay(item.room));
    return hit ? WHAT_NOW_STAY : undefined;
  }
  const dest = resolveWhatNowRoom(session, room);
  if (!dest) return undefined;
  const hit = choices.some((item) => resolveWhatNowRoom(session, item.room) === dest);
  return hit ? dest : undefined;
}

export function setIdListingDest(session: Session, room: string | undefined): string | undefined {
  if (!listedWhatNowDest(session, room)) return undefined;
  if (session.whatNowOpen && session.whatNowActiveSetId?.trim()) return session.whatNowActiveSetId.trim();
  const dest = listedWhatNowDest(session, room);
  for (const set of sessionWhatNowSets(session)) {
    if (dest && listedWhatNowDest({ ...session, whatNowOpen: true, whatNow: set.choices }, dest)) return set.id;
  }
  return sessionWhatNowSets(session)[0]?.id;
}

function lastCharacterText(session: Session): string {
  const turns = session.conversation as Array<{ role?: string; content?: unknown }>;
  for (let i = turns.length - 1; i >= 0; i--) {
    const entry = turns[i];
    if (entry?.role !== "character") continue;
    return typeof entry.content === "string" ? entry.content : "";
  }
  return "";
}

function lookForHits(text: string, keywords: string[] | undefined): boolean {
  if (!keywords?.length) return false;
  return keywordHitsText(text, keywords);
}

function fallbackSetId(sets: WhatNowSetLive[]): string | undefined {
  return sets.find((set) => set.keywords.length === 0)?.id ?? sets[0]?.id;
}

function setIdMatchingKeywords(sets: WhatNowSetLive[], text: string): string | undefined {
  return sets.find((set) => lookForHits(text, set.keywords))?.id;
}

export function characterInvitesWhatNow(text: string, keywords?: string[]): boolean {
  const stripped = text.replace(/\*+/g, " ");
  if (!stripped.trim()) return false;
  if (DENIAL.test(stripped) || HOTEL_PITCH.test(stripped)) return false;
  return INVITE.test(stripped) || lookForHits(stripped, keywords);
}

function offRailsLeave(session: Session, text: string, dest: string | undefined): boolean {
  if (dest) return false;
  const stripped = text.replace(/\*+/g, " ");
  if (isVenueFloor(stripped, session)) return false;
  if (/\?/.test(stripped)) return false;
  return MOTION.test(stripped) || TOGETHER.test(stripped) || OFF_RAILS.test(stripped);
}

function setIdFromCharacterLine(session: Session): string | undefined {
  const sets = sessionWhatNowSets(session);
  if (!sets.length) return undefined;
  const stripped = lastCharacterText(session).replace(/\*+/g, " ");
  if (!stripped.trim()) return undefined;
  if (DENIAL.test(stripped) || HOTEL_PITCH.test(stripped)) return undefined;
  return setIdMatchingKeywords(sets, stripped) ?? (INVITE.test(stripped) ? fallbackSetId(sets) : undefined);
}

/**
 * While this night still has What now? and the player is on the floor:
 * a listed button is a pick; an invented leave opens the fork; a canon
 * walk that is not a pick stays free chat.
 */
export function resolveWhatNowIntercept(
  session: Session,
  playerMessage: string,
  goTo?: string
): WhatNowIntercept {
  if (!usesStoryline(session) || !whatNowOnFloor(session)) return { kind: "pass", ...(goTo?.trim() ? { goTo: goTo.trim() } : {}) };

  const tapped = listedWhatNowDest(session, goTo);
  if (tapped) return { kind: "pass", goTo: tapped };

  if (session.whatNowOpen) return { kind: "blocked" };

  const dest = destinationPlaceFromPlayerText(playerMessage, session);
  const listed = listedWhatNowDest(session, dest);
  if (listed) return { kind: "pass", goTo: listed };

  const sets = sessionWhatNowSets(session);
  const keyed =
    !/\?/.test(playerMessage) ? setIdMatchingKeywords(sets, playerMessage) : undefined;
  if (keyed) return { kind: "open", setId: keyed };

  if (offRailsLeave(session, playerMessage, dest)) {
    const setId = fallbackSetId(sets);
    if (setId) return { kind: "open", setId };
  }

  return { kind: "pass" };
}

export function shouldArmWhatNowAfterTurn(session: Session): boolean {
  return Boolean(setIdToArmAfterTurn(session));
}

export function setIdToArmAfterTurn(session: Session): string | undefined {
  if (!whatNowOnFloor(session) || session.whatNowOpen) return undefined;
  return setIdFromCharacterLine(session);
}

