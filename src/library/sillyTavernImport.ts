import { ensureImportedTag, newCharacterTemplate, type CharacterTemplate } from "./LibrarySchema";
import type { CharacterPronoun } from "@state/StateSchema";
import {
  ageFromField,
  ageFromText,
  pronounFromGenderLabel,
  pronounFromText,
  stripHonorific,
  wPlusPlusFields,
  wppLooks
} from "./cardHints";
import { splitPersonName } from "./personName";

export class SillyTavernImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SillyTavernImportError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function characterDataFromUnknown(raw: unknown): Record<string, unknown> {
  const root = asRecord(raw);
  if (!root) {
    throw new SillyTavernImportError("Character card is not a JSON object.");
  }

  const spec = readString(root, "spec");
  const nested = asRecord(root.data);
  if (nested && (spec.startsWith("chara_card_v") || spec === "chara_card_v3" || "name" in nested)) {
    return nested;
  }
  if (typeof root.name === "string" || typeof root.char_name === "string") {
    return root;
  }
  throw new SillyTavernImportError("Could not find a character name in this card.");
}

function pronounFromCardData(data: Record<string, unknown>): CharacterPronoun | undefined {
  return pronounFromGenderLabel(readString(data, "gender") || readString(data, "sex"));
}

function identityTextFromData(data: Record<string, unknown>): string {
  return [readString(data, "description"), readString(data, "personality")].filter(Boolean).join("\n\n");
}

export type SillyTavernReview = {
  rawText: string;
  character: CharacterTemplate;
};

/**
 * ST cards mix play-kit and identity. Prefill name, looks, personality, age,
 * pronoun. W++ keys win over a dumped description. Skip scenario, first_mes,
 * mes_example.
 */
export function characterFromCardData(raw: unknown): CharacterTemplate {
  return reviewFromCardData(raw).character;
}

export function reviewFromCardData(raw: unknown): SillyTavernReview {
  const data = characterDataFromUnknown(raw);
  const jsonName = readString(data, "name") || readString(data, "char_name");
  const personalityField = readString(data, "personality");
  const description = readString(data, "description");
  const rawText = identityTextFromData(data);
  if (!jsonName && !rawText) {
    throw new SillyTavernImportError("This character card has no name.");
  }

  const wpp = wPlusPlusFields(rawText);
  const structured = Boolean(wpp.character || wpp["body/appearance"]);
  const displayName = stripHonorific(wpp.character || jsonName);
  if (!displayName) {
    throw new SillyTavernImportError("This character card has no name.");
  }

  const looks = wppLooks(wpp) || (structured ? "" : description);
  const personality = (wpp.personality || personalityField).trim();
  const pronoun =
    pronounFromCardData(data) ??
    (wpp.gender ? pronounFromGenderLabel(wpp.gender) : undefined) ??
    pronounFromText(rawText);
  const approximateAge = ageFromField(data.age) ?? ageFromField(wpp.age) ?? ageFromText(rawText);
  const names = splitPersonName(displayName);
  const character = newCharacterTemplate({
    name: names.given,
    familyName: names.family,
    middleName: names.middle,
    personality,
    appearance: looks,
    mood: "",
    position: "",
    scenario: "",
    source: "sillytavern",
    tags: ensureImportedTag([], "sillytavern"),
    ...(pronoun ? { pronoun } : {}),
    ...(approximateAge != null ? { approximateAge } : {})
  });
  return { rawText: rawText || displayName, character };
}

function decodeTextPayload(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // SillyTavern PNG chunks store Base64(JSON).
  }
  try {
    const decoded = atob(trimmed);
    return JSON.parse(decoded);
  } catch {
    throw new SillyTavernImportError("PNG character chunk is not valid JSON or Base64 JSON.");
  }
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function splitKeyword(data: Uint8Array): { keyword: string; rest: Uint8Array } | null {
  const nullAt = data.indexOf(0);
  if (nullAt <= 0) return null;
  return { keyword: ascii(data, 0, nullAt), rest: data.subarray(nullAt + 1) };
}

async function inflateZlib(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === "undefined") {
    throw new SillyTavernImportError("This runtime cannot decode compressed PNG character chunks.");
  }
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("deflate"));
  return await new Response(stream).text();
}

/**
 * Reads SillyTavern `chara` / `ccv3` text from PNG tEXt or zTXt chunks.
 * Prefers ccv3 when both are present.
 */
export async function extractSillyTavernJsonFromPng(bytes: Uint8Array): Promise<unknown> {
  if (!isPng(bytes)) {
    throw new SillyTavernImportError("File is not a PNG character card.");
  }

  let charaJson: unknown;
  let ccv3Json: unknown;
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = ascii(bytes, offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break;

    const data = bytes.subarray(dataStart, dataEnd);
    offset = dataEnd + 4; // skip CRC

    if (type !== "tEXt" && type !== "zTXt") continue;
    const split = splitKeyword(data);
    if (!split) continue;
    if (split.keyword !== "chara" && split.keyword !== "ccv3" && split.keyword !== "ccv2") continue;

    let text: string;
    if (type === "tEXt") {
      text = new TextDecoder().decode(split.rest);
    } else {
      const method = split.rest[0];
      if (method !== 0) continue;
      text = await inflateZlib(split.rest.subarray(1));
    }

    const json = decodeTextPayload(text);
    if (split.keyword === "ccv3") ccv3Json = json;
    else charaJson = json;
  }

  const found = ccv3Json ?? charaJson;
  if (found === undefined) {
    throw new SillyTavernImportError("No SillyTavern character data found in this PNG.");
  }
  return found;
}

export async function importSillyTavernCard(input: { jsonText?: string; pngBytes?: Uint8Array }): Promise<SillyTavernReview> {
  let raw: unknown;
  if (input.pngBytes) {
    raw = await extractSillyTavernJsonFromPng(input.pngBytes);
  } else if (input.jsonText !== undefined) {
    try {
      raw = JSON.parse(input.jsonText);
    } catch {
      throw new SillyTavernImportError("This file is not valid JSON.");
    }
  } else {
    throw new SillyTavernImportError("Nothing to import.");
  }
  return reviewFromCardData(raw);
}

export async function importSillyTavernFile(file: File): Promise<SillyTavernReview> {
  const name = file.name.toLowerCase();
  if (file.type === "image/png" || name.endsWith(".png")) {
    return importSillyTavernCard({ pngBytes: new Uint8Array(await file.arrayBuffer()) });
  }
  return importSillyTavernCard({ jsonText: await file.text() });
}
