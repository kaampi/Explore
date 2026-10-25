import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { createSessionFromSetup } from "@session/createSession";
import { loadExistingSession } from "../../src/ui/persistence";

function session(id: string, name = "Ari") {
  return createSessionFromSetup(
    {
      location: "Map room",
      lighting: "soft",
      noise: "quiet",
      music: false,
      placeNote: "",
      characters: [
        { name, personality: "Curious", position: "here", mood: "neutral" },
      ],
    },
    id,
  );
}
let factory: IDBFactory, repo: IndexedDBRepository;
beforeEach(() => {
  factory = new IDBFactory();
  repo = new IndexedDBRepository(factory, "conversation-tests");
});

describe("conversation library persistence", () => {
  it("deletes history, metadata and matching active/return pointers while retaining other conversations", async () => {
    await repo.createConversation(session("kept"));
    await repo.createConversation(session("deleted"));
    await repo.saveStudioResume({ conversationId: "deleted", campaignId: "world", sceneId: "scene", handoff: "Private conversation memory" });
    await repo.deleteSession("deleted");
    expect(await repo.listSessionIds()).toEqual(["kept"]);
    expect((await repo.listConversations()).entries.map(entry => entry.id)).toEqual(["kept"]);
    await expect(repo.loadSession("deleted")).rejects.toThrow();
    expect(await repo.loadActiveConversationId()).toBeNull();
    expect(await repo.loadStudioResume()).toBeNull();
    expect((await loadExistingSession(repo))?.id).toBe("kept");
    await repo.close();
  });
  it("deletes an archived history without clearing another conversation's active and return pointers", async () => {
    await repo.createConversation(session("archived"));
    await repo.archiveConversation("archived", true);
    await repo.createConversation(session("kept"));
    const resume = { conversationId: "kept", campaignId: "world", sceneId: "next" };
    await repo.saveStudioResume(resume);
    await repo.deleteSession("archived");
    expect(await repo.loadActiveConversationId()).toBe("kept");
    expect(await repo.loadStudioResume()).toEqual(resume);
    expect((await repo.listConversations()).entries.map(entry => entry.id)).toEqual(["kept"]);
    await repo.close();
  });
  it("rejects an invalid autosave without replacing the existing history or metadata", async () => {
    const original = session("first");
    await repo.createConversation(original);
    const invalid = {
      ...original,
      runtime: { ...original.runtime, temperature: "invalid" },
    } as unknown as typeof original;
    await expect(repo.saveSession(invalid)).rejects.toThrow(
      /schema validation/,
    );
    expect(await repo.loadSession("first")).toEqual(original);
    expect((await repo.listConversations()).entries[0]?.title).toBe(
      "Conversation with Ari",
    );
  });

  it("keeps history, relationships and story flags separate across conversations with the same character", async () => {
    const first = session("first"),
      second = session("second");
    first.conversation = [
      { turn: 1, role: "player", content: "I found a key." },
    ];
    first.storyFlags = ["key-found"];
    first.relationships.ari!.trust.value = 90;
    await repo.createConversation(first);
    await repo.createConversation(second);
    first.conversation.push({
      turn: 2,
      role: "character",
      content: "A second clue.",
    });
    await repo.saveSession(first);
    expect(await repo.loadSession("second")).toEqual(second);
    expect((await repo.loadSession("first")).storyFlags).toEqual(["key-found"]);
    const catalog = await repo.listConversations();
    expect(catalog.entries).toHaveLength(2);
    expect(catalog.entries.find((entry) => entry.id === "first")).toMatchObject(
      { preview: "A second clue.", messageCount: 2 },
    );
  });
  it("never overwrites an existing snapshot or active pointer when creation collides", async () => {
    await repo.createConversation(session("first"));
    await repo.createConversation(session("second"));
    await expect(
      repo.createConversation(session("first", "Someone else")),
    ).rejects.toThrow();
    expect((await repo.loadSession("first")).characters.ari?.name).toBe("Ari");
    expect(await repo.loadActiveConversationId()).toBe("second");
  });
  it("preserves custom names and archive status during later autosaves", async () => {
    const first = session("first");
    await repo.createConversation(first);
    await Promise.all([
      repo.renameConversation("first", "My own title"),
      repo.saveSession(first),
    ]);
    await repo.archiveConversation("first", true);
    await repo.saveSession(first);
    expect((await repo.listConversations()).entries[0]).toMatchObject({
      title: "My own title",
      archived: true,
    });
    expect(await repo.loadActiveConversationId()).toBeNull();
    expect(await repo.loadSession("first")).toEqual(first);
    await expect(repo.activateConversation("first")).rejects.toThrow(/Restore/);
    await repo.archiveConversation("first", false);
    await repo.activateConversation("first");
    expect(await repo.loadActiveConversationId()).toBe("first");
    expect((await repo.listConversations()).entries[0]).toMatchObject({
      title: "My own title",
      archived: false,
    });
  });
  it("indexes a v9 legacy conversation without rewriting it and retains unreadable snapshots", async () => {
    const original = session("demo-session");
    const old: IDBDatabase = await new Promise((resolve, reject) => {
      const request = factory.open("legacy", 9);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("sessions", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = old.transaction("sessions", "readwrite");
      tx.objectStore("sessions").put(original);
      tx.objectStore("sessions").put({ id: "unreadable", schemaVersion: 2 });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    old.close();
    const upgraded = new IndexedDBRepository(factory, "legacy");
    const catalog = await upgraded.listConversations();
    expect(catalog.entries.map((entry) => entry.id)).toEqual(["demo-session"]);
    expect(catalog.unreadable).toBe(1);
    expect((await upgraded.listSessionIds()).sort()).toEqual([
      "demo-session",
      "unreadable",
    ]);
    expect(await upgraded.loadSession("demo-session")).toEqual(original);
    expect((await loadExistingSession(upgraded))?.id).toBe("demo-session");
    await upgraded.close();
  });
  it("restores the last selected conversation, skips archived entries, and supports renaming validation", async () => {
    await repo.createConversation(session("first"));
    await repo.createConversation(session("second"));
    await repo.activateConversation("first");
    expect((await loadExistingSession(repo))?.id).toBe("first");
    await repo.archiveConversation("first", true);
    expect((await loadExistingSession(repo))?.id).toBe("second");
    await expect(repo.renameConversation("second", " ")).rejects.toThrow();
    await expect(
      repo.renameConversation("second", "x".repeat(121)),
    ).rejects.toThrow();
  });
});
