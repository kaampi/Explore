import { newCharacterTemplate, type CharacterTemplate } from "@library/LibrarySchema";

/**
 * A casting card for the character shelf. Identity only: name, age,
 * pronoun, body and face, typical mood, and how they treat people.
 * The job, if the brief named one, is a shelf tag — not a scene.
 */

export type CharacterGeneratorRequest = {
  /** Free line from the player. Empty still yields a full card. */
  brief: string;
  /** Wins over words in the brief. Empty lets the brief or the roll decide. */
  pronoun?: string | null;
  /** Wins over a number in the brief. Empty lets the brief or the roll decide. */
  approximateAge?: number | null;
  /** Style id. Wins over words in the brief. Empty lets the brief or the roll decide. */
  speech?: string | null;
  /** Same seed and brief always return the same card. */
  seed: number;
};

export type GeneratedCharacter = {
  name: string;
  middleName: string;
  familyName: string;
  approximateAge: number;
  pronoun: string;
  appearance: string;
  mood: string;
  /** How they speak. One or two sentences. Not clothes, not a scene. */
  speech: string;
  personality: string;
  tags: string[];
};

type Temperament = {
  id: string;
  keys: string[];
  mood: string;
  core: string;
  trust: string;
};

const TEMPERAMENTS: Temperament[] = [
  {
    id: "wary",
    keys: ["wary", "cautious", "guarded", "vaksam", "försiktig", "forsiktig"],
    mood: "wary",
    core: "slow to offer anything personal",
    trust: "Trust is earned in small steps, and silence is not an invitation."
  },
  {
    id: "quiet",
    keys: ["quiet", "reserved", "still", "tyst", "fåordig", "faordig"],
    mood: "quiet",
    core: "content to listen longer than most people can stand",
    trust: "Warmth shows up late, and only for someone already let in."
  },
  {
    id: "dry",
    keys: ["dry", "witty", "sardonic", "torr", "kvick"],
    mood: "dry",
    core: "quick to notice absurdity and slow to explain the joke",
    trust: "Affection sounds like teasing, and it stops if someone is actually hurt."
  },
  {
    id: "warm",
    keys: ["warm", "kind", "gentle", "varm", "snäll", "snall", "vänlig"],
    mood: "warm",
    core: "easy to be around and hard to fool",
    trust: "People get a second chance, and a third has to be earned."
  },
  {
    id: "direct",
    keys: ["direct", "blunt", "frank", "rak", "direkt"],
    mood: "direct",
    core: "unwilling to dress a fact up",
    trust: "Rudeness is not honesty, but honesty still arrives without a cushion."
  },
  {
    id: "bright",
    keys: ["bright", "cheerful", "glad", "gladlynt", "munter"],
    mood: "bright",
    core: "inclined to make a room lighter without taking it over",
    trust: "The cheer is real, and it is not a request to be cheered up in return."
  },
  {
    id: "stern",
    keys: ["stern", "severe", "strict", "sträng", "strang"],
    mood: "stern",
    core: "hard to impress and harder to rush",
    trust: "Approval is quiet, and disappointment is quieter."
  },
  {
    id: "cheeky",
    keys: ["cheeky", "playful", "mischievous", "lekfull", "busig"],
    mood: "cheeky",
    core: "unable to leave a straight line entirely straight",
    trust: "The joke stops at the edge of someone's actual fear."
  }
];

export const SPEECH_STYLES = [
  {
    id: "clipped",
    label: "Clipped",
    line: "Speech is clipped. Few words, and no padding.",
    keys: ["korthugget", "korthuggen", "clipped", "terse", "curt"]
  },
  {
    id: "rambling",
    label: "Rambling",
    line: "Speech wanders. One thought picks up the next before the first one lands.",
    keys: ["svävande", "svavande", "rambling", "wandering", "meandering"]
  },
  {
    id: "precise",
    label: "Precise",
    line: "Speech is exact. Each word is chosen.",
    keys: ["precise", "exakt"]
  },
  {
    id: "plain",
    label: "Plain",
    line: "Speech is plain. Nothing is dressed up.",
    keys: ["plain", "enkel"]
  },
  {
    id: "formal",
    label: "Formal",
    line: "Speech is formal. Full sentences, and no slang.",
    keys: ["formal", "formell"]
  },
  {
    id: "halting",
    label: "Halting",
    line: "Speech stops and starts. The next word is not always ready.",
    keys: ["halting", "hackig", "stammande"]
  }
] as const;

export type SpeechStyleId = (typeof SPEECH_STYLES)[number]["id"];

function speechById(id: string | null | undefined) {
  const key = id?.trim().toLowerCase();
  if (!key) return undefined;
  return SPEECH_STYLES.find((style) => style.id === key);
}

const ROLES: { keys: string[]; tag: string }[] = [
  { keys: ["bartender", "barkeeper", "krogvärd", "krogvard"], tag: "bartender" },
  { keys: ["sailor", "seaman", "sjöman", "sjoman"], tag: "sailor" },
  { keys: ["scholar", "lärd", "lard", "forskare"], tag: "scholar" },
  { keys: ["healer", "doktor", "läkare", "lakare"], tag: "healer" },
  { keys: ["soldier", "soldat"], tag: "soldier" },
  { keys: ["merchant", "handlare", "köpman", "kopman"], tag: "merchant" },
  { keys: ["musician", "musiker"], tag: "musician" },
  { keys: ["librarian", "bibliotekarie"], tag: "librarian" },
  { keys: ["cook", "kock", "chef"], tag: "cook" },
  { keys: ["dockworker", "hamnarbetare"], tag: "dockworker" }
];

const GIVEN_SHE = ["Lena", "Mira", "Sable", "Nora", "Edith", "Freya", "Inez", "Ruth", "Anouk", "Petra", "Hana", "Ylva"];
const GIVEN_HE = ["Elias", "Marek", "Jonas", "Oscar", "Henrik", "Tomas", "Nils", "Pavel", "Adrian", "Leo", "Soren", "Amir"];
const GIVEN_THEY = ["Noel", "Remy", "Mika", "Ari", "Soren", "Ash", "Jules", "Robin"];
const MIDDLES = ["Lee", "Jean", "Ann", "Jo", "Marie"];
const FAMILIES = ["Holm", "Berg", "Voss", "Keller", "Lind", "Moreau", "Adler", "Quinn", "Sato", "Navarro", "Okonkwo", "Rahman"];

const BUILDS = ["slight", "athletic", "stocky", "broad-shouldered", "petite", "tall and spare", "thick through the middle"];
const HAIR = ["dark hair", "silvering hair", "close-cropped hair", "curly hair", "straight black hair", "auburn hair", "blonde hair"];
const EYES = ["grey eyes", "dark eyes", "pale eyes", "green eyes", "brown eyes"];
const MARKS = [
  "A thin scar through one eyebrow.",
  "Weathered hands.",
  "A calm, unlined face.",
  "A crooked nose.",
  "Freckles across the nose."
];

const BUILD_HINTS: { keys: string[]; value: string }[] = [
  { keys: ["broad-shouldered", "broad shouldered", "bredaxlad"], value: "broad-shouldered" },
  { keys: ["thick through the middle", "fyllig"], value: "thick through the middle" },
  { keys: ["petite", "liten"], value: "petite" },
  { keys: ["stocky", "kraftig"], value: "stocky" },
  { keys: ["athletic", "atletisk"], value: "athletic" },
  { keys: ["tall and spare", "tall", "lång", "lang"], value: "tall and spare" },
  { keys: ["slight", "späd", "spad"], value: "slight" }
];

const HAIR_HINTS: { keys: string[]; value: string }[] = [
  { keys: ["close-cropped", "snaggad"], value: "close-cropped hair" },
  { keys: ["auburn", "red hair", "rödhår", "rodhar", "rött hår", "rott har"], value: "auburn hair" },
  { keys: ["blonde", "blond"], value: "blonde hair" },
  { keys: ["curly", "lockig"], value: "curly hair" },
  { keys: ["grey hair", "gray hair", "grått hår", "gratt har"], value: "grey hair" },
  { keys: ["silver"], value: "silvering hair" },
  { keys: ["black hair", "svart hår", "svart har"], value: "straight black hair" },
  { keys: ["dark hair", "mörkt hår", "morkt har"], value: "dark hair" }
];

const EYE_HINTS: { keys: string[]; value: string }[] = [
  { keys: ["green eyes", "gröna ögon", "grona ogon"], value: "green eyes" },
  { keys: ["grey eyes", "gray eyes", "grå ögon", "gra ogon"], value: "grey eyes" },
  { keys: ["brown eyes", "bruna ögon", "bruna ogon"], value: "brown eyes" },
  { keys: ["pale eyes"], value: "pale eyes" },
  { keys: ["dark eyes", "mörka ögon", "morka ogon"], value: "dark eyes" }
];

const MARK_HINTS: { keys: string[]; value: string }[] = [
  { keys: ["scarred hands", "ärriga händer", "arriga hander"], value: "Scarred hands." },
  { keys: ["freckle", "fräkn", "frakn"], value: "Freckles across the nose." },
  { keys: ["crooked nose", "sned näsa", "sned nasa"], value: "A crooked nose." },
  { keys: ["scar", "ärr", "arr"], value: "A thin scar through one eyebrow." }
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  const item = items[index];
  if (item === undefined) throw new Error("Empty generator pool.");
  return item;
}

function haystack(brief: string): string {
  return brief.normalize("NFC").toLowerCase().replace(/\s+/g, " ");
}

function hasKey(text: string, key: string): boolean {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}])${escaped}(?=[^\\p{L}]|$)`, "iu").test(text);
}

function firstMatch<T extends { keys: readonly string[] }>(text: string, rows: readonly T[]): T | undefined {
  let best: { row: T; at: number } | undefined;
  for (const row of rows) {
    for (const key of row.keys) {
      if (!hasKey(text, key)) continue;
      const at = text.indexOf(key.toLowerCase());
      if (!best || at < best.at) best = { row, at };
    }
  }
  return best?.row;
}

function allTags(text: string): string[] {
  const tags: string[] = [];
  for (const role of ROLES) {
    if (role.keys.some((key) => hasKey(text, key)) && !tags.includes(role.tag)) tags.push(role.tag);
  }
  return tags.slice(0, 3);
}

function readPronoun(brief: string): string | undefined {
  const text = haystack(brief);
  if (hasKey(text, "they") || hasKey(text, "them") || hasKey(text, "hen")) return "they";
  if (hasKey(text, "she") || hasKey(text, "her") || hasKey(text, "woman") || hasKey(text, "hon") || hasKey(text, "kvinna")) {
    return "she";
  }
  if (hasKey(text, "he") || hasKey(text, "him") || hasKey(text, "man") || hasKey(text, "han") || hasKey(text, "man")) {
    return "he";
  }
  if (hasKey(text, "it") || hasKey(text, "den")) return "it";
  return undefined;
}

function readAge(brief: string): number | undefined {
  const text = haystack(brief);
  const band = text.match(/\b(early|mid|late)\s+(\d{2})s\b/);
  if (band?.[1] && band[2]) {
    const decade = Number(band[2]);
    const offset = band[1] === "early" ? 2 : band[1] === "mid" ? 5 : 8;
    const years = decade + offset;
    if (years >= 1 && years <= 130) return years;
  }
  const exact = text.match(/(?:^|[^\d])(\d{1,3})(?!s)(?:[^\d]|$)/);
  if (exact?.[1]) {
    const years = Number(exact[1]);
    if (years >= 1 && years <= 130) return years;
  }
  return undefined;
}

function clampAge(value: number | null | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  const years = Math.round(value);
  if (years < 1 || years > 130) return undefined;
  return years;
}

function cap(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function givenPool(pronoun: string): readonly string[] {
  if (pronoun === "she") return GIVEN_SHE;
  if (pronoun === "he") return GIVEN_HE;
  if (pronoun === "it") return GIVEN_THEY;
  return GIVEN_THEY;
}

function personalityFor(name: string, temperament: Temperament, observant: boolean): string {
  const second = observant ? "Notices what changed in a room, and rarely mentions it." : temperament.trust;
  return `${name} is ${temperament.core}. ${second}`;
}

export type CastingCues = {
  speechLine?: string;
  pronoun?: string;
  approximateAge?: number;
  mood?: string;
  core?: string;
  trust?: string;
  observant: boolean;
  build?: string;
  hair?: string;
  eyes?: string;
  mark?: string;
  tags: string[];
};

/** Words the brief actually said. Missing fields stay unset so a revision can keep the rolled card. */
export function readCastingCues(brief: string): CastingCues {
  const text = haystack(brief);
  const speech = firstMatch(text, SPEECH_STYLES);
  const temperament = firstMatch(text, TEMPERAMENTS);
  const pronoun = readPronoun(text);
  const approximateAge = readAge(text);
  const build = firstMatch(text, BUILD_HINTS)?.value;
  const hair = firstMatch(text, HAIR_HINTS)?.value;
  const eyes = firstMatch(text, EYE_HINTS)?.value;
  const mark = firstMatch(text, MARK_HINTS)?.value;
  return {
    ...(speech ? { speechLine: speech.line } : {}),
    ...(pronoun ? { pronoun } : {}),
    ...(approximateAge != null ? { approximateAge } : {}),
    ...(temperament
      ? { mood: temperament.mood, core: temperament.core, trust: temperament.trust }
      : {}),
    observant:
      hasKey(text, "observant") ||
      hasKey(text, "notices") ||
      hasKey(text, "notice") ||
      hasKey(text, "uppmärksam") ||
      hasKey(text, "uppmarksam"),
    ...(build ? { build } : {}),
    ...(hair ? { hair } : {}),
    ...(eyes ? { eyes } : {}),
    ...(mark ? { mark } : {}),
    tags: allTags(text)
  };
}

export function cuesMentionCasting(cues: CastingCues): boolean {
  return Boolean(
    cues.speechLine ||
      cues.pronoun ||
      cues.approximateAge != null ||
      cues.mood ||
      cues.observant ||
      cues.build ||
      cues.hair ||
      cues.eyes ||
      cues.mark ||
      cues.tags.length > 0
  );
}

export function generateCharacter(request: CharacterGeneratorRequest): GeneratedCharacter {
  const text = haystack(request.brief);
  const rng = mulberry32(request.seed);
  const pronoun = (request.pronoun?.trim() || readPronoun(text) || (rng() < 0.5 ? "she" : "he")).toLowerCase();
  const approximateAge = clampAge(request.approximateAge) ?? readAge(text) ?? 22 + Math.floor(rng() * 37);
  const name = pick(rng, givenPool(pronoun));
  const middleName = rng() < 0.25 ? pick(rng, MIDDLES) : "";
  const familyName = pick(rng, FAMILIES);
  const build = firstMatch(text, BUILD_HINTS)?.value ?? pick(rng, BUILDS);
  const hair = firstMatch(text, HAIR_HINTS)?.value ?? pick(rng, HAIR);
  const eyes = firstMatch(text, EYE_HINTS)?.value ?? pick(rng, EYES);
  const mark = firstMatch(text, MARK_HINTS)?.value ?? pick(rng, MARKS);
  const rolledSpeech = pick(rng, SPEECH_STYLES);
  const speech = speechById(request.speech) ?? firstMatch(text, SPEECH_STYLES) ?? rolledSpeech;
  const temperament = firstMatch(text, TEMPERAMENTS) ?? pick(rng, TEMPERAMENTS);
  const observant =
    hasKey(text, "observant") ||
    hasKey(text, "notices") ||
    hasKey(text, "notice") ||
    hasKey(text, "uppmärksam") ||
    hasKey(text, "uppmarksam");
  const tags = allTags(text);
  if (!tags.includes(temperament.id)) tags.push(temperament.id);

  return {
    name,
    middleName,
    familyName,
    approximateAge,
    pronoun,
    appearance: `${cap(build)} build, ${hair}, ${eyes}. ${mark}`,
    mood: temperament.mood,
    speech: speech.line,
    personality: personalityFor(name, temperament, observant),
    tags: tags.slice(0, 3)
  };
}

/** Archive card. Same fields Save writes from the character sheet. */
export function characterTemplateFromGenerated(generated: GeneratedCharacter, id?: string): CharacterTemplate {
  return newCharacterTemplate({
    ...(id ? { id } : {}),
    name: generated.name,
    middleName: generated.middleName,
    familyName: generated.familyName,
    approximateAge: generated.approximateAge,
    pronoun: generated.pronoun,
    appearance: generated.appearance,
    mood: generated.mood,
    speech: generated.speech,
    personality: generated.personality,
    tags: generated.tags,
    position: "",
    scenario: "",
    source: "player"
  });
}
