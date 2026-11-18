// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { newRealmTemplate } from "../../src/library/LibrarySchema";
import { MapLibrary } from "../../src/ui/studio/MapLibrary";

it("lets the author turn on invented residents in World Maps and keeps it on the world", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const repo = new IndexedDBRepository(new IDBFactory(), "world-residents-setting");
  const world = newRealmTemplate({
    name: "Dunbaar",
    note: "",
    source: "player",
    worldMap: { nodes: [], routes: [], mapType: "world" },
  });
  await repo.saveRealm(world);
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  const settle = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  };
  const click = async (text: string) => {
    const button = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(text),
    );
    expect(button).toBeTruthy();
    await act(async () => button!.click());
    await settle();
  };
  const box = () =>
    Array.from(el.querySelectorAll("label"))
      .find((label) => label.textContent?.includes("invent residents"))
      ?.querySelector("input") as HTMLInputElement;
  try {
    await act(async () => root.render(<MapLibrary repo={repo} />));
    await settle();
    await click("Open Map Studio");
    expect(box()).toBeTruthy();
    expect(box().checked).toBe(false);
    await act(async () => box().click());
    expect(box().checked).toBe(true);
    await click("Save map");
    expect((await repo.loadRealm(world.id)).openWorld).toEqual({ generateResidents: true });
    expect((await repo.loadRealm(world.id)).worldMap).toBeTruthy();

    await act(async () => box().click());
    await click("Save map");
    expect((await repo.loadRealm(world.id)).openWorld).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    el.remove();
  }
});
