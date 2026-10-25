import type {
  CharacterTemplate,
  PlaceTemplate,
  RealmTemplate,
} from "@library/LibrarySchema";
import { characterDraftFromTemplate } from "@library/fromForm";
import { createSessionFromSetup } from "@session/createSession";
import {
  placeVisualFromTemplate,
  realmPlayFields,
} from "@session/campaignStart";

/** Start from a person. No campaign, rule-set, imported world, or authored plot required. */
export function quickCharacterSession(
  character: CharacterTemplate,
  sessionId: string,
  options: {
    place?: PlaceTemplate;
    realm?: RealmTemplate;
    model?: string;
  } = {},
) {
  const place = options.place;
  const draft = {
    ...characterDraftFromTemplate(character),
    lore: character.lore,
  };
  return createSessionFromSetup(
    {
      location: place?.name ?? "A quiet meeting place",
      lighting: place?.lighting ?? "soft light",
      noise: place?.noise ?? "quiet",
      music: place?.music ?? false,
      placeNote:
        place?.note ??
        "A new conversation. There is no goal to reach — begin wherever you like.",
      characters: [draft],
      ...(place
        ? {
            placeId: place.id,
            placeBrief: place.brief ?? place.note,
            placeVisual: placeVisualFromTemplate(place),
          }
        : {}),
      ...(options.realm
        ? { realm: options.realm.name, ...realmPlayFields(options.realm) }
        : {}),
      ...(options.model ? { model: options.model } : {}),
    },
    sessionId,
  );
}
