import { expect, it } from "vitest";
import { guideImages, savedGuideImages } from "../../src/library/guideImages";
import { newGuideInterview, newGuideScene } from "../../src/library/guideInterview";
import {
  newCampaignTemplate,
  newCharacterTemplate,
  newObjectTemplate,
  newPlaceTemplate,
  newRealmTemplate,
} from "../../src/library/LibrarySchema";
import { WorldMapSchema } from "../../src/library/worldMap";

const empty = { characters: [], objects: [], places: [], realms: [] };

it("starts with the playable opening and groups multiple scenes that use the same place", () => {
  const draft = newGuideInterview();
  expect(guideImages(draft, empty)).toEqual([]);
  draft.opening.place.name = "Fyren";
  draft.opening.arrival = "Ljus faller genom kupans glas.";
  draft.later = [
    { ...newGuideScene(), place: { name: "Fyren" }, arrival: "Det har blivit natt." },
    { ...newGuideScene(), place: { name: "Hamnen" } },
  ];
  const keeper = newCharacterTemplate({ name: "Fyrvaktaren" });
  draft.role = { name: keeper.name, note: "", existingId: keeper.id };
  draft.people = [{ ...draft.role }, { name: "Lotsen", note: "Gul oljerock." }];
  draft.items = [{ name: "Nyckeln", note: "Detta är en hemlig ledtråd." }];
  draft.world = { name: "Fyrkusten", note: "Klippig kust och ett smalt sund." };
  draft.secrets = "Författarens hemlighet.";
  const before = structuredClone(draft);
  const images = guideImages(draft, { ...empty, characters: [keeper] });
  expect(images.map(({ kind, subject }) => [kind, subject])).toEqual([
    ["opening", "Fyren"],
    ["scene", "Hamnen"],
    ["portrait", "Fyrvaktaren"],
    ["portrait", "Lotsen"],
    ["item", "Nyckeln"],
    ["world", "Fyrkusten"],
  ]);
  expect(images[0]?.details).toContain("Ljus faller genom kupans glas.");
  expect(images.at(-1)?.details).toContain("Fyren, Hamnen");
  expect(JSON.stringify(images)).not.toMatch(/hemlig/);
  expect(draft).toEqual(before);
});

it("respects backdrops, portraits and item pictures already in use", () => {
  const draft = newGuideInterview();
  const realm = newRealmTemplate({
    name: "Fyrkusten",
    imageDataUrl: "atlas-image",
    note: "",
    source: "player",
  });
  const place = newPlaceTemplate({
    name: "Hamnen",
    realmId: realm.id,
    imageDataUrl: "harbor-image",
  });
  const person = newCharacterTemplate({ name: "Lotsen", portraitDataUrl: "portrait" });
  const thing = newObjectTemplate({
    name: "Nyckeln",
    imageDataUrl: "item-image",
    note: "",
    tags: [],
    source: "player",
  });
  draft.world.existingId = realm.id;
  draft.opening.place.placeId = place.id;
  draft.role.existingId = person.id;
  draft.items = [{ name: "", note: "", existingId: thing.id }];
  expect(
    guideImages(draft, {
      places: [place],
      characters: [person],
      objects: [thing],
      realms: [realm],
    }),
  ).toEqual([]);
});

it("groups a place card with its explicitly linked map node, keeping the opening first", () => {
  const draft = newGuideInterview();
  const house = newPlaceTemplate({ id: "hall", name: "Konserthuset", realmId: "music" });
  const realm = newRealmTemplate({
    id: house.realmId,
    name: "Musikkvarteret",
    note: "",
    source: "player",
    worldMap: WorldMapSchema.parse({
      nodes: [
        { id: "node-hall", kind: "Landmark", placeId: house.id, name: house.name, x: 20, y: 30 },
      ],
      routes: [],
    }),
  });
  draft.opening.place = { name: house.name, placeId: house.id, realmId: realm.id };
  draft.opening.arrival = "Genrep i gryningen.";
  draft.later = [
    {
      ...newGuideScene(),
      place: { name: house.name, realmId: realm.id, nodeId: "node-hall", placeId: house.id },
      arrival: "Föreställningen börjar.",
    },
  ];
  const library = { ...empty, places: [house], realms: [realm] };
  expect(guideImages(draft, library)).toEqual([
    expect.objectContaining({
      kind: "opening",
      subject: house.name,
      details: ["Genrep i gryningen.", ""],
    }),
  ]);

  const other = newPlaceTemplate({ id: "another-hall", name: house.name, realmId: realm.id });
  draft.later[0]!.place = { name: other.name, placeId: other.id };
  expect(
    guideImages(draft, { ...library, places: [house, other] }).map(({ kind, subject }) => [
      kind,
      subject,
    ]),
  ).toEqual([
    ["opening", house.name],
    ["scene", house.name],
  ]);
});

it("uses only the selected world's node and place images, including inherited backdrops", () => {
  const draft = newGuideInterview();
  const foreign = newPlaceTemplate({
    id: "harbor",
    realmId: "other-world",
    name: "Torrdockan",
    imageDataUrl: "other-world-image",
  });
  const foreignParent = newPlaceTemplate({
    id: "parent-card",
    realmId: "other-world",
    name: "Annan hamn",
    imageDataUrl: "wrong-parent-image",
  });
  const world = newRealmTemplate({
    id: "river-world",
    name: "Ålandet",
    note: "",
    source: "player",
    worldMap: WorldMapSchema.parse({
      nodes: [
        {
          id: "parent",
          kind: "Landmark",
          placeId: foreignParent.id,
          name: "Åstaden",
          x: 15,
          y: 15,
        },
        { id: foreign.id, kind: "Landmark", parentId: "parent", name: "Åhamnen", x: 30, y: 30 },
      ],
      routes: [],
    }),
  });
  draft.opening.place = { name: "Åhamnen", nodeId: foreign.id, realmId: world.id };
  const library = { ...empty, places: [foreign, foreignParent], realms: [world] };
  const missing = guideImages(draft, library);
  expect(missing).toEqual([expect.objectContaining({ kind: "opening", subject: "Åhamnen" })]);

  const [parent, harbor] = world.worldMap!.nodes;
  harbor!.imageDataUrl = "own-image";
  expect(guideImages(draft, library)).toEqual([]);
  delete harbor!.imageDataUrl;
  parent!.images = ["parent-image"];
  expect(guideImages(draft, library)).toEqual([]);
  delete parent!.images;
  const ownCard = newPlaceTemplate({
    id: foreign.id,
    realmId: world.id,
    name: "Åhamnen",
    imageDataUrl: "own-card-image",
  });
  expect(guideImages(draft, { ...library, places: [ownCard, foreignParent] })).toEqual([]);
});

it("keeps separate portrait suggestions for two saved characters with the same name", () => {
  const pictured = newCharacterTemplate({ name: "Alex", portraitDataUrl: "portrait" });
  const other = newCharacterTemplate({ name: "Alex" });
  const campaign = newCampaignTemplate({
    name: "Två personer",
    people: [pictured, other].map(({ id }) => ({ characterId: id, stats: {} })),
  });
  expect(savedGuideImages(campaign, { ...empty, characters: [pictured, other] })).toEqual([
    expect.objectContaining({ id: "character-" + other.id, kind: "portrait", subject: "Alex" }),
  ]);
});
