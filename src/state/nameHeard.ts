import { callName, formatPersonName } from "@library/personName";
import { pronounForms } from "./pronouns";
import { escapeRegExp, foldPlace, hayContainsRoomKey } from "./roomMatch";
import { ConversationTurnSchema, type CharacterState, type Session } from "./StateSchema";

function quotedSpeech(content: string): string {
  const chunks: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|“([^”]*)”|«([^»]*)»/g;
  let hit: RegExpExecArray | null;
  while ((hit = pattern.exec(content))) {
    chunks.push(hit[1] ?? hit[2] ?? hit[3] ?? hit[4] ?? "");
  }
  return chunks.join("\n");
}

/** True once the player used the given name, or it was spoken in quoted dialogue. */
export function nameHeardInConversation(session: Session, givenName: string): boolean {
  const needle = foldPlace(givenName);
  if (needle.length < 2) return true;
  for (const entry of session.conversation) {
    const parsed = ConversationTurnSchema.safeParse(entry);
    if (!parsed.success) continue;
    const turn = parsed.data;
    const hay = turn.role === "player" ? turn.content : quotedSpeech(turn.content);
    if (hayContainsRoomKey(foldPlace(hay), needle)) return true;
  }
  return false;
}

/** Subject pronoun until the given name is spoken. No job, no nickname. */
export function publicCallName(character: CharacterState): string {
  return pronounForms(character.pronoun)?.subject ?? "they";
}

export function narrationCallName(session: Session, characterId: string): string {
  const character = session.characters[characterId];
  if (!character) return characterId;
  const given = character.name?.trim()
    ? callName(character.name, character.familyName, character.middleName)
    : "";
  if (!given) return characterId;
  if (nameHeardInConversation(session, given)) return given;
  return publicCallName(character);
}

/**
 * Pass 1 name fields. Until the given name is heard, narration uses
 * pronouns and `unheardGiven` tells the writer the true name.
 */
export function pass1NameOptions(
  session: Session,
  characterId: string
): { characterName?: string; fullName?: string; unheardGiven?: string } {
  const character = session.characters[characterId];
  if (!character?.name?.trim()) return {};
  const given = callName(character.name, character.familyName, character.middleName);
  if (!given) return {};
  if (nameHeardInConversation(session, given)) {
    const full = formatPersonName(character.name, character.familyName, character.middleName);
    return {
      characterName: given,
      ...(full !== given ? { fullName: full } : {})
    };
  }
  return {
    characterName: publicCallName(character),
    unheardGiven: given
  };
}

/** Replace unheard given names in writer-facing place text (Emma's room → her room). */
export function maskUnheardGivenNames(session: Session, text: string): string {
  let out = text;
  for (const character of Object.values(session.characters)) {
    const given = character.name?.trim()
      ? callName(character.name, character.familyName, character.middleName)
      : "";
    if (!given || given.length < 2) continue;
    if (nameHeardInConversation(session, given)) continue;
    const possessive = pronounForms(character.pronoun)?.possessive ?? "their";
    const publicName = publicCallName(character);
    const pattern = new RegExp(`${escapeRegExp(given)}(?:['’]s)?`, "gi");
    out = out.replace(pattern, (match) => (/['’]s$/i.test(match) ? possessive : publicName));
  }
  return out;
}
