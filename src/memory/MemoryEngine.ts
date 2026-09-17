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
 * Ranks all memories (across all three categories) by score, descending,
 * and returns the top `limit`. Scene/topic relevance (matching memory
 * content against the current scene) is a natural next refinement but
 * requires some notion of semantic similarity this engine doesn't have
 * yet — importance + recency is the honest baseline for now.
 */
export function rankMemories(session: Session, currentTurn: number, limit: number): RankedMemory[] {
  const all: RankedMemory[] = (["episodic", "semantic", "relational"] as MemoryType[]).flatMap((type) =>
    session.memory[type].map((entry) => ({ type, entry, score: scoreMemory(entry, currentTurn) }))
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
