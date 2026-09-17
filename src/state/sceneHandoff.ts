import { ConversationTurnSchema, type Session } from "./StateSchema";

export const HANDOFF_MAX = 800;

export function clipHandoff(text: string): string {
  const clipped = text.trim().replace(/\s+/g, " ");
  if (clipped.length <= HANDOFF_MAX) return clipped;
  return clipped.slice(0, HANDOFF_MAX).trim();
}

function lastPlayerLine(session: Session): string {
  for (let i = session.conversation.length - 1; i >= 0; i--) {
    const parsed = ConversationTurnSchema.safeParse(session.conversation[i]);
    if (!parsed.success || parsed.data.role !== "player") continue;
    const line = parsed.data.content.trim().replace(/\s+/g, " ");
    if (line) return line.length > 280 ? `${line.slice(0, 277).trim()}…` : line;
  }
  return "";
}

/**
 * What survives "new scene": the agreement, not the bar transcript.
 * A filled field wins. Otherwise seed from the last player line so you can edit.
 */
export function draftSceneHandoff(session: Session): string {
  const written = clipHandoff(session.outgoingHandoff ?? "");
  if (written) return written;
  const place = session.scene?.location.trim() || "the last place";
  const said = lastPlayerLine(session);
  if (said) return clipHandoff(`Left ${place}. They said: ${said}`);
  return clipHandoff(`Left ${place}.`);
}
