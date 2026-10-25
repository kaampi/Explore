import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { createSessionFromSetup } from "@session/createSession";
import { captureIdea, IdeaSchema } from "../../src/ideas/IdeaSchema";
import { exportIdeas } from "../../src/ideas/storybookExport";
function scene() {
    const session = createSessionFromSetup({ location: "Garden", lighting: "soft", noise: "quiet", music: false, placeNote: "", characters: [{ name: "Ari", personality: "Curious", mood: "neutral", position: "here" }] }, "source");
    session.conversation = [{ turn: 0, role: "player", content: "What if the gate opens?" }, { turn: 1, role: "character", speaker: Object.keys(session.characters)[0], content: "Only at dawn." }, { turn: 2, role: "player", content: "Unselected private message" }];
    return session;
}
describe("saved ideas", () => {
    it("snapshots only chosen messages in conversation order, without mutating the source", () => {
        const session = scene();
        const before = structuredClone(session);
        const idea = captureIdea(session, [1, 0, 1], "A garden visit");
        expect(idea.source.excerpts.map(e => e.turn)).toEqual([0, 1]);
        expect(idea.source.excerpts.map(e => e.speaker)).toEqual(["You", "Ari"]);
        expect(idea.description).toContain("Only at dawn.");
        expect(idea.description).not.toContain("Unselected");
        session.conversation = [];
        expect(idea.source.excerpts).toHaveLength(2);
        expect(before.characters).toEqual(session.characters);
        expect(() => captureIdea(session, [1], "Visit")).toThrow(/Select at least/);
    });
    it("persists edits across reload and retains sources after deleting the conversation", async () => {
        const factory = new IDBFactory();
        const repo = new IndexedDBRepository(factory, "idea-roundtrip");
        const session = scene();
        await repo.createConversation(session);
        const idea = captureIdea(session, [0, 1], "A visit");
        await repo.saveIdea(idea);
        const edited = { ...idea, title: "Dawn gate", kind: "world" as const, description: "A gate that opens at dawn." };
        await repo.saveIdea(edited);
        await repo.archiveConversation(session.id, true);
        await repo.deleteSession(session.id);
        await repo.close();
        const reopened = new IndexedDBRepository(factory, "idea-roundtrip");
        expect((await reopened.listIdeas()).entries).toEqual([edited]);
        await expect(reopened.saveIdea({ ...edited, title: " " })).rejects.toThrow();
        expect((await reopened.listIdeas()).entries).toEqual([edited]);
        await reopened.close();
    });
    it("upgrades v10 in place and preserves unreadable ideas", async () => {
        const factory = new IDBFactory();
        const old = await new Promise<IDBDatabase>((resolve, reject) => {
            const req = factory.open("idea-upgrade", 10);
            req.onupgradeneeded = () => { req.result.createObjectStore("sessions", { keyPath: "id" }); };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        await new Promise<void>((resolve, reject) => { const tx = old.transaction("sessions", "readwrite"); tx.objectStore("sessions").put(scene()); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
        old.close();
        const repo = new IndexedDBRepository(factory, "idea-upgrade");
        const idea = captureIdea(scene(), [0], "Old conversation");
        await repo.saveIdea(idea);
        expect((await repo.loadSession("source")).conversation).toHaveLength(3);
        await repo.close();
        const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = factory.open("idea-upgrade", 11); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
        await new Promise<void>((resolve, reject) => { const tx = db.transaction("ideas", "readwrite"); tx.objectStore("ideas").put({ id: "damaged", title: 7 }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
        db.close();
        const result = await repo.listIdeas();
        expect(result.entries).toEqual([idea]);
        expect(result.unreadable).toBe(1);
        expect((await repo.listIdeas()).unreadable).toBe(1);
        await repo.close();
    });
    it("exports a fresh Brainstorm notebook with no story facts or unselected messages", () => {
        const session = scene();
        const idea = captureIdea(session, [0, 1], "Garden");
        idea.description = "The gate might open at dawn. Åäö.";
        const exported = exportIdeas([idea]);
        expect(exported.kind).toBe("storybook-ai.manuscript");
        expect(exported.format).toBe(2);
        expect(exported.book.brainstorm_notes).toHaveLength(1);
        expect(exported.book.brainstorm_notes[0]?.text).toContain(idea.description);
        expect(exported.book.facts).toEqual([]);
        expect(exported.book.chapters).toEqual([]);
        expect(exported.book.synopsis).toBe("");
        expect(exported.book.id).not.toBe(exportIdeas([idea]).book.id);
        expect(JSON.stringify(exported)).not.toContain("Unselected private message");
        expect(exported.sandboxIdeas.ideas[0]?.source.excerpts).toHaveLength(2);
        expect(IdeaSchema.parse(exported.sandboxIdeas.ideas[0])).toEqual(idea);
        expect(() => exportIdeas([])).toThrow(/Choose at least/);
    });
});
