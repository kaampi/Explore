import { adventureMapPlaces, type AdventureMapPlace } from "./adventureMap";
import type { GuideInterview, InterviewPlace, InterviewScene } from "./guideInterview";
import type {
  CampaignTemplate,
  CharacterTemplate,
  ObjectTemplate,
  PlaceTemplate,
  RealmTemplate,
} from "./LibrarySchema";

type ImageLibrary = {
  characters: CharacterTemplate[];
  objects: ObjectTemplate[];
  places: PlaceTemplate[];
  realms: RealmTemplate[];
};

export type GuideImage = {
  id: string;
  kind: "opening" | "scene" | "portrait" | "item" | "world";
  subject: string;
  details: string[];
};

function sceneImages(
  scenes: InterviewScene[],
  openingId: string | undefined,
  library: ImageLibrary,
) {
  const images: GuideImage[] = [];
  const seen = new Set<string>();
  const names = new Set<string>();
  const maps = new Map<string, AdventureMapPlace[]>();
  const ordered = [
    ...scenes.filter(({ id }) => id === openingId),
    ...scenes.filter(({ id }) => id !== openingId),
  ];

  function entriesFor(realmId: string | undefined) {
    if (!realmId) return [];
    const cached = maps.get(realmId);
    if (cached) return cached;
    const realm = library.realms.find(({ id }) => id === realmId);
    const places = library.places.filter((place) => place.realmId === realmId);
    // The projection also inherits backdrops from parent nodes. Its cards must be from this world.
    const entries = adventureMapPlaces(realm, places);
    maps.set(realmId, entries);
    return entries;
  }

  for (const scene of ordered) {
    const { place } = scene;
    const directCard = place.nodeId
      ? undefined
      : library.places.find(
          ({ id, realmId }) =>
            id === place.placeId && (!place.realmId || realmId === place.realmId),
        );
    const realmId = place.realmId || directCard?.realmId;
    const entries = entriesFor(realmId);
    const linkedNodes = (cardId: string) => entries.filter(({ node }) => node.placeId === cardId);
    const cardNodes = directCard ? linkedNodes(directCard.id) : [];
    const entry = place.nodeId
      ? entries.find(({ node }) => node.id === place.nodeId)
      : cardNodes.length === 1
        ? cardNodes[0]
        : undefined;
    const source = entry?.place ?? directCard;
    const linkedCardId = entry?.node.placeId;
    const sharedCard = linkedCardId && linkedNodes(linkedCardId).length === 1;
    const placeName = place.name.trim() || source?.name || "";
    const name = placeName || scene.name.trim();
    if (placeName) names.add(placeName);
    if (!name && !scene.arrival.trim()) continue;

    // Only an explicit, unambiguous card link identifies the two ways of choosing the same place.
    const key =
      entry && !sharedCard
        ? JSON.stringify(["node", realmId, entry.node.id])
        : source
          ? JSON.stringify(["card", realmId, source.id])
          : place.nodeId || place.placeId
            ? JSON.stringify(["unresolved", realmId, place.nodeId, place.placeId])
            : JSON.stringify(["new", realmId, placeName.toLowerCase() || scene.id]);
    if (seen.has(key)) continue;
    seen.add(key);
    if (source?.imageDataUrl || source?.gallery?.length) continue;
    images.push({
      id: "scene-" + scene.id,
      kind: scene.id === openingId ? "opening" : "scene",
      subject: name,
      details: [scene.arrival, source?.note ?? ""],
    });
  }
  return { images, placeNames: [...names] };
}

type Portrait = {
  id: string;
  name: string;
  appearance?: string | undefined;
  note: string;
  pictured?: boolean;
};

function portraitImages(people: Portrait[]): GuideImage[] {
  const seen = new Set<string>();
  return people.flatMap(({ id, name, appearance, note, pictured }) => {
    if (!name.trim() || pictured || seen.has(id)) return [];
    seen.add(id);
    return [{ id, kind: "portrait", subject: name.trim(), details: [appearance ?? "", note] }];
  });
}

function itemImages(
  items: Array<{ id: string; name: string; imageDataUrl?: string | undefined }>,
): GuideImage[] {
  const seen = new Set<string>();
  return items.flatMap(({ id, name, imageDataUrl }) => {
    if (!name.trim() || imageDataUrl || seen.has(id)) return [];
    seen.add(id);
    return [{ id: "item-" + id, kind: "item", subject: name.trim(), details: [] }];
  });
}

function worldImage(
  name: string,
  note: string,
  world: RealmTemplate | undefined,
  placeNames: string[],
): GuideImage[] {
  if (!name || world?.imageDataUrl || world?.gallery?.length) return [];
  return [
    {
      id: "world",
      kind: "world",
      subject: name,
      details: [note || world?.note || "", placeNames.join(", ")],
    },
  ];
}

export function guideImages(draft: GuideInterview, library: ImageLibrary): GuideImage[] {
  const { images, placeNames } = sceneImages(
    [draft.opening, ...draft.later],
    draft.opening.id,
    library,
  );
  const people = [draft.role, ...draft.people].map((person, index) => {
    const character = library.characters.find(({ id }) => id === person.existingId);
    return {
      id: character ? "character-" + character.id : "draft-person-" + index,
      name: person.name.trim() || character?.name || "",
      appearance: character?.appearance,
      note: person.note,
      pictured: !!character?.portraitDataUrl,
    };
  });
  const items = draft.items.map((item, index) => {
    const object = library.objects.find(({ id }) => id === item.existingId);
    return {
      id: object ? "card-" + object.id : "draft-" + index,
      name: item.name.trim() || object?.name || "",
      imageDataUrl: object?.imageDataUrl,
    };
  });
  const world = library.realms.find(({ id }) => id === draft.world.existingId);
  return [
    ...images,
    ...portraitImages(people),
    ...itemImages(items),
    ...worldImage(
      draft.world.name.trim() || world?.name || "",
      draft.world.note,
      world,
      placeNames,
    ),
  ];
}

export function savedGuideImages(campaign: CampaignTemplate, library: ImageLibrary): GuideImage[] {
  const realmId = campaign.mapWorldId ?? campaign.realmId;
  const scenes = campaign.scenes.map((scene) => {
    const place: InterviewPlace = {
      name: "",
      placeId: scene.placeId || undefined,
      nodeId: scene.mapNodeId,
      realmId: scene.mapNodeId ? realmId : undefined,
    };
    return {
      id: scene.id,
      name: scene.name,
      place,
      arrival: scene.usePlaceIntro
        ? ""
        : (scene.encounter?.definition.description ?? scene.guideDraftNote ?? ""),
    };
  });
  const { images, placeNames } = sceneImages(scenes, campaign.startSceneId ?? undefined, library);
  const characterIds = new Set([
    ...campaign.people.map(({ characterId }) => characterId),
    ...campaign.scenes.flatMap(({ people }) => people.map(({ characterId }) => characterId)),
  ]);
  const people = library.characters
    .filter(({ id }) => characterIds.has(id))
    .map((character) => ({
      id: "character-" + character.id,
      name: character.name,
      appearance: character.appearance,
      note: character.personality,
      pictured: !!character.portraitDataUrl,
    }));
  if (campaign.player) {
    people.unshift({
      id: "player",
      name: campaign.player.name,
      appearance: campaign.player.appearance,
      note: campaign.player.personality,
      pictured: !!campaign.player.portraitDataUrl,
    });
  }
  const itemIds = new Set([
    ...campaign.objectIds,
    ...campaign.scenes.flatMap(({ objectIds }) => objectIds),
  ]);
  const items = library.objects.filter(({ id }) => itemIds.has(id));
  const world = library.realms.find(({ id }) => id === realmId);
  return [
    ...images,
    ...portraitImages(people),
    ...itemImages(items),
    ...worldImage(world?.name || "", "", world, placeNames),
  ];
}
