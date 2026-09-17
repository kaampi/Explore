import type { Session } from "@state/StateSchema";

/**
 * Keyword gate for layers: approved lore that only enters context when
 * recent chat mentions it. Not SillyTavern World Info (no probability,
 * sticky, recursion, or regex keys).
 */

export const KEYWORD_SCAN_TURNS = 8;

export function parseKeywordList(raw: string): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const part of raw.split(/[,;]/)) {
    const keyword = part.trim();
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(keyword);
  }
  return keywords;
}

export function formatKeywordList(keywords: string[]): string {
  return keywords.join(", ");
}

export function layerHasKeywordGate(layer: { keywords?: string[] | undefined }): boolean {
  return (layer.keywords?.length ?? 0) > 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive. Phrases are substrings; single tokens are whole words. */
export function keywordHitsText(text: string, keywords: string[]): boolean {
  if (!text || keywords.length === 0) return false;
  const hay = text.toLowerCase();
  for (const raw of keywords) {
    const keyword = raw.trim();
    if (!keyword) continue;
    if (/\s/.test(keyword)) {
      if (hay.includes(keyword.toLowerCase())) return true;
      continue;
    }
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(keyword)}(?![\\p{L}\\p{N}_])`, "iu");
    if (pattern.test(text)) return true;
  }
  return false;
}

export function conversationKeywordHaystack(conversation: unknown[], maxTurns = KEYWORD_SCAN_TURNS): string {
  const turns: Array<{ turn: number; content: string }> = [];
  for (const entry of conversation) {
    if (entry === null || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.content !== "string" || record.content.trim() === "") continue;
    turns.push({ turn: Number(record.turn) || 0, content: record.content });
  }
  turns.sort((a, b) => a.turn - b.turn);
  return turns.slice(-maxTurns).map((entry) => entry.content).join("\n");
}

export function keywordsMatchConversation(
  conversation: unknown[],
  keywords: string[],
  maxTurns = KEYWORD_SCAN_TURNS
): boolean {
  return keywordHitsText(conversationKeywordHaystack(conversation, maxTurns), keywords);
}

/** Chat ever, or something in someone's hands — not the last-8 wake window. */
export function tokenKnownInPlay(
  session: Pick<Session, "conversation" | "characters">,
  keywords: string[]
): boolean {
  if (keywords.length === 0) return true;
  if (keywordsMatchConversation(session.conversation, keywords, Number.MAX_SAFE_INTEGER)) return true;
  for (const character of Object.values(session.characters)) {
    if (keywordHitsText(character.holding?.value ?? "", keywords)) return true;
  }
  return false;
}
