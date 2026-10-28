// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { CoreManuscripts } from "../../src/ui/home/CoreManuscripts";

describe("shared manuscript Story Bible UI", () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "core-bible-ui");
  const container = document.createElement("div");
  const root = createRoot(container);
  afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

  it("shows approved facts and saves a local card only after an explicit click", async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.append(container);
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.open = false; } });
    const entry = { workspaceId: "e05e9d93-e7a9-432a-82cd-8e47303f84c8", projectId: "book-one", title: "Night Keys", language: "English", translationGroupId: "family", revision: 2, updatedAt: "2026-10-27" };
    const fetcher = vi.fn(async (path: string) => Response.json(path.endsWith("/manuscripts") ? [entry] : {
      ...entry, manuscript: { title: "Night Keys", synopsis: "A mystery", chapters: [{ id: "one", title: "One", prose: "All prose" }],
        bible: [{ kind: "characters", label: "Characters", entities: [{ entity_ref: "emma", name: "Emma", personality: "Curious", looks: "Dark coat", referenceImages: [], facts: [{ predicate: "core.identity", label: "Identity", value: "Bartender" }] }] }] }
    }));
    vi.stubGlobal("fetch", fetcher);
    const click = async (label: string) => {
      const button = Array.from(container.querySelectorAll("button")).find(element => element.textContent?.includes(label));
      if (!button) throw new Error(`Missing ${label}`);
      await act(async () => { button.click(); });
    };
    await act(async () => { root.render(<CoreManuscripts repo={repo} />); });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await repo.listCharacters()).toEqual([]);
    await click("Find shared manuscripts");
    await click("Night Keys");
    expect(container.textContent).toContain("Bartender");
    expect(container.textContent).toContain("All prose");
    expect(await repo.listCharacters()).toEqual([]);
    const copyButton = Array.from(container.querySelectorAll("button")).find(element => element.textContent?.includes("Copy to Sandbox library"));
    if (!copyButton) throw new Error("Missing copy button");
    await act(async () => {
      copyButton.click();
      for (let i = 0; i < 30 && (await repo.listCharacters()).length === 0; i++) await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(container.textContent).toContain("was copied to your Sandbox character library");
    expect((await repo.listCharacters()).map(person => person.name)).toEqual(["Emma"]);
    await act(async () => { copyButton.click(); await new Promise(resolve => setTimeout(resolve, 30)); });
    expect((await repo.listCharacters()).length).toBe(1);
    const original = (await repo.listCharacters())[0]!;
    await repo.saveCharacter({ ...original, personality: "My local personality", coreSnapshot: { ...original.coreSnapshot!, personality: "Previously shared" } });
    await act(async () => { copyButton.click(); await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(container.textContent).toContain("You edited this locally");
    expect((await repo.listCharacters())[0]!.personality).toBe("My local personality");
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => { checkbox.click(); });
    await click("Apply selected updates");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    const saved = await repo.listCharacters();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.id).toBe(original.id);
    expect(saved[0]!.personality).toBe("Curious");
    expect(saved[0]!.coreSnapshot?.personality).toBe("Curious");
  });
});
