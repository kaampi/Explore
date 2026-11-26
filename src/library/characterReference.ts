import type { CampaignTemplate, CharacterTemplate } from "./LibrarySchema";
import type { CharacterReference, ReferenceCard } from "./referenceCards";

/**
 * Which reference card applies, and which of its versions, and which game portrait. See
 * docs/reference-card.sv.md ("Vilket kort som gäller", "Spelarrollen").
 *
 * The adventure's choice wins; a choice that points at a card that is gone falls back to the default
 * and says so; with no card at all, the character's ordinary portrait is used, as before. The
 * player role is found by its characterId only, never by its name.
 */

export type ReferenceLookup = {
  card?: ReferenceCard;
  /** The card's active version: what prompts are built from. */
  reference?: CharacterReference;
  /** The portrait for this look in a game. */
  portraitDataUrl?: string;
  /** The adventure chose a card that is no longer there, so the default is used. Shown to the author. */
  choiceGone?: { cardId: string };
};

export function referenceFor(
  character: CharacterTemplate,
  campaign?: CampaignTemplate,
): ReferenceLookup {
  const cards = character.references?.cards ?? [];
  if (cards.length === 0)
    return character.portraitDataUrl ? { portraitDataUrl: character.portraitDataUrl } : {};
  const chosen = campaign?.characterLooks?.find(
    (look) => look.characterId === character.id,
  )?.cardId;
  const picked = chosen ? cards.find((card) => card.cardId === chosen) : undefined;
  const defaultCard =
    cards.find((card) => card.cardId === character.references?.defaultCardId) ?? cards[0]!;
  const card = picked ?? defaultCard;
  const reference = card.versions.find((item) => item.version === card.activeVersion);
  // A card with no portrait of its own shows the ordinary portrait only while there is one look.
  const portraitDataUrl =
    card.portraitDataUrl ?? (cards.length < 2 ? character.portraitDataUrl : undefined);
  return {
    card,
    ...(reference ? { reference } : {}),
    ...(portraitDataUrl ? { portraitDataUrl } : {}),
    ...(chosen && !picked ? { choiceGone: { cardId: chosen } } : {}),
  };
}

export type PlayerReferenceLookup = ReferenceLookup & {
  character?: CharacterTemplate;
  /** The player role points at a library character that is gone. The role keeps its own copies. */
  characterGone?: boolean;
};

/**
 * The player role's reference, through `campaign.player.characterId`. Without an id, or with one that
 * is no longer in the library, there is no card and no library portrait: the role's own copies are used.
 */
export function playerReferenceFor(
  campaign: CampaignTemplate,
  characters: CharacterTemplate[],
): PlayerReferenceLookup {
  const id = campaign.player?.characterId;
  if (!id) return {};
  const character = characters.find((item) => item.id === id);
  if (!character) return { characterGone: true };
  return { character, ...referenceFor(character, campaign) };
}
