import {
  campaignPlayerIsFilled,
  whatNowSetsFromScene,
  type CampaignScene,
  type CampaignTemplate,
  CharacterTemplate,
  ObjectTemplate,
  PlaceTemplate,
  RealmTemplate,
  RulesetTemplate,
  VoiceTemplate
} from "@library/LibrarySchema";
import { characterDraftFromTemplate } from "@library/fromForm";
import {
  EXAMPLE_AURORA_BRIEF,
  EXAMPLE_AURORA_LORE,
  EXAMPLE_AURORA_NOTE,
  EXAMPLE_PLACE_ID,
  EXAMPLE_REALM_DUNBAAR_ID,
  exampleRealmDunbaar,
  withAuroraRoomIntros
} from "@library/exampleTemplates";
import { createSessionFromSetup, type SceneSetup } from "@session/createSession";
import { copyWhatNowSets } from "@state/whatNowGate";
import { copyAudioFields } from "@state/placeAudio";
import { copyPictureFields } from "@state/placePictures";
import type { Session } from "@state/StateSchema";

function realmLabel(place: PlaceTemplate, realms: RealmTemplate[] | undefined): string | undefined {
  const named = realms?.find((item) => item.id === place.realmId)?.name.trim();
  if (named) return named;
  if (place.realmId === EXAMPLE_REALM_DUNBAAR_ID) return exampleRealmDunbaar().name;
  return undefined;
}

/** Where the player stands at Start — landmark floor, or a listed focal. */
export function sceneStartHere(place: PlaceTemplate, startRoomId: string | undefined): string {
  const id = startRoomId?.trim();
  if (!id) return place.name;
  const rooms = place.id === EXAMPLE_PLACE_ID ? withAuroraRoomIntros(place.rooms) : place.rooms ?? [];
  const room = rooms.find((item) => item.id === id);
  return room?.label.trim() || place.name;
}

/** Pictures, sound, and copy from the parent realm — not Here. */
export function realmPlayFields(realm: RealmTemplate | undefined): Pick<SceneSetup, "realmNote" | "realmBrief" | "realmVisual"> {
  if (!realm) return {};
  const note = realm.note.trim();
  const brief = realm.brief?.trim();
  const visual = { ...copyPictureFields(realm), ...copyAudioFields(realm) };
  const hasVisual = Boolean(
    visual.thumbDataUrl || visual.imageDataUrl || visual.gallery?.length || visual.audioDataUrl || visual.audioGallery?.length
  );
  return {
    ...(note ? { realmNote: note } : {}),
    ...(brief ? { realmBrief: brief } : {}),
    ...(hasVisual ? { realmVisual: visual } : {})
  };
}

export function placeVisualFromTemplate(place: PlaceTemplate): NonNullable<SceneSetup["placeVisual"]> {
  const sceneRooms = place.id === EXAMPLE_PLACE_ID ? withAuroraRoomIntros(place.rooms) : place.rooms ?? [];
  return {
    ...copyPictureFields(place),
    ...copyAudioFields(place),
    ...(sceneRooms.length > 0
      ? {
          rooms: sceneRooms.map((room) => ({
            id: room.id,
            label: room.label,
            keywords: room.keywords,
            ...((room.fromRoomIds ?? []).length > 0 ? { fromRoomIds: room.fromRoomIds } : {}),
            ...(room.gate && room.gate !== "open" ? { gate: room.gate } : {}),
            ...(room.description?.trim() ? { description: room.description.trim() } : {}),
            ...(room.brief?.trim() ? { brief: room.brief.trim() } : {}),
            ...copyPictureFields(room),
            ...copyAudioFields(room)
          }))
        }
      : {})
  };
}

export function setupFromCampaignScene(args: {
  campaign: CampaignTemplate;
  scene: CampaignScene;
  places: PlaceTemplate[];
  realms?: RealmTemplate[];
  characters: CharacterTemplate[];
  objects: ObjectTemplate[];
  voices: VoiceTemplate[];
  rulesets: RulesetTemplate[];
  handoff?: string;
}): { ok: true; setup: SceneSetup } | { ok: false; reason: string } {
  const { campaign, scene, places, realms, characters, objects, voices, rulesets } = args;
  const place = places.find((item) => item.id === scene.placeId);
  if (!place) return { ok: false, reason: "This scene needs a place." };
  if (scene.people.length === 0) return { ok: false, reason: "This scene needs at least one person." };

  const voice = campaign.voiceId ? voices.find((item) => item.id === campaign.voiceId) : undefined;
  const ruleset = campaign.rulesetId ? rulesets.find((item) => item.id === campaign.rulesetId) : undefined;
  const startPrompt = campaign.startPrompt.trim();
  const playerIntro = campaign.playerIntro.trim();

  const setupCharacters = scene.people.flatMap((pick) => {
    const template = characters.find((item) => item.id === pick.characterId);
    if (!template) return [];
    const member = campaign.people.find((item) => item.characterId === pick.characterId);
    const draft = characterDraftFromTemplate(template);
    return [
      {
        ...draft,
        mood: pick.mood.trim() || template.mood,
        position: pick.position,
        clothing: pick.clothing,
        holding: pick.holding,
        stats: member?.stats ?? {},
        lore: member?.lore ?? [],
        trust: pick.trust,
        familiarity: pick.familiarity,
        tension: pick.tension
      }
    ];
  });
  if (setupCharacters.length === 0) {
    return { ok: false, reason: "Those people are missing from the library." };
  }

  const pickedObjects = scene.objectIds
    .map((id) => objects.find((item) => item.id === id))
    .filter((item): item is ObjectTemplate => Boolean(item));

  const onceBeats = scene.triggers
    .map((trigger) => ({
      content: trigger.content.trim(),
      keywords: trigger.keywords.map((word) => word.trim()).filter(Boolean),
      trigger: trigger.when,
      requiresFlags: trigger.requiresFlags.map((flag) => flag.trim()).filter(Boolean),
      requiresAbsentFlags: trigger.requiresAbsentFlags.map((flag) => flag.trim()).filter(Boolean),
      setsFlags: trigger.setsFlags.map((flag) => flag.trim()).filter(Boolean)
    }))
    .filter((item) => item.content && item.keywords.length > 0);

  const realmCard = realms?.find((item) => item.id === place.realmId);
  const realm = realmLabel(place, realms);
  const visual = placeVisualFromTemplate(place);
  const hasVisual =
    Boolean(visual.thumbDataUrl || visual.imageDataUrl || visual.gallery?.length || visual.audioDataUrl || visual.audioGallery?.length) ||
    Boolean(visual.rooms && visual.rooms.length > 0);

  return {
    ok: true,
    setup: {
      location: place.name,
      placeId: place.id,
      playerPosition: sceneStartHere(place, scene.startRoomId),
      ...(realm ? { realm } : {}),
      ...realmPlayFields(realmCard),
      lighting: place.lighting,
      noise: place.noise,
      music: place.music,
      placeNote: place.note.trim() || (place.id === EXAMPLE_PLACE_ID ? EXAMPLE_AURORA_NOTE : ""),
      placeBrief: place.brief?.trim() || (place.id === EXAMPLE_PLACE_ID ? EXAMPLE_AURORA_BRIEF : ""),
      ...(place.id === EXAMPLE_PLACE_ID ? { placeLore: EXAMPLE_AURORA_LORE } : {}),
      ...(hasVisual ? { placeVisual: visual } : {}),
      ...(startPrompt ? { storyTitle: campaign.name, storyPremise: startPrompt } : {}),
      ...(playerIntro ? { campaignIntro: playerIntro } : {}),
      campaignId: campaign.id,
      sceneId: scene.id,
      ...(campaign.storyFlags.length > 0 ? { storyFlags: campaign.storyFlags } : {}),
      ...(args.handoff?.trim() ? { handoff: args.handoff.trim() } : {}),
      ...(() => {
        const you = campaign.player;
        if (!campaignPlayerIsFilled(you) || !you) return {};
        const stats = Object.fromEntries(
          Object.entries(you.stats).filter(([, value]) => String(value).trim())
        );
        return {
          playerIdentity: {
            ...(you.name.trim() ? { name: you.name.trim() } : {}),
            ...(you.appearance.trim() ? { appearance: you.appearance.trim() } : {}),
            ...(you.personality.trim() ? { personality: you.personality.trim() } : {}),
            ...(you.pronoun ? { pronoun: you.pronoun } : {}),
            ...(you.portraitDataUrl?.trim() ? { portraitDataUrl: you.portraitDataUrl.trim() } : {}),
            ...(Object.keys(stats).length > 0 ? { stats } : {})
          }
        };
      })(),
      ...(voice
        ? {
            voiceTitle: voice.name,
            voiceInstruction: voice.instruction
          }
        : {}),
      ...(campaign.model?.trim() ? { model: campaign.model.trim() } : {}),
      ...(ruleset ? { ruleset: { name: ruleset.name, attributes: ruleset.attributes } } : {}),
      characters: setupCharacters,
      objects: pickedObjects.map((item) => ({
        id: item.id,
        name: item.name,
        note: item.note,
        tags: item.tags,
        ...(item.weight !== undefined ? { weight: item.weight } : {}),
        ...(item.difficulty !== undefined ? { difficulty: item.difficulty } : {}),
        ...(item.checkAttribute ? { checkAttribute: item.checkAttribute } : {})
      })),
      ...(onceBeats.length > 0 ? { onceBeats } : {}),
      ...(() => {
        const whatNowSets = copyWhatNowSets(whatNowSetsFromScene(scene));
        return whatNowSets.length > 0 ? { whatNowSets } : {};
      })()
    }
  };
}

export function sessionFromCampaignScene(
  args: {
    campaign: CampaignTemplate;
    scene: CampaignScene;
    places: PlaceTemplate[];
    realms?: RealmTemplate[];
    characters: CharacterTemplate[];
    objects: ObjectTemplate[];
    voices: VoiceTemplate[];
    rulesets: RulesetTemplate[];
    handoff?: string;
  },
  sessionId: string
): { ok: true; session: Session } | { ok: false; reason: string } {
  const built = setupFromCampaignScene(args);
  if (!built.ok) return built;
  return { ok: true, session: createSessionFromSetup(built.setup, sessionId) };
}

