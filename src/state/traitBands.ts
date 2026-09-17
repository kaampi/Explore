import type { AttributeDef, CharacterPronoun } from "./StateSchema";
import { pronounForms } from "./pronouns";

export type TraitBand = "low" | "mid" | "high";

export type TraitVoice = {
  /** Given name — {{char}} */
  char?: string;
  pronoun?: CharacterPronoun;
};

/** Drop unset fields so exactOptionalPropertyTypes stays happy. */
export function traitVoice(input: {
  char?: string | undefined;
  pronoun?: CharacterPronoun | undefined;
}): TraitVoice {
  const voice: TraitVoice = {};
  const char = input.char?.trim();
  if (char) voice.char = char;
  if (input.pronoun) voice.pronoun = input.pronoun;
  return voice;
}

type MeaningFields = {
  name: string;
  kind: AttributeDef["kind"];
  min?: number | undefined;
  max?: number | undefined;
  description?: string | undefined;
  highMeaning?: string | undefined;
  lowMeaning?: string | undefined;
  midMeaning?: string | undefined;
};

const THEY_FALLBACK = {
  they: "they",
  them: "them",
  their: "their",
  theirs: "theirs",
  themselves: "themselves"
} as const;

function matchCase(token: string, replacement: string): string {
  if (!token || !replacement) return replacement;
  const first = token.charAt(0);
  if (first === first.toUpperCase() && first !== first.toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Rule-set meanings are shared across cast. {{char}} is the given name;
 * {{they}} / {{them}} / {{their}} / {{themselves}} follow that character's pronoun.
 */
export function applyTraitTokens(text: string, voice?: TraitVoice): string {
  const name = voice?.char?.trim();
  const forms = pronounForms(voice?.pronoun) ?? THEY_FALLBACK;
  return text
    .replace(/\{\{char\}\}/gi, () => name || "they")
    .replace(/\{\{(they|them|their|theirs|themselves)\}\}/gi, (full, key: string) =>
      matchCase(full.replace(/[{}]/g, ""), forms[key.toLowerCase() as keyof typeof forms])
    );
}

export function attributeRange(def: { min?: number | undefined; max?: number | undefined }): { min: number; max: number } {
  const min = typeof def.min === "number" && Number.isFinite(def.min) ? def.min : 0;
  const max = typeof def.max === "number" && Number.isFinite(def.max) ? def.max : 100;
  if (max <= min) return { min: 0, max: 100 };
  return { min, max };
}

/**
 * Band against this field's own min–max. Low is the bottom 30% of the
 * range, high the top 30% (70–100 on a 0–100 scale).
 */
export function traitBand(value: number, def: { min?: number | undefined; max?: number | undefined }): TraitBand {
  const { min, max } = attributeRange(def);
  if (value <= min) return "low";
  if (value >= max) return "high";
  const t = (value - min) / (max - min);
  if (t <= 0.3) return "low";
  if (t >= 0.7) return "high";
  return "mid";
}

/** The number field marked as this rule-set's closeness/desire signal. */
export function desireAttribute(attributes: readonly AttributeDef[] | undefined): AttributeDef | undefined {
  return (attributes ?? []).find((def) => def.kind === "number" && def.role === "desire");
}

export function liveTraitBand(
  def: { min?: number | undefined; max?: number | undefined; kind?: AttributeDef["kind"] },
  value: string | number
): TraitBand | undefined {
  if (def.kind === "text") return undefined;
  const n = numericValue(value);
  if (n === undefined) return undefined;
  return traitBand(n, def);
}

/** Live band of the marked desire field, or undefined if none is marked or the value is missing. */
export function desireBandFromStats(
  attributes: readonly AttributeDef[] | undefined,
  stats: Record<string, { value: string | number }> | undefined
): TraitBand | undefined {
  const def = desireAttribute(attributes);
  if (!def || !stats) return undefined;
  const field = stats[def.id];
  if (!field) return undefined;
  return liveTraitBand(def, field.value);
}

function text(value: string | undefined): string {
  return value?.trim() ?? "";
}

function numericValue(value: string | number): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * What the model should treat as true at this live value.
 * Prefers high/low/mid authoring; falls back to a single `description`.
 */
export function liveTraitBody(def: MeaningFields, value: string | number, voice?: TraitVoice): string | undefined {
  const fallback = text(def.description);
  const pick = (() => {
    if (def.kind === "text") return fallback || undefined;

    const n = numericValue(value);
    if (n === undefined) return fallback || undefined;

    const high = text(def.highMeaning);
    const low = text(def.lowMeaning);
    const mid = text(def.midMeaning);
    const band = traitBand(n, def);

    if (band === "high") return high || fallback || undefined;
    if (band === "low") return low || fallback || undefined;
    if (mid) return mid;
    if (high && low) return `high would mean ${high.replace(/\.*$/, "")}. low would mean ${low.replace(/\.*$/, "")}.`;
    return high || low || fallback || undefined;
  })();
  return pick ? applyTraitTokens(pick, voice) : undefined;
}

export function liveTraitTag(def: MeaningFields, value: string | number): string | undefined {
  if (def.kind === "text") return undefined;
  const n = numericValue(value);
  if (n === undefined) return undefined;
  const band = traitBand(n, def);
  if (band !== "mid") return band;
  if (text(def.midMeaning)) return "mid";
  if (text(def.highMeaning) && text(def.lowMeaning)) return "neither high nor low";
  return "mid";
}

/** Cast / Adventure caption for the current number. */
export function liveTraitNote(def: MeaningFields, value: string | number, voice?: TraitVoice): string | undefined {
  const body = liveTraitBody(def, value, voice);
  if (!body) return undefined;
  const n = numericValue(value);
  if (def.kind === "text" || n === undefined) return body;
  const { max } = attributeRange(def);
  const tag = liveTraitTag(def, n);
  return tag ? `${n}/${max} (${tag}): ${body}` : `${n}/${max}: ${body}`;
}

/** Required state-summary line. */
export function liveTraitLine(who: string, def: MeaningFields, value: string | number, voice?: TraitVoice): string | undefined {
  const body = liveTraitBody(def, value, voice ?? { char: who });
  if (!body) return undefined;
  const n = numericValue(value);
  if (def.kind === "text" || n === undefined) {
    return `- ${who} ${def.name} ${value}: ${body}`;
  }
  const { max } = attributeRange(def);
  const tag = liveTraitTag(def, n) ?? "mid";
  return `- ${who} ${def.name} ${n}/${max} (${tag}): ${body}`;
}
