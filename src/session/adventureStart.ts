import { BASIC_RULESET } from "../library/basicRuleset";
import type { EncounterGame } from "../game/EncounterSchema";
import { copyPictureFields } from "../state/placePictures";
import { encounterDescription } from "../game/sceneDescription";
import { applyAdventurePresentation } from "./adventurePresentation";
import type {
  CampaignTemplate,
  CampaignScene,
  CharacterTemplate,
  PlaceTemplate,
  RealmTemplate,
  RulesetTemplate,
  VoiceTemplate,
} from "../library/LibrarySchema";
import { adventureMapPlaces, bindSceneMapPlace, mapPlaceForScene } from "../library/adventureMap";
import { AdventureRunSchema, type AdventureNarration, type Persona } from "../game/AdventureSchema";
import { unifyAdventureEquipment } from "../game/AdventureEngine";
import { createSessionFromSetup } from "./createSession";
import { parseSession } from "../state/StateSchema";
const clip = (text: string | undefined, max: number) => (text ?? "").trim().slice(0, max);

function personaFrom(person: CharacterTemplate): Persona {
  return {
    name: clip(person.name, 120) || "Someone",
    ...(person.pronoun ? { pronoun: person.pronoun } : {}),
    personality: clip(person.personality, 600),
    speech: clip(person.speech, 600),
    mood: clip(person.mood, 600),
    appearance: clip(person.appearance, 600),
  };
}

/** Who the story AI may speak as, from the people placed in any scene of the adventure. */
function castFor(
  campaign: CampaignTemplate,
  characters: CharacterTemplate[],
): Record<string, Persona> {
  const cast: Record<string, Persona> = {};
  for (const scene of campaign.scenes) {
    for (const pick of scene.people) {
      const person = characters.find((c) => c.id === pick.characterId);
      if (person) cast[`npc:${person.id}`] = personaFrom(person);
    }
  }
  return cast;
}

function narrationFor(campaign: CampaignTemplate, voices: VoiceTemplate[]): AdventureNarration {
  const voice = voices.find((v) => v.id === campaign.voiceId)?.instruction;
  const background = clip(campaign.startPrompt, 4000);
  return {
    ...(voice ? { voice: clip(voice, 2000) } : {}),
    ...(background ? { background } : {}),
    freeReplies: true,
  };
}

/**
 * The rule-set the game is played with, copied into the game so later changes in the library
 * only reach new games. A scene with no scales plays as it always has.
 */
function sessionRuleset(
  campaign: CampaignTemplate,
  game: EncounterGame,
  rulesets: RulesetTemplate[],
) {
  const chosen = rulesets.find((set) => set.id === campaign.rulesetId);
  if (chosen && chosen.attributes.some((attribute) => attribute.kind === "number"))
    return { name: chosen.name, attributes: chosen.attributes };
  if (game.definition.rules.attributes.length > 0)
    return { name: BASIC_RULESET.name, attributes: BASIC_RULESET.attributes };
  return { name: "Adventure · d100", attributes: [] };
}

export function startPlayableCampaign(
  campaign: CampaignTemplate,
  scene: CampaignScene,
  places: PlaceTemplate[],
  id: string,
  worlds: RealmTemplate[] = [],
  sources: {
    characters?: CharacterTemplate[];
    voices?: VoiceTemplate[];
    rulesets?: RulesetTemplate[];
  } = {},
) {
  const world = campaign.mapWorldId ? worlds.find((w) => w.id === campaign.mapWorldId) : undefined;
  if (campaign.mapWorldId && !world?.worldMap)
    throw Error(
      "The adventure’s world map is unavailable. Choose a saved map in Storyboard Editor.",
    );
  const mapped = campaign.mapWorldId ? adventureMapPlaces(world, places) : undefined;
  const scenes = campaign.scenes.map((s) => {
    const entry = mapped ? mapPlaceForScene(s, mapped) : undefined;
    if (mapped && !entry)
      throw Error(
        `Choose an existing map place for “${s.name || "Untitled scene"}”. The previous place may have been removed.`,
      );
    const place = entry?.place ?? places.find((p) => p.id === s.placeId),
      bound = entry ? bindSceneMapPlace(s, entry, s.usePlaceIntro === true) : s;
    if (!bound.encounter || !place)
      throw Error(
        `Choose a place and make “${s.name || "Untitled scene"}” playable before testing the adventure.`,
      );
    if (mapped && !bound.encounter.definition.description.trim())
      throw Error(
        `Add an arrival introduction for “${s.name || "Untitled scene"}” in the scene or its map place.`,
      );
    return {
      id: s.id,
      name: s.name,
      placeId: place.id,
      location: place.name,
      ...(entry ? { mapNodeId: entry.node.id } : {}),
      game: structuredClone(bound.encounter),
    };
  });
  const run = unifyAdventureEquipment(
      AdventureRunSchema.parse({
        version: 1,
        campaignId: campaign.id,
        title: campaign.name,
        currentSceneId: scene.id,
        scenes,
        links: campaign.sceneLinks,
        goal: campaign.goal,
        cast: castFor(campaign, sources.characters ?? []),
        narration: narrationFor(campaign, sources.voices ?? []),
        exampleId: campaign.exampleId,
        exampleVersion: campaign.exampleVersion,
        ...(world?.worldMap
          ? {
              geography: {
                worldId: world.id,
                name: world.name,
                updatedAt: world.updatedAt,
                map: {
                  ...structuredClone(world.worldMap),
                  nodes: world.worldMap.nodes.map((node) => {
                    const image = mapped?.find((e) => e.node.id === node.id)?.place.imageDataUrl;
                    return { ...structuredClone(node), ...(image ? { imageDataUrl: image } : {}) };
                  }),
                },
              },
            }
          : {}),
      }),
    ),
    current = run.scenes.find((s) => s.id === scene.id);
  if (!current) throw Error("The starting scene is missing.");
  const game = structuredClone(current.game);
  game.state.flags = [...new Set([...game.state.flags, ...campaign.storyFlags])];
  const session = createSessionFromSetup(
    {
      location: current.location,
      placeId: current.placeId,
      placeNote: encounterDescription(game.definition, game.state),
      lighting: "",
      noise: "",
      music: false,
      characters: [],
      campaignId: campaign.id,
      sceneId: scene.id,
      ruleset: sessionRuleset(campaign, game, sources.rulesets ?? []),
      ...(campaign.model ? { model: campaign.model } : {}),
      playerIdentity: {
        name: campaign.player?.name || "Traveller",
        ...(campaign.player?.portraitDataUrl
          ? { portraitDataUrl: campaign.player.portraitDataUrl }
          : {}),
        stats: Object.fromEntries(
          Object.entries(game.state.actors[game.definition.playerId]!.stats).map(([k, v]) => [
            k,
            String(v),
          ]),
        ),
      },
    },
    id,
  );
  session.adventure = run;
  session.encounter = game;
  session.storyFlags = [...game.state.flags];
  session.conversation = [
    {
      turn: 0,
      role: "character",
      toldBy: "narrator",
      content: encounterDescription(game.definition, game.state),
      adventureSceneId: scene.id,
    },
  ];
  if (world) {
    session.scene!.realm = world.name;
    session.scene!.realmVisual = copyPictureFields(world);
    session.spatialPlaces = (mapped ?? []).map((entry) => ({
      id: entry.place.id,
      name: entry.place.name,
      kind: entry.node.kind,
    }));
    if (session.player) session.player.locationRef = { placeId: current.placeId, side: "at" };
  }
  applyAdventurePresentation(session);
  return parseSession(session);
}
