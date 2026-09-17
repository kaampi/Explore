import type { CharacterState, Session } from "./StateSchema";
import { matchRoomMention } from "./WorldCanon";
import { isBarishPlace } from "./playerDestination";

const UNDRESSED =
  /\b(?:nude|naked|naken|undressed|bare|topless|bottomless|in a towel|a towel|just underwear|underwear only)\b/i;

const KEEP_UNDRESSED =
  /\b(?:stay(?:s|ed)? (?:nude|naked|naken)|still (?:nude|naked|naken)|don'?t(?: you)? dress|do not dress|keep(?:s|ing)? (?:her |him )?(?:nude|naked)|naked at the bar|naken i baren)\b/i;

export function isUndressedClothing(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  return lower === "nothing" || UNDRESSED.test(trimmed);
}

export function playerKeepsUndressed(text: string): boolean {
  return KEEP_UNDRESSED.test(text.replace(/\*+/g, " "));
}

export function publicWorkClothing(character: CharacterState): string {
  if (isBarishPlace(character.position.value)) {
    return "a bartender's apron over indoor clothes";
  }
  return "indoor clothes";
}

/** Public bar is dressed. Nude stays in a private room unless the player said otherwise. */
export function dressForPublicBarWrites(
  session: Session,
  playerMessage: string,
  characterId: string
): { path: string; value: string }[] {
  if (playerKeepsUndressed(playerMessage)) return [];
  const character = session.characters[characterId];
  if (!character) return [];
  const clothing = character.clothing;
  if (!clothing || clothing.lock !== "unlocked") return [];
  if (!isUndressedClothing(clothing.value)) return [];
  if (matchRoomMention(character.position.value, session)) return [];
  if (!isBarishPlace(character.position.value)) return [];
  const next = publicWorkClothing(character);
  if (clothing.value.trim() === next) return [];
  return [{ path: `characters.${characterId}.clothing`, value: next }];
}
