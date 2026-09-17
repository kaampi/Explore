import { IndexedDBRepository, SessionNotFoundError } from "@persistence/IndexedDBRepository";
import type { Session } from "@state/StateSchema";

/**
 * UI-layer persistence wiring. One fixed session id for this
 * single-session UI — a session picker is out of scope for this pass.
 */

export const UI_SESSION_ID = "demo-session";

export function getRepository(): IndexedDBRepository {
  return new IndexedDBRepository();
}

/**
 * Loads the persisted session if one exists. Missing or unreadable
 * records return null so the UI can show the studio instead of
 * inventing a demo character.
 */
export async function loadExistingSession(repo: IndexedDBRepository): Promise<Session | null> {
  try {
    return await repo.loadSession(UI_SESSION_ID);
  } catch (err) {
    if (!(err instanceof SessionNotFoundError)) {
      console.warn("Failed to load persisted session, opening studio:", err);
    }
    return null;
  }
}

export async function resetSession(repo: IndexedDBRepository): Promise<void> {
  await repo.deleteSession(UI_SESSION_ID).catch(() => {
    // Nothing to delete, or delete failed — either way, reloading will
    // fall through to the studio.
  });
}
