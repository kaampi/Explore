import type { CharacterPronoun } from "@state/StateSchema";

const AGE_MIN = 1;
const AGE_MAX = 130;

function years(raw: string): number | undefined {
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const y = Math.round(n);
  if (y < AGE_MIN || y > AGE_MAX) return undefined;
  return y;
}

function uniqueYears(matches: Iterable<RegExpMatchArray>): number[] {
  const found = new Set<number>();
  for (const match of matches) {
    const y = years(match[1] ?? "");
    if (y != null) found.add(y);
  }
  return [...found];
}

function pickSoleYear(matches: Iterable<RegExpMatchArray>): number | undefined {
  const found = uniqueYears(matches);
  return found.length === 1 ? found[0] : undefined;
}

/** ST `age` field, or a number/string like "30". */
export function ageFromField(value: unknown): number | undefined {
  if (typeof value === "number") return years(String(value));
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  const labeled = trimmed.match(/^(?:age\s*[=:\-]?\s*)?(\d{1,3})$/i);
  return years(labeled?.[1] ?? trimmed);
}

/**
 * Best-effort years from card prose. Prefers `Age: 30` / `Age=22`, then "20 year old".
 * Skips when two different numbers look equally like age.
 */
export function ageFromText(text: string): number | undefined {
  const labeled = pickSoleYear(text.matchAll(/\b(?:age|ålder)\s*[=:\-]\s*(\d{1,3})\b/gi));
  if (labeled != null) return labeled;

  const yearOld = pickSoleYear(
    text.matchAll(/\b(\d{1,3})(?:-|\s+)(?:year|yr)s?(?:-|\s+)old\b/gi)
  );
  if (yearOld != null) return yearOld;

  const swedish = pickSoleYear(text.matchAll(/\b(\d{1,3})\s*år(?:\s*gammal)?\b/gi));
  if (swedish != null) return swedish;

  return pickSoleYear(text.matchAll(/\b(?:she|he|they)\s+(?:is|'s)\s+(\d{1,3})\b/gi));
}

function pronounToken(raw: string): CharacterPronoun | undefined {
  const key = raw.toLowerCase().split("/")[0]?.trim() ?? "";
  if (key === "she" || key === "her") return "she";
  if (key === "he" || key === "him" || key === "his") return "he";
  if (key === "they" || key === "them" || key === "their") return "they";
  if (key === "hon" || key === "henne" || key === "hennes") return "she";
  if (key === "han" || key === "honom" || key === "hans") return "he";
  return undefined;
}

/** JSON `gender` / W++ `Gender=Female, Woman`. */
export function pronounFromGenderLabel(gender: string): CharacterPronoun | undefined {
  const parts = gender
    .split(/[,/]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  for (const part of parts) {
    if (part === "she" || part === "female" || part === "f" || part === "woman" || part === "girl") return "she";
    if (part === "he" || part === "male" || part === "m" || part === "man" || part === "boy") return "he";
    if (part === "it") return "it";
    if (part === "they" || part === "them" || part === "nonbinary" || part === "non-binary" || part === "enby") {
      return "they";
    }
    const fromPronoun = pronounToken(part);
    if (fromPronoun) return fromPronoun;
  }
  return undefined;
}

function countWord(haystack: string, word: string): number {
  const re = new RegExp(`\\b${word}\\b`, "gi");
  return haystack.match(re)?.length ?? 0;
}

/**
 * Pronoun from description/personality when the card has no gender field.
 * Opening "She is…" / a Pronouns line wins; otherwise a clear she/he majority.
 */
export function pronounFromText(text: string): CharacterPronoun | undefined {
  const genderLine = text.match(/\bgender\s*[=:\-]\s*([^\n\]]+)/i);
  const fromGender = genderLine ? pronounFromGenderLabel(genderLine[1] ?? "") : undefined;
  if (fromGender) return fromGender;

  const labeled = text.match(
    /\bpronouns?\s*[:\-]\s*(she\/her|he\/him|they\/them|she|he|they|her|him|them|hon|han)\b/i
  );
  const fromLabel = labeled ? pronounToken(labeled[1] ?? "") : undefined;
  if (fromLabel) return fromLabel;

  const opening = text.match(/(?:^|\n)\s*(she|he|they|hon|han)\s+(?:is|was|'s|är)\b/i);
  const fromOpening = opening ? pronounToken(opening[1] ?? "") : undefined;
  if (fromOpening) return fromOpening;

  const head = text.slice(0, 800);
  const she = countWord(head, "she") + countWord(head, "hon");
  const he = countWord(head, "he") + countWord(head, "han");
  const they = countWord(head, "they");

  const ranked = [
    { pronoun: "she" as const, n: she },
    { pronoun: "he" as const, n: he },
    { pronoun: "they" as const, n: they }
  ].sort((a, b) => b.n - a.n);
  const [winner, runner] = ranked;
  if (!winner || winner.n < 2) return undefined;
  if (runner && runner.n > 0 && winner.n < runner.n * 2) return undefined;
  return winner.pronoun;
}

const HONORIFIC = /^(princess|prince|king|queen|lady|lord|sir|dame|miss|mister|master|doctor|dr)\s+/i;

export function stripHonorific(name: string): string {
  return name.trim().replace(HONORIFIC, "").trim();
}

function normalizeWppKey(key: string): string {
  return key.trim().toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ");
}

function trimWppValue(value: string): string {
  return value.replace(/[\]}]+$/g, "").trim();
}

/**
 * SillyTavern W++ / PList keys (`Age=22`, `Age(22)`, `Body/Appearance=…`).
 * Parenthesized values may span lines and contain nested parentheses.
 */
export function wPlusPlusFields(text: string): Record<string, string> {
  const normalized = text.replace(/\r\n/g, "\n");
  // Read balanced values first, then hide their lines from the equals parser.
  // This prevents a nested Age(...) or Personality=... in a value from being
  // promoted to a separate top-level identity field.
  const parenthesized: Record<string, string> = {};
  const spans: Array<{ start: number; end: number }> = [];
  const headers = normalized.matchAll(/^[\t ]*[\[{]?[\t ]*([A-Za-z][A-Za-z0-9 /&'_-]*?)[\t ]*\(/gm);
  let consumed = 0;
  for (const header of headers) {
    if (header.index < consumed) continue;
    const opening = header.index + header[0].length - 1;
    let depth = 1;
    let quoted = false;
    let end = opening + 1;
    for (; end < normalized.length; end++) {
      if (normalized[end] === "\\") { end++; continue; }
      if (normalized[end] === '"') { quoted = !quoted; continue; }
      if (quoted) continue;
      if (normalized[end] === "(") depth++;
      if (normalized[end] === ")" && --depth === 0) break;
    }
    if (depth !== 0) continue; // Unbalanced source remains available in review.
    let value = normalized.slice(opening + 1, end).trim();
    if (value.startsWith('"') && value.endsWith('"') && !value.slice(1, -1).includes('"')) value = value.slice(1, -1);
    parenthesized[normalizeWppKey(header[1] ?? "")] = value;
    consumed = end + 1;
    spans.push({ start: header.index, end: consumed });
  }
  let masked = "";
  let offset = 0;
  for (const span of spans) {
    masked += normalized.slice(offset, span.start) + normalized.slice(span.start, span.end).replace(/[^\n]/g, " ");
    offset = span.end;
  }
  masked += normalized.slice(offset);
  const lines = masked.split("\n");
  const out: Record<string, string> = {};
  let current: string | null = null;
  let buf: string[] = [];

  function flush() {
    if (!current) return;
    const value = trimWppValue(buf.join("\n"));
    out[current] = value;
  }

  for (const line of lines) {
    const match = line.match(/^\s*[\[{]?([A-Za-z][A-Za-z0-9 /&'_-]*)\s*=\s*(.*)$/);
    if (match) {
      flush();
      current = normalizeWppKey(match[1] ?? "");
      buf = [match[2] ?? ""];
    } else if (current) {
      buf.push(line);
    }
  }
  flush();
  return { ...out, ...parenthesized };
}

export function wppLooks(fields: Record<string, string>): string {
  return fields["body/appearance"] || fields.body || fields.looks || fields.appearance || "";
}


