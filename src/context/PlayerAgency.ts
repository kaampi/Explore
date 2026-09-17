import type { CharacterPronoun } from "@state/StateSchema";
import { pronounForms } from "@state/pronouns";

/**
 * Player text may mix a real self-action ("I walk to Emma") with a
 * puppeteered NPC action ("she starts yodeling"). Local models treat
 * the whole asterisk line as stage direction. Split them so Pass 1
 * only honors the player's own body.
 */

const VERB = String.raw`(?:starts?|began|begins?|asks?|says?|said|does|did|is|was|goes|went|comes?|walks?|dances?|kisses?|smiles?|yodels?|sings?|holds?|takes?|gives?|looks?|turns?|leans?|nods?|replies?|responds?|\w+ing|\w+ed|\w+s)`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.sort((a, b) => b.length - a.length);
}

function subjectTerms(names: string[], pronoun?: CharacterPronoun): string[] {
  const terms = uniqueNames(names);
  const forms = pronounForms(pronoun);
  if (forms) terms.push(forms.subject);
  else terms.push("she", "he");
  return uniqueNames(terms);
}

function npcActionRegexes(names: string[], pronoun?: CharacterPronoun): RegExp[] {
  const subjects = subjectTerms(names, pronoun).map(escapeRegExp).join("|");
  if (!subjects) return [];
  return [
    new RegExp(`\\b(?:see|saw|watch(?:es|ed)?|notice[sd]?|spot(?:s|ted)?|hear(?:s|d)?)\\s+(?:${subjects}|her|him)\\s+${VERB}\\b`, "i"),
    new RegExp(`\\b(?:${subjects})\\s+(?!to\\b)(?!if\\b)${VERB}\\b`, "i")
  ];
}

function firstNpcActionIndex(text: string, names: string[], pronoun?: CharacterPronoun): number {
  let best = -1;
  for (const regex of npcActionRegexes(names, pronoun)) {
    const match = regex.exec(text);
    if (match && (best < 0 || match.index < best)) best = match.index;
  }
  return best;
}

export interface PlayerAgencySplit {
  playerFacts: string;
  rejectedClaims: string[];
}

export function splitPlayerAgency(
  raw: string,
  names: string[],
  pronoun?: CharacterPronoun
): PlayerAgencySplit {
  const text = raw.replace(/^\*+\s*|\s*\*+$/g, "").trim();
  if (!text) return { playerFacts: "", rejectedClaims: [] };

  const masked = text.replace(/\bif\s+(she|he|it|they)\b/gi, "if _");
  const index = firstNpcActionIndex(masked, names, pronoun);
  if (index < 0) return { playerFacts: text, rejectedClaims: [] };

  const playerFacts = text.slice(0, index).replace(/[,;]+\s*$/, "").trim();
  const rejected = text.slice(index).replace(/^[,;]+\s*/, "").trim();
  return {
    playerFacts,
    rejectedClaims: rejected ? [rejected] : []
  };
}

export function formatPass1UserContent(
  playerMessage: string,
  names: string[],
  pronoun?: CharacterPronoun,
  focusName?: string
): string {
  const who = focusName?.trim() || names[0] || "the character";
  const split = splitPlayerAgency(playerMessage, names, pronoun);

  if (split.rejectedClaims.length === 0) {
    return playerMessage;
  }

  const lines = [
    "[Player action — this happened]",
    split.playerFacts || "(The player did not take a new physical action.)",
    "",
    `[Not a fact — ${who} did not do this. Do not write it happening.]`,
    ...split.rejectedClaims.map((claim) => `- ${claim}`),
    "",
    `${who} decides what ${who} does. Write a different beat. Do not perform the rejected action.`
  ];
  return lines.join("\n");
}

const INSTRUCTION_LEAK =
  /\s*\([^)]*(?:present tense|third person|invent(?:ed)? places|does not control the character|character actions are not)[^)]*\)\s*$/i;

/** Drop trailing parentheticals that parrot Pass 1 writing rules. */
export function stripPass1InstructionLeak(text: string): string {
  let out = text.trimEnd();
  for (let i = 0; i < 4; i++) {
    const next = out.replace(INSTRUCTION_LEAK, "").trimEnd();
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Drop a trailing fragment that never reached a period or a closed quote. */
export function closeReplyIfCut(text: string, _cut = true): string {
  const body = text.trimEnd();
  if (!body) return body;
  if (/[.!?…]["']?\s*$/.test(body)) return body;
  const ends = /[.!?…]["']?/g;
  let last = -1;
  for (const match of body.matchAll(ends)) {
    last = (match.index ?? 0) + match[0].length;
  }
  if (last < 0) return body;
  return body.slice(0, last).trimEnd();
}
