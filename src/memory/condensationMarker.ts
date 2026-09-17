import type { Session } from "@state/StateSchema";

/** Prefix written by Rolling Memory so the same turns are never condensed twice. */
export const CONDENSED_RANGE_PATTERN = /^\[condensed turns (\d+)-(\d+)\]\s*/;

export function isCondensationContent(content: string): boolean {
  return CONDENSED_RANGE_PATTERN.test(content);
}

export function parseCondensationRange(
  content: string
): { start: number; end: number; summary: string } | null {
  const match = content.match(CONDENSED_RANGE_PATTERN);
  if (!match?.[1] || !match[2]) return null;
  return {
    start: Number(match[1]),
    end: Number(match[2]),
    summary: content.slice(match[0].length).trim()
  };
}

/**
 * Highest turn number already covered by a condensation recap.
 * Turns at or below this leave the live chat window.
 */
export function getHighestCondensedTurnEnd(session: Session): number {
  let highest = 0;
  for (const entry of session.memory.episodic) {
    const parsed = parseCondensationRange(entry.content);
    if (parsed) highest = Math.max(highest, parsed.end);
  }
  return highest;
}

export function listCondensationRecaps(
  session: Session
): { start: number; end: number; summary: string }[] {
  return session.memory.episodic
    .map((entry) => parseCondensationRange(entry.content))
    .filter((row): row is { start: number; end: number; summary: string } => row !== null)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

export function formatCondensationEntry(startTurn: number, endTurn: number, summary: string): string {
  return `[condensed turns ${startTurn}-${endTurn}] ${summary}`;
}
