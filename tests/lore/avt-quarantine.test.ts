import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { previewAvtHistory } from "../../src/lore/avtHistoryPreview";
import { buildAvtArchiveSession } from "../../src/lore/avtArchiveSession";

describe("AVT quarantine persistence", () => {
  it("saves a separate archived transcript without activating it or allowing restore", async () => {
    const repo = new IndexedDBRepository(new IDBFactory(), "avt-quarantine-test");
    const preview = previewAvtHistory({
      version: "1.11.0", story: { id: "old-story", title: "Imported journey" },
      entries: [{ id: "old-turn", type: "user", content: "Hi there" }],
    });
    const session = buildAvtArchiveSession(preview);
    await repo.createArchivedConversation(session);
    const saved = (await repo.listConversations()).entries.find(e => e.id === session.id);
    expect(saved).toMatchObject({ archived: true, importQuarantined: true, messageCount: 1 });
    expect(await repo.loadActiveConversationId()).toBeNull();
    await expect(repo.archiveConversation(session.id, false)).rejects.toThrow(/cannot be restored/);
    expect((await repo.listConversations()).entries.find(e => e.id === session.id)?.archived).toBe(true);
    await expect(repo.createArchivedConversation(session)).rejects.toThrow();
    await repo.close();
  });
});
