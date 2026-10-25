import type {
  CharacterTemplate,
  PlaceTemplate,
  RealmTemplate,
  RulesetTemplate,
  VoiceTemplate,
} from "@library/LibrarySchema";
import { characterDraftFromTemplate } from "@library/fromForm";
import { createSessionFromSetup } from "@session/createSession";
import { attributeRange } from "@state/traitBands";
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
    voice?: VoiceTemplate;
    ruleset?: RulesetTemplate;
  } = {},
) {
  const place = options.place;
  const stats = Object.fromEntries((options.ruleset?.attributes ?? []).filter(def => def.kind === "number").map(def => {
    const { min, max } = attributeRange(def);
    const midpoint = min + (max - min) / 2;
    return [def.id, String(Number.isInteger(min) && Number.isInteger(max) ? Math.round(midpoint) : midpoint)];
  }));
  const draft = {
    ...characterDraftFromTemplate(character),
    lore: character.lore,
    ...(options.ruleset ? { stats } : {}),
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
      ...(options.voice ? { voiceTitle: options.voice.name, voiceInstruction: options.voice.instruction } : {}),
      ...(options.ruleset ? { ruleset: { name: options.ruleset.name, attributes: options.ruleset.attributes } } : {}),
      ...(options.ruleset ? { playerIdentity: { stats } } : {}),
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
