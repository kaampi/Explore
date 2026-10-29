// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { IdeaLibrary } from "../../src/ui/ideas/IdeaLibrary";
import { exportIdeas } from "../../src/ideas/storybookExport";

it("creates a manual idea without a conversation and preserves it for export and reload", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() {} });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() {} });
  const repo = new IndexedDBRepository(new IDBFactory(), "manual-ideas");
  const container = document.createElement("div");
  const root = createRoot(container);
  const button = (text: string) => Array.from(container.querySelectorAll("button")).find(b => b.textContent?.trim() === text)!;
  try {
    await act(async () => root.render(<IdeaLibrary repo={repo} conversations={[]} onOpen={() => {}} />));
    await act(async () => button("Add idea").click());
    for (const [selector, value, proto] of [
      ["input[required]", "A secret island", HTMLInputElement.prototype],
      ["textarea", "An island appears only at midnight.", HTMLTextAreaElement.prototype]
    ] as const) {
      await act(async () => {
        const element = container.querySelector(selector)!;
        Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    // IndexedDB completes asynchronously outside the submit event.
    for (let i = 0; i < 100 && !container.querySelector(".sb-idea-card"); i++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    }
    expect(container.querySelector(".sb-idea-card")?.textContent).toContain("A secret island");
    const { entries } = await repo.listIdeas();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.origin).toBe("manual");
    expect(entries[0]?.source.excerpts).toEqual([]);
    expect(exportIdeas(entries).sandboxIdeas.ideas[0]?.description).toBe("An island appears only at midnight.");
  } finally {
    await act(async () => root.unmount());
  }
});
