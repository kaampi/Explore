import type { Session } from "../../state/StateSchema";
import { portraitSrc } from "../studio/portrait";

export type PersonCard = {
  id: string;
  name: string;
  /** A short line about the person: the first sentence of how they are written. */
  line: string;
  /** How the person seems right now, when the author wrote it. */
  mood: string;
  /** Their portrait when there is a usable one. Without it the card shows a monogram. */
  portrait: string | undefined;
  /** The initials for the monogram. */
  initials: string;
};

/** The longest line on a card: short next to a picture, longer when there is none. */
const WITH_PICTURE = 80;
const WITHOUT_PICTURE = 160;

/** The first sentence, cut at a word and ended with an ellipsis if it is too long. */
export function shortLine(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentence = /^[\s\S]*?[.!?…](?=\s|$)/.exec(clean)?.[0] ?? clean;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max - 1);
  const word = cut.lastIndexOf(" ");
  return `${(word > max / 2 ? cut.slice(0, word) : cut).trimEnd()}…`;
}

/** The first letters of the first two words of a name, in capitals. */
export function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "");
  return letters.join("").toLocaleUpperCase() || "?";
}

/** What the card of one person shows. A person made up on arrival is shown the same way. */
export function personCard(session: Session, actorId: string, name: string): PersonCard {
  const persona = session.adventure?.cast[actorId];
  const portrait = portraitSrc(persona?.portraitDataUrl);
  return {
    id: actorId,
    name,
    line: shortLine(persona?.personality ?? "", portrait ? WITH_PICTURE : WITHOUT_PICTURE),
    mood: persona?.mood.replace(/\s+/g, " ").trim() ?? "",
    portrait,
    initials: initialsOf(name),
  };
}
