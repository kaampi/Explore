import {
  IndexedDBRepository,
  SessionNotFoundError,
} from "@persistence/IndexedDBRepository";
import type { Session } from "@state/StateSchema";

/** Legacy ID remains readable. Every newly created conversation gets a unique ID. */
export const UI_SESSION_ID = "demo-session";
export function getRepository(): IndexedDBRepository {
  return new IndexedDBRepository();
}
export async function loadExistingSession(
  repo: IndexedDBRepository,
): Promise<Session | null> {
  const catalog = await repo.listConversations();
  const active = await repo.loadActiveConversationId();
  const entries = catalog.entries.filter((entry) => !entry.archived);
  const ids = [
    ...new Set([active, UI_SESSION_ID, ...entries.map((entry) => entry.id)]),
  ].filter(
    (id): id is string => !!id && entries.some((entry) => entry.id === id),
  );
  for (const id of ids) {
    try {
      return await repo.loadSession(id);
    } catch (err) {
      if (!(err instanceof SessionNotFoundError))
        console.warn("Could not read a saved conversation:", err);
    }
  }
  return null;
}
