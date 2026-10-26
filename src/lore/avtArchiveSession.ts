import { createSessionFromSetup } from "../session/createSession";
import { parseSession, type Session } from "@state/StateSchema";
import type { AvtHistoryPreview } from "./avtHistoryPreview";

/**
 * A deliberately inert, archived transcript snapshot. Imported content is not
 * installed as story, voice, lore, world-state or instruction layers.
 * The caller must keep this out of active gameplay until an explicit
 * compatibility/memory review has been implemented.
 */
export function buildAvtArchiveSession(preview: AvtHistoryPreview): Session {
  if (!preview.lines.length) throw new Error("Cannot archive an empty transcript.");
  if (preview.lines.some(line => line.role === "other"))
    throw new Error("Unrecognized Aventuras message roles require manual review before archiving.");
  const session = createSessionFromSetup({
    location: "Imported Aventuras archive",
    lighting: "", noise: "", music: false, placeNote: "",
    characters: [{ name: "Imported narrator", personality: "", mood: "neutral", position: "here" }],
  }, preview.idPlan.storyId);
  return parseSession({
    ...session,
    conversation: preview.lines.map((line, turn) => ({
      turn,
      role: line.role === "user" ? "player" : "character",
      ...(line.role === "assistant" ? { speaker: "imported-narrator", toldBy: "narrator" } : {}),
      content: line.content,
    })),
    // Never convert arbitrary imported world-state or chapter summaries to trusted engine state.
    layers: [],
    story: undefined,
    voice: undefined,
    handoff: undefined,
    memory: { episodic: [], semantic: [], relational: [] },
  });
}
