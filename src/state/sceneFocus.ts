import { personNameTerms } from "@library/personName";
import { narrationCallName } from "./nameHeard";
import { sameHere, samePlace } from "./party";
import type { Session } from "./StateSchema";

const STOP = new Set(
  [
    "a",
    "an",
    "the",
    "i",
    "me",
    "my",
    "you",
    "he",
    "she",
    "it",
    "him",
    "her",
    "his",
    "they",
    "them",
    "man",
    "men",
    "guy",
    "girl",
    "en",
    "ett",
    "jag",
    "du",
    "han",
    "hon",
    "den",
    "det"
  ].map((word) => word.toLowerCase())
);

const MALE_POINTER =
  /\b(?:(?:a|the|this|that|some)\s+(?:man|guy|gentleman|boy|dude)|(?:en|den)\s+(?:man|kille|kille[n]|mannen)|honom|him|killen|mannen)\b|\b(?:next to|beside|bredvid)\s+(?:a |the |en )?(?:man|guy|kille)\b/i;

const FEMALE_POINTER =
  /\b(?:(?:a|the|this|that|some)\s+(?:woman|girl|lady)|(?:en|den)\s+(?:kvinna|tjej|tjejen)|henne|her|kvinnan|tjejen)\b|\b(?:next to|beside|bredvid)\s+(?:a |the |en )?(?:woman|girl|kvinna|tjej)\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliases(id: string, session: Session): string[] {
  const character = session.characters[id];
  const raw = character?.name
    ? personNameTerms(character.name, character.familyName, character.middleName)
    : [id];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of [...raw, id]) {
    const trimmed = term.trim();
    if (trimmed.length < 2) continue;
    const key = trimmed.toLowerCase();
    if (STOP.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.sort((a, b) => b.length - a.length);
}

function lastMatchIndex(haystack: string, term: string): number {
  const regex = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
  let last = -1;
  let hit: RegExpExecArray | null;
  while ((hit = regex.exec(haystack))) {
    last = hit.index;
  }
  return last;
}

function namedFocus(session: Session, text: string): string | undefined {
  let best: { id: string; index: number; length: number } | undefined;
  for (const id of Object.keys(session.characters)) {
    for (const term of aliases(id, session)) {
      const index = lastMatchIndex(text, term);
      if (index < 0) continue;
      if (
        !best ||
        index > best.index ||
        (index === best.index && term.length > best.length)
      ) {
        best = { id, index, length: term.length };
      }
    }
  }
  return best?.id;
}

function genderedFocus(session: Session, text: string): string | undefined {
  const want = MALE_POINTER.test(text) ? "he" : FEMALE_POINTER.test(text) ? "she" : undefined;
  if (!want) return undefined;
  const hits = Object.entries(session.characters)
    .filter(([, character]) => character.pronoun === want)
    .map(([id]) => id);
  return hits.length === 1 ? hits[0] : undefined;
}

export function lastCharacterSpeaker(session: Session): string | undefined {
  for (let i = session.conversation.length - 1; i >= 0; i--) {
    const turn = session.conversation[i];
    if (turn && typeof turn === "object" && "role" in turn && turn.role === "character" && "speaker" in turn && typeof turn.speaker === "string" && session.characters[turn.speaker]) {
      return turn.speaker;
    }
  }
  return undefined;
}

export function charactersHere(session: Session): string[] {
  return Object.keys(session.characters).filter((id) => {
    const position = session.characters[id]?.position.value;
    return Boolean(position && sameHere(session, position));
  });
}

export function othersInScene(
  session: Session,
  focusId: string
): { name: string; position: string }[] {
  const focus = session.characters[focusId];
  const leftover =
    Boolean(focus) &&
    Boolean(session.player?.position.value?.trim()) &&
    !(session.partyIds ?? []).includes(focusId) &&
    !sameHere(session, focus?.position.value ?? "");
  const anchor = leftover ? session.player?.position.value : focus?.position.value;
  return Object.entries(session.characters)
    .filter(([id]) => id !== focusId)
    .filter(([, character]) =>
      anchor ? samePlace(session, character.position.value, anchor) : false
    )
    .map(([id, character]) => ({
      name: narrationCallName(session, id),
      position: character.position.value
    }));
}

/**
 * Who this beat is about. Named address wins; then someone here with the
 * player (last speaker, then a unique he/she pointer); then anyone still here;
 * then the last speaker even if they stayed behind.
 */
export function focusCharacterId(session: Session, playerText: string): string | undefined {
  const ids = Object.keys(session.characters);
  if (ids.length === 0) return undefined;
  if (ids.length === 1) return ids[0];
  const stripped = playerText.replace(/\*+/g, " ");
  const named = namedFocus(session, stripped);
  if (named) return named;
  const here = charactersHere(session);
  const last = lastCharacterSpeaker(session);
  if (last && here.includes(last)) return last;
  const gendered = genderedFocus(session, stripped);
  if (gendered && here.includes(gendered)) return gendered;
  if (here.length > 0) return here[0];
  return last ?? ids[0];
}

