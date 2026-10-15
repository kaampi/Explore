import {
  cuesMentionCasting,
  generateCharacter,
  readCastingCues,
  type CastingCues,
  type GeneratedCharacter
} from "@library/characterGenerator";

/**
 * A short casting talk. The first reply becomes a card. Later replies
 * change only the part the player just named. One question at a time.
 * Setting and plot stay off the card.
 */

export const INTERVIEW_OPENING = "What kind of character do you want? Describe them in a few words.";

export const OLLAMA_UNREACHABLE_NOTE = "Could not reach Ollama. This draft used the local generator.";

export const OLLAMA_UNREADABLE_NOTE = "Ollama's reply could not be read. This draft used the local generator.";

export type InterviewReply = {
  card: GeneratedCharacter | null;
  imagePrompt: string;
  /** Empty once the player has confirmed this person. */
  question: string;
};

export type ConductedInterview = {
  reply: InterviewReply;
  source: "local" | "ollama";
  note: string;
};

const OBSERVANT_LINE = "Notices what changed in a room, and rarely mentions it.";

const REROLL = new Set([
  "no",
  "nope",
  "nej",
  "nä",
  "na",
  "someone else",
  "somebody else",
  "different person",
  "en annan",
  "inte den",
  "not this one",
  "try again",
  "another"
]);

const YES = new Set([
  "yes",
  "yeah",
  "yep",
  "ja",
  "japp",
  "stämmer",
  "stammer",
  "this one",
  "that's the one",
  "thats the one",
  "perfect",
  "good",
  "den här",
  "den har",
  "ok",
  "okay"
]);

const BANNED =
  /\b(jacket|dress|shirt|pants|skirt|uniform|coat|boots|jewelry|necklace|weapon|kink|fetish|sister|brother|mother|father)\b/i;

const APPEARANCE_PATTERN = /^(.+?) build, (.+?), ([^.]+)\. (.+)$/;

function bare(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?]+$/g, "").trim();
}

function classify(text: string): "reroll" | "yes" | "note" {
  const line = bare(text);
  if (REROLL.has(line)) return "reroll";
  if (YES.has(line)) return "yes";
  return "note";
}

function cap(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function imagePromptFor(card: GeneratedCharacter): string {
  return `Head-and-shoulders portrait. ${card.appearance} Face at rest, plain background.`;
}

function mergeAppearance(current: string, cues: CastingCues): string {
  if (!cues.build && !cues.hair && !cues.eyes && !cues.mark) return current;
  const parsed = current.match(APPEARANCE_PATTERN);
  const build = cues.build ?? parsed?.[1]?.toLowerCase() ?? "slight";
  const hair = cues.hair ?? parsed?.[2] ?? "dark hair";
  const eyes = cues.eyes ?? parsed?.[3] ?? "dark eyes";
  const mark = cues.mark ?? parsed?.[4] ?? "A calm, unlined face.";
  return `${cap(build)} build, ${hair}, ${eyes}. ${mark}`;
}

function reviseCard(card: GeneratedCharacter, cues: CastingCues): GeneratedCharacter {
  let personality = card.personality;
  let mood = card.mood;
  if (cues.core && cues.trust && cues.mood) {
    personality = `${card.name} is ${cues.core}. ${cues.observant ? OBSERVANT_LINE : cues.trust}`;
    mood = cues.mood;
  } else if (cues.observant) {
    const first = card.personality.split(/(?<=[.!?])\s+/)[0] ?? card.personality;
    personality = `${first} ${OBSERVANT_LINE}`;
  }

  const tags = cues.mood && cues.mood !== card.mood ? card.tags.filter((tag) => tag !== card.mood) : [...card.tags];
  if (cues.mood && !tags.includes(cues.mood)) tags.push(cues.mood);
  for (const tag of cues.tags) {
    if (!tags.includes(tag)) tags.push(tag);
  }

  return {
    ...card,
    ...(cues.pronoun ? { pronoun: cues.pronoun } : {}),
    ...(cues.approximateAge != null ? { approximateAge: cues.approximateAge } : {}),
    ...(cues.speechLine ? { speech: cues.speechLine } : {}),
    appearance: mergeAppearance(card.appearance, cues),
    mood,
    personality,
    tags: tags.slice(0, 3)
  };
}

function nextQuestion(cues: CastingCues): string {
  if (!cues.speechLine) return "How do they speak?";
  if (!cues.build && !cues.hair && !cues.eyes && !cues.mark) return "How do you picture them? Body and face.";
  if (!cues.mood && !cues.observant) return "How do they treat people?";
  return "Is this the person you had in mind?";
}

/** Same messages and seed always return the same card and the same question. */
export function localInterview(messages: readonly string[], seed: number): InterviewReply {
  const cleaned = messages.map((message) => message.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return { card: null, imagePrompt: "", question: INTERVIEW_OPENING };
  }

  let activeSeed = seed;
  let wish = "";
  let notes: string[] = [];
  let card: GeneratedCharacter | null = null;
  let confirmed = false;

  for (const text of cleaned) {
    const cues = readCastingCues(text);
    const facts = cuesMentionCasting(cues);
    const kind = facts ? "note" : classify(text);

    if (!wish) {
      wish = text;
      card = generateCharacter({ brief: wish, seed: activeSeed });
      confirmed = false;
      continue;
    }

    if (kind === "reroll") {
      activeSeed += 1;
      notes = [];
      confirmed = false;
      card = generateCharacter({ brief: wish, seed: activeSeed });
      continue;
    }

    if (kind === "yes") {
      confirmed = true;
      continue;
    }

    if (!card) continue;
    notes.push(text);
    confirmed = false;
    card = reviseCard(card, cues);
  }

  const covered = readCastingCues([wish, ...notes].join("\n"));
  return {
    card,
    imagePrompt: card ? imagePromptFor(card) : "",
    question: confirmed || !card ? "" : nextQuestion(covered)
  };
}

export const INTERVIEW_SYSTEM = `You are casting one person onto an archive card for a text sandbox.
The player describes who they want, in any language. You answer with the card and one follow-up question.

Return JSON only, no markdown:
{"name":"","middleName":"","familyName":"","approximateAge":40,"pronoun":"she","appearance":"","mood":"","speech":"","personality":"","tags":[],"imagePrompt":"","question":""}

pronoun is she, he, it, or they.
appearance and imagePrompt: body and face only. One or two short sentences. No clothes, jewelry, weapons, or accessories.
speech: how they talk, one or two sentences. Not a sample of dialogue.
personality: two short sentences. Temperament, and how they treat people. No backstory, no family, no kink.
mood: one or two words.
tags: up to 3 short shelf labels such as healer or pilot. A job name is a tag, not a quest.
The player's setting may shape the person. Do not write the plot, the place, or the adventure onto the card.
question: exactly one short question about the biggest gap still open (how they speak, how they look, or how they treat people). Empty string if the player just confirmed this person.
If the player asks for someone else, invent a different name and keep their original wish.
English on the card. Do not copy clothes, kink, or family from the player into any field.`;

export function interviewUserPrompt(messages: readonly string[], local: InterviewReply): string {
  const lines = messages.map((message, index) => `${index + 1}. ${message.trim()}`).join("\n");
  const draft = local.card
    ? JSON.stringify({
        name: local.card.name,
        middleName: local.card.middleName,
        familyName: local.card.familyName,
        approximateAge: local.card.approximateAge,
        pronoun: local.card.pronoun,
        appearance: local.card.appearance,
        mood: local.card.mood,
        speech: local.card.speech,
        personality: local.card.personality,
        tags: local.card.tags
      })
    : "{}";
  return `Player messages:\n${lines}\n\nLocal draft, if the wish is too thin to cast from:\n${draft}`;
}

function tidy(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function oneQuestion(value: unknown, fallback: string): string {
  const text = tidy(value, 180);
  if (!text || BANNED.test(text)) return fallback;
  const sentence = text.split(/(?<=[?])\s+/)[0] ?? text;
  return sentence.length > 180 ? `${sentence.slice(0, 177)}...` : sentence;
}

function keepClean(value: unknown, fallback: string, max: number): string {
  const text = tidy(value, max);
  if (!text || BANNED.test(text)) return fallback;
  return text;
}

function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const tag = entry.trim().toLowerCase().replace(/\s+/g, "-");
    if (!/^[a-z][a-z0-9-]{0,23}$/.test(tag)) continue;
    if (BANNED.test(tag)) continue;
    if (!tags.includes(tag)) tags.push(tag);
    if (tags.length === 3) break;
  }
  return tags;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as unknown;
  } catch {
    return undefined;
  }
}

/** Model JSON, field by field. A banned or empty field keeps the local draft. Null if there is no person to keep. */
export function interviewFromModelText(text: string, local: InterviewReply, latestUser: string): InterviewReply | null {
  const card = local.card;
  if (!card) return null;
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const name = keepClean(record.name, "", 40);
  if (!name) return null;
  const pronoun = tidy(record.pronoun, 12).toLowerCase();
  const age = typeof record.approximateAge === "number" ? Math.round(record.approximateAge) : card.approximateAge;
  const latest = latestUser.trim();
  const confirmed = !cuesMentionCasting(readCastingCues(latest)) && classify(latest) === "yes";
  const tags = readTags(record.tags);
  const next: GeneratedCharacter = {
    name,
    middleName: keepClean(record.middleName, "", 40),
    familyName: keepClean(record.familyName, "", 40),
    approximateAge: age >= 1 && age <= 130 ? age : card.approximateAge,
    pronoun: pronoun === "she" || pronoun === "he" || pronoun === "it" || pronoun === "they" ? pronoun : card.pronoun,
    appearance: keepClean(record.appearance, card.appearance, 400),
    mood: keepClean(record.mood, card.mood, 40),
    speech: keepClean(record.speech, card.speech, 280),
    personality: keepClean(record.personality, card.personality, 500),
    tags: tags.length > 0 ? tags : card.tags
  };
  const imagePrompt = keepClean(record.imagePrompt, imagePromptFor(next), 400);
  return {
    card: next,
    imagePrompt,
    question: confirmed ? "" : oneQuestion(record.question, local.question)
  };
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

export async function conductCharacterInterview(
  input: { messages: readonly string[]; seed: number },
  complete?: (messages: Array<{ role: "system" | "user"; content: string }>) => Promise<string>
): Promise<ConductedInterview> {
  const reply = localInterview(input.messages, input.seed);
  if (!complete || !reply.card) return { reply, source: "local", note: "" };
  const latest = input.messages.map((message) => message.trim()).filter(Boolean).at(-1) ?? "";
  try {
    const text = await complete([
      { role: "system", content: INTERVIEW_SYSTEM },
      { role: "user", content: interviewUserPrompt(input.messages, reply) }
    ]);
    const shaped = interviewFromModelText(text, reply, latest);
    if (!shaped) return { reply, source: "local", note: OLLAMA_UNREADABLE_NOTE };
    return { reply: shaped, source: "ollama", note: "" };
  } catch (err) {
    if (isAbort(err)) throw err;
    return { reply, source: "local", note: OLLAMA_UNREACHABLE_NOTE };
  }
}
