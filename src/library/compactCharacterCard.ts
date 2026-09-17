export type CompactCardFields = {
  appearance: string;
  mood: string;
  personality: string;
};

export class CompactCardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompactCardError";
  }
}

const SYSTEM = `You rewrite a character CASTING CARD for a text RPG engine.
The card is identity for casting, not a sex bot, not a story kit, not SillyTavern.

Return JSON only, no markdown:
{"appearance":"","mood":"","personality":""}

appearance: body and face only. Prefer overall shape — athletic, petite, stocky, broad-shouldered, thick through the middle — plus hair, eyes, skin, marks. One or two short sentences. Do not repeat age (no "in her late 20s"). A resting scowl may stay if it is how the face is built; a scene-mood ("stern right now") belongs in Typical mood.
If the source lists breast or butt size, fold that into build (petite, slight, full-figured) instead of naming breasts, ass, or a measurement. The player may keep an explicit belly or chest note; do not invent one. Never genitals, nipples, clothes (wears, pants, jackets, dog tags, jewelry), dirt, accessories, wire, weapons, or "practical/run-down look".

mood: one or two words that match THIS person. Infer from how they treat people (direct, wary, dry, warm, cheeky). Never default to reserved unless the text actually says withdrawn or quiet. Never copy tags (Imported) or age.

personality: 2–4 short sentences. Temperament, how they treat people, how they speak.
Do not invent sexual allure, seduction, or NSFW. If the current personality already states that (a siren who lures men, a courtesan, etc.), keep one short factual line — the player wrote it.
Never: backstory, city lore, jobs-as-quest, other people (sisters, family, gangs), {{char}} / {{user}}, first_mes, example dialogue, behaviour-on-meeting, romance gates, kinks, fetishes, ST sex lists, promiscuous, orientation labels (those live on campaign stats).
No duplicate ideas. Do not invent facts (no hair color or family that is not in the source). English.`;

const KEEP_HEADER = /^(appearance|personality|body)\b/i;
const DROP_HEADER =
  /^(age|race|gender|background|world|location|district|home|behaviour|behavior|narrative|other characters|local population|scenario|first.?mes|system|example|guidelines)\b/i;

/** Keep Appearance + Personality only. Drop world bibles, side characters, RP rules. */
export function extractCompactSource(raw: string): string {
  const text = raw
    .replace(/\{\{\s*char\s*\}\}/gi, "")
    .replace(/\{\{\s*user\s*\}\}/gi, "")
    .replace(/\u00a0/g, " ");
  const chunks: string[] = [];
  let keep = false;
  let buf: string[] = [];

  function flush() {
    const block = buf.join("\n").trim();
    if (keep && block) chunks.push(block);
    buf = [];
  }

  for (const line of text.split(/\n/)) {
    if (/^\s*[\[\]]\s*$/.test(line)) continue;
    const header = line.match(/^\s*(?:\[\s*)?([A-Za-z][A-Za-z /_-]*)\s*:/);
    if (header) {
      const key = header[1].trim();
      if (DROP_HEADER.test(key)) {
        flush();
        keep = false;
        continue;
      }
      if (KEEP_HEADER.test(key)) {
        flush();
        keep = true;
      }
    }
    if (keep) buf.push(line);
  }
  flush();
  return chunks.join("\n\n").trim();
}

function tidyClauses(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,(?=\S)/g, ", ")
    .replace(/,\s*,+/g, ",")
    .replace(/^,\s*|,\s*$/g, "")
    .replace(/\s+\./g, ".")
    .trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function looksJunkBit(bit: string): boolean {
  return (
    /\b(nipples?|areola|genitals?|penis|vagina|wears?|wearing|worn|outfit|clothing|dressed|jewelry|unadorned|scavenged|wire)\b/i.test(
      bit
    ) ||
    /\b(pants|jeans|trousers|skirt|jacket|coat|hoodie|boots?|sneakers|necklace|choker|dog tags?|pouches|straps)\b/i.test(
      bit
    ) ||
    /\bcompression tops?\b/i.test(bit) ||
    /\baround (?:her|his|their) neck\b/i.test(bit) ||
    /\bgiving off\b/i.test(bit) ||
    /\boverall look\b/i.test(bit) ||
    (/\blook\b/i.test(bit) && /\b(practical|run-?down|ethereal|mysterious)\b/i.test(bit))
  );
}

function dropLooksJunk(text: string): string {
  const withoutTie = text.replace(/\s*tied back with [^,.]+/gi, "");
  const kept = splitSentences(withoutTie).flatMap((sentence) => {
    const clipped = tidyClauses(
      sentence
        .split(/,\s*/)
        .filter((clause) => clause.trim() && !looksJunkBit(clause))
        .join(", ")
    );
    if (!clipped || looksJunkBit(clipped)) return [];
    return [clipped];
  });
  return kept
    .join(" ")
    .replace(/\s*,?\s*in (?:her|his|their) (?:early |mid |late )?\d+s\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

function dropMoodJunk(mood: string): string {
  return mood
    .replace(/\bimported\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/,\s*,+/g, ",")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim();
}

function personalityJunkSentence(sentence: string): boolean {
  return /\b(promiscuous|kinks?|fetish(?:es)?|nsfw|intimacy|horny|lust|orgasm|bisexual|heterosexual|homosexual|pansexual|sisters?|brothers?|mother|father|siblings?)\b/i.test(
    sentence
  );
}

function fingerprintSentence(sentence: string): string {
  return sentence
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dropPersonalityJunk(text: string): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of splitSentences(text)) {
    if (personalityJunkSentence(part)) continue;
    const key = fingerprintSentence(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(part);
  }
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

export function sanitizeCompactFields(fields: CompactCardFields): CompactCardFields {
  return {
    appearance: dropLooksJunk(fields.appearance),
    mood: dropMoodJunk(fields.mood),
    personality: dropPersonalityJunk(fields.personality)
  };
}

export function compactCharacterMessages(input: {
  name: string;
  appearance: string;
  mood: string;
  personality: string;
  rawText?: string;
}): Array<{ role: "system" | "user"; content: string }> {
  const parts = [
    `Name: ${input.name.trim() || "(unnamed)"}`,
    `Looks now:\n${input.appearance.trim() || "(empty)"}`,
    `Typical mood now:\n${input.mood.trim() || "(empty)"}`,
    `Personality now:\n${input.personality.trim() || "(empty)"}`
  ];
  const source = input.rawText ? extractCompactSource(input.rawText) : "";
  if (source) {
    parts.push(`Source Appearance/Personality only (ignore anything else you remember):\n${source.slice(0, 4000)}`);
  }
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: parts.join("\n\n") }
  ];
}

export function parseCompactCardJson(text: string): CompactCardFields {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new CompactCardError("The model did not return a card JSON object.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    throw new CompactCardError("The model returned invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new CompactCardError("The model returned invalid JSON.");
  }
  const record = parsed as Record<string, unknown>;
  const appearance = typeof record.appearance === "string" ? record.appearance.trim() : "";
  const mood = typeof record.mood === "string" ? record.mood.trim() : "";
  const personality = typeof record.personality === "string" ? record.personality.trim() : "";
  const cleaned = sanitizeCompactFields({ appearance, mood, personality });
  if (!cleaned.appearance && !cleaned.personality) {
    throw new CompactCardError("The compact card was empty.");
  }
  return cleaned;
}
