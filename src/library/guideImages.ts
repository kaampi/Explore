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

export type GuideImageTarget = {
  name: string;
  context?: string | undefined;
  number?: number | undefined;
} & (
  | { kind: "character"; id: string }
  | { kind: "object"; id: string }
  | { kind: "realm"; id: string }
  | { kind: "player"; id: string }
  | { kind: "place"; id: string; realmId: string | undefined }
  | { kind: "mapPlace"; id: string; realmId: string }
);

export type GuideImage = {
  id: string;
  kind: "opening" | "scene" | "portrait" | "item" | "world";
  subject: string;
  details: string[];
  target?: GuideImageTarget | undefined;
};

export function guideMapPlaces(world: RealmTemplate | undefined, places: PlaceTemplate[]) {
  // A node may inherit a backdrop through a parent card, within the same world only.
  return world
    ? adventureMapPlaces(
        world,
        places.filter((place) => place.realmId === world.id),
      )
    : [];
}

export function hasGuidePlaceImage(place: PlaceTemplate | undefined): boolean {
  return Boolean(place?.imageDataUrl || place?.gallery?.length);
}

function sceneImages(
  scenes: InterviewScene[],
  openingId: string | undefined,
  library: ImageLibrary,
  saved = false,
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
    const entries = guideMapPlaces(realm, library.places);
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
    if (hasGuidePlaceImage(source)) continue;
    const linkedCard =
      entry && realmId && sharedCard
        ? library.places.find((card) => card.id === linkedCardId && card.realmId === realmId)
        : undefined;
    const card = saved && (entry ? linkedCard : directCard);
    const target: GuideImageTarget | undefined = card
      ? { kind: "place", id: card.id, realmId: card.realmId, name: card.name, context: entry?.path }
      : saved && entry && realmId
        ? {
            kind: "mapPlace",
            id: entry.node.id,
            realmId,
            name: entry.node.name,
            context: entry.path,
          }
        : undefined;
    images.push({
      id: "scene-" + scene.id,
      kind: scene.id === openingId ? "opening" : "scene",
      subject: name,
      details: [scene.arrival, source?.note ?? ""],
      target,
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
  target?: GuideImageTarget | undefined;
};

function portraitImages(people: Portrait[]): GuideImage[] {
  const seen = new Set<string>();
  return people.flatMap(({ id, name, appearance, note, pictured, target }) => {
    if (!name.trim() || pictured || seen.has(id)) return [];
    seen.add(id);
    return [
      { id, kind: "portrait", subject: name.trim(), details: [appearance ?? "", note], target },
    ];
  });
}

function itemImages(
  items: Array<Pick<ObjectTemplate, "id" | "name" | "imageDataUrl"> & { note?: string }>,
  saved = false,
): GuideImage[] {
  const seen = new Set<string>();
  return items.flatMap((item) => {
    const { id, name, note, imageDataUrl } = item;
    if (!name.trim() || imageDataUrl || seen.has(id)) return [];
    seen.add(id);
    const sameName = saved ? items.filter((other) => other.name.trim() === name.trim()) : [];
    const context = saved ? note?.trim() : undefined;
    return [
      {
        id: "item-" + id,
        kind: "item",
        subject: name.trim(),
        details: context ? [context] : [],
        target: saved
          ? {
              kind: "object",
              id,
              name,
              context,
              number: sameName.length > 1 ? sameName.indexOf(item) + 1 : undefined,
            }
          : undefined,
      },
    ];
  });
}

function worldImage(
  name: string,
  note: string,
  world: RealmTemplate | undefined,
  placeNames: string[],
  saved = false,
): GuideImage[] {
  if (!name || world?.imageDataUrl || world?.gallery?.length) return [];
  return [
    {
      id: "world",
      kind: "world",
      subject: name,
      details: [note || world?.note || "", placeNames.join(", ")],
      target: saved && world ? { kind: "realm", id: world.id, name: world.name } : undefined,
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
  const { images, placeNames } = sceneImages(
    scenes,
    campaign.startSceneId ?? undefined,
    library,
    true,
  );
  const characterIds = new Set([
    ...campaign.people.map(({ characterId }) => characterId),
    ...campaign.scenes.flatMap(({ people }) => people.map(({ characterId }) => characterId)),
  ]);
  const characters = library.characters.filter(({ id }) => characterIds.has(id));
  const people: Portrait[] = characters.map((character) => {
    const sameName = characters.filter(({ name }) => name.trim() === character.name.trim());
    return {
      id: "character-" + character.id,
      name: character.name,
      appearance: character.appearance,
      note: character.personality,
      pictured: !!character.portraitDataUrl,
      target: {
        kind: "character",
        id: character.id,
        name: character.name,
        context: character.appearance || character.personality,
        number: sameName.length > 1 ? sameName.indexOf(character) + 1 : undefined,
      },
    };
  });
  if (campaign.player) {
    people.unshift({
      id: "player",
      name: campaign.player.name,
      appearance: campaign.player.appearance,
      note: campaign.player.personality,
      pictured: !!campaign.player.portraitDataUrl,
      target: { kind: "player", id: campaign.id, name: campaign.player.name },
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
    ...itemImages(items, true),
    ...worldImage(world?.name || "", "", world, placeNames, true),
  ];
}
