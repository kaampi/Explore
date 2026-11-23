import { validateEncounter } from "../game/EncounterEngine";
import { InteractionSchema } from "../game/EncounterSchema";
import { adventureMapPlaces } from "./adventureMap";
import { GuideMapChoiceError, type AdventureGuideDraft } from "./adventureGuidePlan";
import {
  emptyCampaignPlayer,
  emptyCampaignScene,
  newCampaignTemplate,
  newCharacterTemplate,
  newObjectTemplate,
  newPlaceTemplate,
  newRealmTemplate,
  type PlaceTemplate,
  type RealmTemplate,
  type CharacterTemplate,
  type ObjectTemplate,
} from "./LibrarySchema";
import { FactionSchema, type Faction } from "./factions";
import { makePlayableScene } from "./playableCampaign";
import { WorldMapSchema } from "./worldMap";

export type GuideLibrary = {
  realm?: RealmTemplate | undefined;
  places: PlaceTemplate[];
  characters?: CharacterTemplate[];
  objects?: ObjectTemplate[];
  factions?: Faction[];
};

function chosenRecord<T extends { id: string }>(
  records: T[] | undefined,
  id: string,
  label: string,
) {
  const record = records?.find((entry) => entry.id === id);
  if (!record) throw new Error(`Välj ${label} på nytt. Posten finns inte längre.`);
  return record;
}

function resolvePlaces(draft: AdventureGuideDraft, library: GuideLibrary) {
  const { id, map, plan } = draft;
  if (map.kind === "existing") {
    const { realm, places } = library;
    if (realm?.id !== map.realmId || !realm.worldMap)
      throw new GuideMapChoiceError("world", map.realmId, "Välj kartan på nytt.");
    const entries = adventureMapPlaces(realm, places);
    const used = new Set<string>();
    const resolved = plan.places.map((site) => {
      const choice = map.sites[site.id];
      const entry =
        choice &&
        entries.find(
          ({ node, place }) =>
            node.id === choice.nodeId && place.id === choice.placeId && !node.isArea,
        );
      const missingCard =
        choice?.placeCardId &&
        !places.some(
          (place) =>
            place.id === choice.placeCardId &&
            place.id === choice.placeId &&
            place.realmId === realm.id,
        );
      if (!entry || missingCard || used.has(entry.node.id))
        throw new GuideMapChoiceError(
          site.id,
          choice?.nodeId,
          `Välj kartplats för ${site.name} på nytt.`,
        );
      used.add(entry.node.id);
      return { site, nodeId: entry.node.id, place: entry.place };
    });
    return { realmId: realm.id, mapWorldId: realm.id, resolved, newPlaces: [] };
  }

  const realmId = map.kind === "places" ? map.realmId : `${id}:world`;
  if (map.kind === "places") {
    if (library.realm?.id !== realmId)
      throw new GuideMapChoiceError("world", realmId, "Välj världen på nytt.");
    const newPlaces: PlaceTemplate[] = [];
    const resolved = plan.places.map((site) => {
      const selected = map.sites[site.id];
      const place = selected
        ? library.places.find((card) => card.id === selected && card.realmId === realmId)
        : newPlaceTemplate({ id: `${id}:place:${site.id}`, realmId, name: site.name });
      if (!place)
        throw new GuideMapChoiceError(site.id, selected, `Välj plats för ${site.name} på nytt.`);
      if (!selected) newPlaces.push(place);
      return { site, place, nodeId: undefined };
    });
    return { realmId, resolved, newPlaces };
  }
  const resolved = plan.places.map((site) => ({
    site,
    nodeId: `${id}:node:${site.id}`,
    place: newPlaceTemplate({ id: `${id}:place:${site.id}`, realmId, name: site.name }),
  }));
  const nodeIds = new Map(resolved.map(({ site, nodeId }) => [site.id, nodeId]));
  const sceneNodes = new Map(
    plan.scenes.flatMap((scene) =>
      scene.kind === "playable" ? [[scene.id, nodeIds.get(scene.placeId)]] : [],
    ),
  );
  const realm = newRealmTemplate({
    id: realmId,
    name: plan.world.name,
    note: plan.world.note,
    source: "player",
    worldMap: WorldMapSchema.parse({
      nodes: resolved.map(({ site, nodeId, place }) => ({
        id: nodeId,
        placeId: place.id,
        kind: "Landmark",
        name: site.name,
        ...site.position,
        visibility: site.visibility,
      })),
      routes: plan.links.flatMap((link) => {
        const from = sceneNodes.get(link.fromSceneId);
        const to = sceneNodes.get(link.toSceneId);
        return from === to
          ? []
          : [
              {
                id: `${id}:route:${link.id}`,
                from,
                to,
                access: "open",
                mode: "foot",
                duration: "",
                bothWays: false,
              },
            ];
      }),
    }),
  });
  return {
    realmId,
    mapWorldId: realmId,
    resolved,
    realm,
    newPlaces: resolved.map(({ place }) => place),
  };
}

/** Build ordinary library records for preview and for approval. */
export function buildGuideAdventure(
  draft: AdventureGuideDraft,
  library: GuideLibrary = { places: [] },
) {
  const { id, plan } = draft;
  const { realmId, mapWorldId, resolved, realm, newPlaces } = resolvePlaces(draft, library);
  const sceneId = (key: string) => `${id}:scene:${key}`;
  const flagId = (key: string) => `${id}:${key}`;
  const factions = plan.world.factions.map((group) =>
    group.existingId
      ? chosenRecord(library.factions, group.existingId, group.name)
      : FactionSchema.parse({
          id: `${id}:faction:${group.id}`,
          name: group.name,
          description: group.note,
        }),
  );
  const characters = plan.world.characters.map((person) =>
    person.existingId
      ? chosenRecord(library.characters, person.existingId, person.name)
      : newCharacterTemplate({
          id: `${id}:character:${person.id}`,
          name: person.name,
          personality: person.note,
        }),
  );
  const playerCard = plan.playerCharacterId
    ? chosenRecord(library.characters, plan.playerCharacterId, plan.playerName)
    : undefined;
  const itemId = (key: string) =>
    plan.items.find((item) => item.id === key)?.existingId ?? `${id}:item:${key}`;
  const objects = plan.items.map((item) =>
    item.existingId
      ? {
          ...chosenRecord(library.objects, item.existingId, item.name),
          startingLocation: { kind: "player" as const },
        }
      : newObjectTemplate({
          id: itemId(item.id),
          name: item.name,
          source: "player",
          tags: [],
          note: item.description,
          ...(item.readableContent === undefined ? {} : { readableContent: item.readableContent }),
          startingLocation: { kind: "player" },
        }),
  );
  const plannedPlaces = new Map(resolved.map((entry) => [entry.site.id, entry]));
  const startSceneId = sceneId(plan.startSceneId);
  const campaign = newCampaignTemplate({
    id: `${id}:adventure`,
    name: plan.title,
    playerIntro: plan.playerIntro,
    player: {
      ...emptyCampaignPlayer(),
      name: plan.playerName,
      ...(playerCard
        ? {
            appearance: playerCard.appearance,
            personality: playerCard.personality,
            pronoun: playerCard.pronoun,
            portraitDataUrl: playerCard.portraitDataUrl,
          }
        : {}),
    },
    realmId,
    ...(mapWorldId ? { mapWorldId } : {}),
    openWorld: "scenes",
    startSceneId,
    guideItemText: {},
    placeIds: resolved.map(({ place }) => place.id),
    objectIds: objects.map(({ id }) => id),
    people: characters.map(({ id }) => ({ characterId: id, stats: {} })),
    sceneLinks: plan.links.map((link) => ({
      ...link,
      id: `${id}:link:${link.id}`,
      fromSceneId: sceneId(link.fromSceneId),
      toSceneId: sceneId(link.toSceneId),
      requiresFlags: link.requiresFlags.map(flagId),
      requiresAbsentFlags: link.requiresAbsentFlags.map(flagId),
      setsFlags: link.setsFlags.map(flagId),
    })),
  });
  campaign.scenes = plan.scenes.map((scene) => {
    const base = { ...emptyCampaignScene(), id: sceneId(scene.id), name: scene.name };
    if (scene.kind === "draft") return { ...base, guideDraftNote: scene.note };
    const entry = plannedPlaces.get(scene.placeId);
    if (!entry) throw new Error(`Unknown plan place: ${scene.placeId}`);
    const { place, nodeId, site } = entry;
    const built = makePlayableScene(
      campaign,
      {
        ...base,
        placeId: place.id,
        ...(nodeId ? { mapNodeId: nodeId } : {}),
        people:
          scene.id === plan.startSceneId
            ? characters.map(({ id }) => ({
                characterId: id,
                position: "",
                mood: "",
                clothing: "",
                holding: "",
                trust: "20",
                familiarity: "10",
                tension: "5",
              }))
            : [],
        usePlaceIntro: false,
        position: { x: site.position.x * 7, y: site.position.y * 5 },
      },
      [{ ...place, note: scene.arrival }],
      characters,
      objects,
    );
    if (!built.encounter) throw new Error(`Could not build scene: ${scene.id}`);
    built.encounter.definition.interactions = scene.actions.map((action) =>
      InteractionSchema.parse({
        id: `${built.id}:action:${action.id}`,
        label: action.label,
        description: "",
        requiresFlags: action.requiresFlags.map(flagId),
        excludesFlags: action.excludesFlags.map(flagId),
        requiresItems: action.requiresItems.map(itemId),
        success: {
          text: action.outcome,
          learned: action.learned,
          effects: action.setsFlags.map((key) => ({ kind: "flag", flag: flagId(key) })),
        },
        failure: { text: "Det går inte just nu." },
      }),
    );
    validateEncounter(built.encounter);
    return built;
  });
  if (realm?.worldMap && factions.length) {
    const startNodeId = campaign.scenes.find((scene) => scene.id === startSceneId)?.mapNodeId;
    const node = realm.worldMap.nodes.find(({ id }) => id === startNodeId);
    if (node) node.factionIds = factions.map(({ id }) => id);
  }
  return {
    campaign,
    realm,
    places: newPlaces,
    objects: objects.filter((_, index) => !plan.items[index]?.existingId),
    characters: characters.filter((_, index) => !plan.world.characters[index]?.existingId),
    factions: factions.filter((_, index) => !plan.world.factions[index]?.existingId),
  };
}
