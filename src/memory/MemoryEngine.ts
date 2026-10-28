import type { Session, MemoryEntry, MemoryType } from "@state/StateSchema";
import { PRIORITY, type ContextBlock } from "@context/ContextBlock";
import { isCondensationContent, listCondensationRecaps } from "./condensationMarker";

/**
 * Memory Engine — Master Spec §16-19.
 * Structured storage (episodic/semantic/relational) lives in the
 * canonical Session schema and is written through
 * StateEngine.addMemoryEntry(). This module handles retrieval and
 * ranking: deciding which memories are worth including in a given
 * turn's context, out of everything that's accumulated.
 */

export interface RankedMemory {
  type: MemoryType;
  entry: MemoryEntry;
  score: number;
}

/**
 * Recency decay: a memory's relevance halves roughly every DECAY_TURNS
 * turns since it was created. Combined multiplicatively with importance
 * (0-1) so a highly important old memory can still outrank a trivial
 * recent one, but all else equal, recent wins.
 */
const DECAY_HALF_LIFE_TURNS = 20;

function recencyWeight(ageInTurns: number): number {
  return Math.pow(0.5, ageInTurns / DECAY_HALF_LIFE_TURNS);
}

function scoreMemory(entry: MemoryEntry, currentTurn: number): number {
  const age = Math.max(0, currentTurn - entry.createdAtTurn);
  return entry.importance * recencyWeight(age);
}

/**
 * kaampi Explore continuity retrieval. The current scene is always relevant,
 * while the last three player messages fade by age. This avoids sudden
 * topic loss at scene boundaries without pinning stale history forever.
 * It is a deterministic relevance hint, never an instruction source.
 */
const COMMON_WORDS = new Set(["the", "and", "was", "were", "with", "for", "from", "that", "this", "are", "you", "your", "have", "has", "had", "they", "them", "their", "there", "where", "what", "when", "who", "why", "how", "let", "lets", "our", "all", "not", "but", "och", "att", "det", "den", "som", "med", "för", "har", "var", "jag", "mig", "du", "han", "hon", "vid", "här", "där", "till", "från", "inte", "ska", "kan", "ett", "en", "på"]);
function terms(text: string): Set<string> {
  return new Set((text.toLocaleLowerCase().match(/[\\p{L}\\p{N}]{3,}/gu) ?? []).filter(word => !COMMON_WORDS.has(word)).slice(0, 100));
}

function sceneQuery(session: Session): Map<string, number> {
  const query = new Map<string, number>();
  const add = (text: string, weight: number) => {
    for (const word of terms(text)) query.set(word, Math.max(query.get(word) ?? 0, weight));
  };
  add(session.scene?.location ?? "", 1);
  let seen = 0;
  for (let i = session.conversation.length - 1; i >= 0 && seen < 3; i--) {
    const value = session.conversation[i];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    if (row.role !== "player" || typeof row.content !== "string") continue;
    add(row.content.slice(0, 1200), [1, 0.6, 0.3][seen] ?? 0);
    seen++;
  }
  const known = new Map(Object.entries(session.characters).map(([id, character]) => [id, character.name ?? ""]));
  let distance = 0;
  for (let i = session.conversation.length - 1; i >= 0 && distance < 8; i--) {
    const value = session.conversation[i];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    if (row.role !== "character" || typeof row.speaker !== "string") continue;
    const name = known.get(row.speaker);
    if (name) add(name, Math.max(0.15, 0.7 - distance * 0.08));
    distance++;
  }
  return query;
}

function relevanceBonus(entry: MemoryEntry, query: Map<string, number>): number {
  if (!query.size) return 0;
  const words = terms(entry.content.slice(0, 3000));
  let overlap = 0;
  for (const word of words) overlap += query.get(word) ?? 0;
  return Math.min(0.3, overlap * 0.075);
}

export function rankMemories(session: Session, currentTurn: number, limit: number): RankedMemory[] {
  const query = sceneQuery(session);
  const all: RankedMemory[] = (["episodic", "semantic", "relational"] as MemoryType[]).flatMap((type) =>
    session.memory[type].map((entry) => ({ type, entry, score: scoreMemory(entry, currentTurn) + relevanceBonus(entry, query) }))
  );

  return all.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function buildCondensedHistoryBlock(session: Session): ContextBlock | null {
  const recaps = listCondensationRecaps(session);
  if (recaps.length === 0) return null;

  const body = recaps
    .map((row) => `Turns ${row.start}–${row.end}: ${row.summary}`)
    .join("\n");

  return {
    id: "condensed-history",
    source: "memory",
    content: [
      "Earlier in this scene (condensed; these beats are no longer in the live chat). State and standing notes win if this disagrees. Do not upgrade affection into a vow or a life-long commitment.",
      body
    ].join("\n"),
    priority: PRIORITY.CONDENSED_HISTORY,
    required: false
  };
}

export function buildMemoryBlocks(session: Session, currentTurn: number, limit: number): ContextBlock[] {
  const recap = buildCondensedHistoryBlock(session);
  const ranked = rankMemories(session, currentTurn, limit).filter(
    (row) => !isCondensationContent(row.entry.content)
  );
  const rankedBlocks = ranked.map((rankedMemory, index) => ({
    id: `memory-${rankedMemory.entry.id}`,
    source: "memory" as const,
    content: `[${rankedMemory.type}] ${rankedMemory.entry.content}`,
    // Highest-ranked memory gets the lowest (best) priority number, so
    // it's the last one dropped if the budget gets tight.
    priority: PRIORITY.MEMORY + index,
    required: false
  }));
  return recap ? [recap, ...rankedBlocks] : rankedBlocks;
}
