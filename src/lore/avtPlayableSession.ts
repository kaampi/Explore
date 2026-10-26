import { createSessionFromSetup, type CharacterDraft } from "../session/createSession";
import { parseSession, type Session } from "@state/StateSchema";
import type { AvtMigrationReview } from "./avtMigrationReview";

export type AvtSelection = { kind: "character" | "location" | "item"; sourceId: string };

/**
 * Creates a fresh, isolated Sandbox session using only explicitly approved
 * display identities. Source descriptions, historical messages, chapters and
 * world-state never become trusted instructions or active memories.
 */
export function buildAvtPlayableSession(
  review: AvtMigrationReview,
  selected: readonly AvtSelection[],
  sessionId: string,
): Session {
  if (!sessionId.trim()) throw new Error("A new session ID is required.");
  if (!selected.length) throw new Error("Select at least one reviewed entity.");
  const keys = new Set<string>();
  const chosen = selected.map(item => {
    const key = `${item.kind}:\0${item.sourceId}`;
    if (keys.has(key)) throw new Error("Duplicate entity selection.");
    keys.add(key);
    const candidate = review.candidates.find(c => c.kind === item.kind && c.sourceId === item.sourceId);
    if (!candidate || !candidate.eligible || !candidate.name.trim())
      throw new Error("Selection contains an unapproved or unknown source entity.");
    return candidate;
  });
  const characters: CharacterDraft[] = chosen.filter(c => c.kind === "character").map(c => ({
    name: c.name,
    personality: "",
    mood: "neutral",
    position: "here",
  }));
  const location = chosen.find(c => c.kind === "location")?.name ?? "Imported world";
  const objects = chosen.filter(c => c.kind === "item").map((c, index) => ({
    id: `imported-item-${index + 1}`,
    name: c.name,
    note: "",
    tags: [],
  }));
  const session = createSessionFromSetup({
    location, lighting: "", noise: "", music: false, placeNote: "",
    characters,
    objects,
  }, sessionId);
  return parseSession({
    ...session,
    layers: [],
    conversation: [],
    memory: { episodic: [], semantic: [], relational: [] },
    story: undefined,
    voice: undefined,
    events: [],
    snapshots: [],
    diagnostics: [],
  });
}
