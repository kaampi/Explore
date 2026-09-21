import {
  CharacterTemplateSchema,
  FALLBACK_REALM_ID,
  ObjectTemplateSchema,
  PlaceTemplateSchema,
  RealmTemplateSchema,
  RulesetTemplateSchema,
  VoiceTemplateSchema,
  type CharacterTemplate,
  type ObjectTemplate,
  type PlaceTemplate,
  type RealmTemplate,
  type RulesetTemplate,
  type VoiceTemplate
} from "./LibrarySchema";
import { ROOM_FROM_LANDMARK } from "@state/playerDestination";

export const EXAMPLE_CHARACTER_ID = "example-emma";
export const EXAMPLE_PLACE_ID = "example-aurora-room";
export const EXAMPLE_REALM_DUNBAAR_ID = FALLBACK_REALM_ID;

/** Always-on map for the Aurora example. These rooms exist; access is still a favor. */
export const EXAMPLE_AURORA_NOTE =
  "Adjoining the archive: a washroom off the hall, Emma's room behind the staff door, a guest room upstairs, and a locked cellar behind the counter.";

/** Compact Pass 1 copy for the Aurora example. The long intro stays on the picture. */
export const EXAMPLE_AURORA_BRIEF =
  "The Aurora Room is a hidden harbor archive with subdued lighting, weathered wooden shelves and dark doors lurking in the shadows. Behind the counter, the keeper goes about her business unhurriedly – a quiet haven for those who simply want to be left in peace without having to explain themselves.";

/** Keyword-gated lore for the Aurora example. Quiet until chat names the room. */
export const EXAMPLE_CELLAR_LORE = {
  content:
    "A locked cellar door sits behind the counter. Old manifests and a strongbox are stored there. Staff do not mention it unless asked.",
  keywords: ["cellar", "cellar door", "wine cellar", "källare", "källaren"]
};

export const EXAMPLE_EMMA_ROOM_LORE = {
  content:
    "Emma's room is behind the staff door. A narrow bed, a writing desk, charts pinned to the wall. She keeps this room to herself.",
  brief: "A narrow bed, a writing desk, charts pinned to the wall. They are already in this room.",
  keywords: ["emma's room", "emmas room", "staff room", "her room", "your room", "my room"]
};

export const EXAMPLE_TOILETS_LORE = {
  content: "A washroom off a short hall from the archive. One lock, one bulb, nothing fancy.",
  keywords: ["toilet", "toilets", "bathroom", "wc", "loo", "toalett"]
};

export const EXAMPLE_GUEST_ROOM_LORE = {
  content: "A small guest room upstairs. Spare key behind the bar. Not advertised.",
  keywords: ["guest room", "guestroom", "upstairs", "spare room", "gästrum"]
};

export const EXAMPLE_AURORA_LORE = [
  EXAMPLE_CELLAR_LORE,
  EXAMPLE_EMMA_ROOM_LORE,
  EXAMPLE_TOILETS_LORE,
  EXAMPLE_GUEST_ROOM_LORE
];

/** Named rooms on the Aurora example — pictures attach here; intro is the room itself. */
export const EXAMPLE_AURORA_ROOMS: PlaceTemplate["rooms"] = [
  {
    id: "room-emmas",
    label: "Emma's room",
    keywords: EXAMPLE_EMMA_ROOM_LORE.keywords,
    description: EXAMPLE_EMMA_ROOM_LORE.content,
    brief: EXAMPLE_EMMA_ROOM_LORE.brief,
    fromRoomIds: [ROOM_FROM_LANDMARK],
    gate: "hidden"
  },
  {
    id: "room-cellar",
    label: "cellar",
    keywords: EXAMPLE_CELLAR_LORE.keywords,
    description: EXAMPLE_CELLAR_LORE.content,
    fromRoomIds: [ROOM_FROM_LANDMARK],
    gate: "locked"
  },
  {
    id: "room-toilets",
    label: "toilets",
    keywords: EXAMPLE_TOILETS_LORE.keywords,
    description: EXAMPLE_TOILETS_LORE.content,
    fromRoomIds: [ROOM_FROM_LANDMARK],
    gate: "open"
  },
  {
    id: "room-gents",
    label: "Gents Room",
    keywords: ["gents", "gents room", "men's", "mens room"],
    description: EXAMPLE_TOILETS_LORE.content,
    fromRoomIds: [ROOM_FROM_LANDMARK],
    gate: "open"
  },
  {
    id: "room-ladies",
    label: "Ladies Room",
    keywords: ["ladies", "ladies room", "women's", "womens room"],
    description: EXAMPLE_TOILETS_LORE.content,
    fromRoomIds: [ROOM_FROM_LANDMARK],
    gate: "open"
  },
  {
    id: "room-guest",
    label: "guest room",
    keywords: EXAMPLE_GUEST_ROOM_LORE.keywords,
    description: EXAMPLE_GUEST_ROOM_LORE.content,
    fromRoomIds: [ROOM_FROM_LANDMARK],
    gate: "hidden"
  }
];

/** Fill missing Aurora room intros on a saved example that predates the field. */
export function withAuroraRoomIntros(rooms: PlaceTemplate["rooms"] | undefined): PlaceTemplate["rooms"] {
  const base = rooms && rooms.length > 0 ? rooms : EXAMPLE_AURORA_ROOMS;
  const byId = new Map(EXAMPLE_AURORA_ROOMS.map((room) => [room.id, room]));
  const byLabel = new Map(EXAMPLE_AURORA_ROOMS.map((room) => [room.label.trim().toLowerCase(), room]));
  const mapped = base.map((room) => {
    const example = byId.get(room.id) ?? byLabel.get(room.label.trim().toLowerCase());
    if (!example) return room;
    return {
      ...room,
      keywords: room.keywords?.length ? room.keywords : example.keywords,
      description: room.description?.trim() ? room.description : example.description,
      brief: room.brief?.trim() ? room.brief : example.brief,
      fromRoomIds: room.fromRoomIds?.length ? room.fromRoomIds : example.fromRoomIds,
      gate: room.fromRoomIds?.length || (room.gate && room.gate !== "open") ? room.gate ?? "open" : example.gate
    };
  });
  const have = new Set(mapped.map((room) => room.id));
  for (const example of EXAMPLE_AURORA_ROOMS) {
    if (!have.has(example.id)) mapped.push(example);
  }
  return mapped;
}
export const EXAMPLE_VOICE_TOLKIEN_ID = "example-voice-tolkien";
export const EXAMPLE_VOICE_FREIGHTER_ID = "example-voice-freighter";
export const EXAMPLE_RULESET_FANTASY_ID = "example-ruleset-fantasy";
export const EXAMPLE_RULESET_CLOSENESS_ID = "example-ruleset-closeness";
export const EXAMPLE_OBJECT_RING_ID = "example-object-one-ring";
export const EXAMPLE_OBJECT_KEY_ID = "example-object-guest-key";
export const EXAMPLE_OBJECT_LIGHTSABER_ID = "example-object-lightsaber";
export const EXAMPLE_OBJECT_STONE_ID = "example-object-heavy-stone";

const STAMP = "2026-01-01T00:00:00.000Z";

export function exampleCharacterTemplate(): CharacterTemplate {
  return CharacterTemplateSchema.parse({
    id: EXAMPLE_CHARACTER_ID,
    name: "Emma",
    personality:
      "Dry-witted, meticulous, and slow to trust strangers with what she keeps in the ledgers. Speaks in short, precise sentences and rarely volunteers information about herself. When she decides someone is trustworthy, the reserve cracks — a real hug, not just a nod across the counter.",
    mood: "reserved",
    pronoun: "she",
    approximateAge: 28,
    appearance: "Dark hair, sharp features, ink-stained fingers.",
    position: "",
    scenario: "",
    source: "example",
    createdAt: STAMP,
    updatedAt: STAMP
  });
}

export function exampleRealmDunbaar(): RealmTemplate {
  return RealmTemplateSchema.parse({
    id: EXAMPLE_REALM_DUNBAAR_ID,
    name: "City of Dunbaar",
    note: "A quiet city. Hidden rooms sit behind ordinary doors.",
    source: "example",
    createdAt: STAMP,
    updatedAt: STAMP
  });
}

export function exampleRealmTemplates(): RealmTemplate[] {
  return [exampleRealmDunbaar()];
}

export function examplePlaceTemplate(): PlaceTemplate {
  return PlaceTemplateSchema.parse({
    id: EXAMPLE_PLACE_ID,
    realmId: EXAMPLE_REALM_DUNBAAR_ID,
    name: "The Aurora Room — a quiet harbor archive",
    lighting: "low, oil-lamp amber",
    noise: "creaking timbers and distant gulls",
    music: false,
    note: EXAMPLE_AURORA_NOTE,
    brief: EXAMPLE_AURORA_BRIEF,
    rooms: EXAMPLE_AURORA_ROOMS,
    source: "example",
    createdAt: STAMP,
    updatedAt: STAMP
  });
}

export function exampleTolkienVoice(): VoiceTemplate {
  return VoiceTemplateSchema.parse({
    id: EXAMPLE_VOICE_TOLKIEN_ID,
    name: "Tolkien-äventyr",
    instruction:
      "Du är Spelledare för ett klassiskt fantasyäventyr i en värld präglad av Tolkiens mytologi. Din berättarröst är storslagen, poetisk och atmosfärisk. Fokusera på uråldrig historia, naturbeskrivningar och en känsla av ett smygande mörker. Beskriv platser med vördnad.",
    source: "example",
    createdAt: STAMP,
    updatedAt: STAMP
  });
}

export function exampleFreighterVoice(): VoiceTemplate {
  return VoiceTemplateSchema.parse({
    id: EXAMPLE_VOICE_FREIGHTER_ID,
    name: "Rymdskepps-äventyr",
    instruction:
      "Du är Spelledare för ett sci-fi-rollspel ombord på ett skadat fraktskepp i den oändliga rymden. Din ton är rå, teknisk och klaustrofobisk. Använd sci-fi-jargong (skrovstatus, reaktortryck, syrenivåer) och fokusera på brådskande hot, mekaniska fel och överlevnad. Gör miljön opålitlig.",
    source: "example",
    createdAt: STAMP,
    updatedAt: STAMP
  });
}

export function exampleVoiceTemplates(): VoiceTemplate[] {
  return [exampleTolkienVoice(), exampleFreighterVoice()];
}

export function exampleFantasyRuleset(): RulesetTemplate {
  return RulesetTemplateSchema.parse({
    id: EXAMPLE_RULESET_FANTASY_ID,
    name: "Klassisk fantasy",
    attributes: [
      {
        id: "strength",
        name: "Styrka",
        kind: "number",
        min: 1,
        max: 18,
        highMeaning:
          "Wins physical contests, breaks or forces things open, intimidates through sheer presence, tires slowly in a fight.",
        lowMeaning:
          "Loses physical contests, struggles to carry or force anything, gets winded quickly, avoided in a straight fight."
      },
      {
        id: "dexterity",
        name: "Smidighet",
        kind: "number",
        min: 1,
        max: 18,
        highMeaning: "Moves fast and precisely, dodges or catches things reflexively, excels at balance or fine motor control.",
        lowMeaning: "Clumsy, slow to react, drops things, loses footing easily."
      },
      {
        id: "intelligence",
        name: "Intelligens",
        kind: "number",
        min: 1,
        max: 18,
        highMeaning: "Notices details others miss, solves puzzles and reads situations quickly, speaks with precision.",
        lowMeaning: "Misses obvious clues, struggles with plans that have more than one step, takes things at face value."
      },
      {
        id: "wisdom",
        name: "Visdom",
        kind: "number",
        min: 1,
        max: 18,
        highMeaning: "Reads people's true intentions, gives advice that turns out right, stays calm under pressure.",
        lowMeaning: "Misjudges people and situations, panics or freezes under pressure, gives advice that backfires."
      },
      {
        id: "charisma",
        name: "Karisma",
        kind: "number",
        min: 1,
        max: 18,
        highMeaning: "Wins people over, holds a room, makes a request land as reasonable.",
        lowMeaning: "Talks past people, is easy to dismiss, struggles to rally anyone."
      }
    ],
    source: "example",
    createdAt: STAMP,
    updatedAt: STAMP
  });
}

export function exampleClosenessRuleset(): RulesetTemplate {
  return RulesetTemplateSchema.parse({
    id: EXAMPLE_RULESET_CLOSENESS_ID,
    name: "Förtroende",
    attributes: [
      {
        id: "safety",
        name: "Trygghet",
        kind: "number",
        min: 0,
        max: 100,
        highMeaning: "{{char}} can stay open with the player.",
        lowMeaning: "{{char}} keeps distance.",
        description: "How safe {{char}} feels with the player. High: {{char}} can stay open. Low: {{char}} keeps distance.",
        maxShift: 10
      },
      {
        id: "suspicion",
        name: "Misstänksamhet",
        kind: "number",
        min: 0,
        max: 100,
        highMeaning: "{{char}} watches the player closely and holds things back.",
        lowMeaning: "{{char}} answers questions freely.",
        description:
          "How suspicious {{char}} is of the player's motives. High: {{char}} holds back. Low: {{char}} answers freely.",
        maxShift: 15
      },
      {
        id: "warmth",
        name: "Värme",
        kind: "number",
        min: 0,
        max: 100,
        highMeaning: "{{char}} is comfortable with a hand on the shoulder or a hug from the player.",
        lowMeaning: "{{char}} keeps physical distance.",
        description:
          "How comfortable {{char}} is with physical warmth from the player — a hand on the shoulder, a hug. High: comfortable. Low: keeps distance.",
        maxShift: 15,
        role: "desire"
      }
    ],
    source: "example",
    createdAt: STAMP,
    updatedAt: STAMP
  });
}

export function exampleRulesetTemplates(): RulesetTemplate[] {
  return [exampleFantasyRuleset(), exampleClosenessRuleset()];
}

export function exampleRingObject(): ObjectTemplate {
  return ObjectTemplateSchema.parse({
    id: EXAMPLE_OBJECT_RING_ID,
    name: "The One Ring",
    note: "A plain gold band. It must not leave this company unwatched.",
    tags: ["Fantasy", "relic"],
    source: "example",
    createdAt: STAMP,
    updatedAt: STAMP
  });
}

export function exampleGuestKeyObject(): ObjectTemplate {
  return ObjectTemplateSchema.parse({
    id: EXAMPLE_OBJECT_KEY_ID,
    name: "Guest-house key",
    note: "Unlocks the guest room upstairs.",
    tags: ["Fantasy", "key"],
    placeId: EXAMPLE_PLACE_ID,
    source: "example",
    createdAt: STAMP,
    updatedAt: STAMP
  });
}

export function exampleLightsaberObject(): ObjectTemplate {
  return ObjectTemplateSchema.parse({
    id: EXAMPLE_OBJECT_LIGHTSABER_ID,
    name: "Lightsaber",
    note: "A plasma blade. Out of place in a quiet tavern — unless you put it there.",
    tags: ["scifi", "weapon"],
    source: "example",
    createdAt: STAMP,
    updatedAt: STAMP
  });
}

export function exampleHeavyStoneObject(): ObjectTemplate {
  return ObjectTemplateSchema.parse({
    id: EXAMPLE_OBJECT_STONE_ID,
    name: "A heavy stone",
    note: "Too large to pocket. Lifting it is a strength check.",
    tags: ["Fantasy"],
    weight: 40,
    difficulty: 14,
    checkAttribute: "strength",
    source: "example",
    createdAt: STAMP,
    updatedAt: STAMP
  });
}

export function exampleObjectTemplates(): ObjectTemplate[] {
  return [exampleRingObject(), exampleGuestKeyObject(), exampleLightsaberObject(), exampleHeavyStoneObject()];
}

/** Built-in examples first (library copy wins if saved), then the rest of the shelf. */
export function mergeWithExamples<T extends { id: string }>(library: T[], examples: T[]): T[] {
  const exampleIds = new Set(examples.map((item) => item.id));
  const resolved = examples.map((example) => library.find((item) => item.id === example.id) ?? example);
  const extras = library.filter((item) => !exampleIds.has(item.id));
  return [...resolved, ...extras];
}
