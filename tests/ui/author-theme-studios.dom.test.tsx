// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WorldMapStudio } from "../../src/ui/studio/WorldMapStudio";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import { ThemeProvider, useAppearance } from "../../src/ui/themes/ThemeProvider";
import { PRESET_THEMES } from "../../src/ui/themes/theme";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { newRealmTemplate } from "../../src/library/LibrarySchema";
import { settlementPiece } from "../../src/library/settlement";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
afterEach(() => {
  document.body.innerHTML = "";
});
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
const pick = async (select: HTMLSelectElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });

async function worldStudio(theme?: (typeof PRESET_THEMES)[number]) {
  const repo = new IndexedDBRepository(new IDBFactory(), "world-theme-" + Math.random());
  const town = {
    ...settlementPiece("settlement", "", 50, 50),
    id: "town",
    placeId: "town-place",
    name: "Willowbrook",
  };
  const world = newRealmTemplate({
    name: "Theme world",
    note: "",
    source: "player",
    worldMap: { mapType: "world", nodes: [town], routes: [] },
    ...(theme ? { theme } : {}),
  });
  await repo.saveRealm(world);
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    createRoot(host).render(
      <LanguageProvider>
        <WorldMapStudio repo={repo} initialWorldId={world.id} />
      </LanguageProvider>,
    ),
  );
  await flush();
  const select = () =>
    host.querySelector<HTMLSelectElement>(
      '.world-map__settings select[aria-label="Look when it is played"]',
    )!;
  return { repo, world, host, select };
}

it("has a choice of look in the settings of a world, and saves it with the world", async () => {
  const { repo, world, host, select } = await worldStudio();
  expect(select().value).toBe("");
  expect(host.querySelector(".world-map__settings .author-theme__hint")!.textContent).toContain(
    "adventures in this world that have no look of their own",
  );

  await pick(select(), "fantasy");
  const save = Array.from(host.querySelectorAll("button")).find((b) =>
    b.textContent?.startsWith("Save map"),
  )!;
  await act(async () => save.click());
  await flush();
  expect((await repo.loadRealm(world.id)).theme).toEqual(
    PRESET_THEMES.find((t) => t.id === "fantasy"),
  );
});

it("shows the look a world has, and takes it away again when none is chosen", async () => {
  const fantasy = PRESET_THEMES.find((t) => t.id === "fantasy")!;
  const { repo, world, host, select } = await worldStudio(fantasy);
  expect(select().value).toBe("fantasy");

  await pick(select(), "");
  const save = Array.from(host.querySelectorAll("button")).find((b) =>
    b.textContent?.startsWith("Save map"),
  )!;
  await act(async () => save.click());
  await flush();
  expect((await repo.loadRealm(world.id)).theme).toBeUndefined();
});

function Probe({ id, theme }: { id: string; theme?: (typeof PRESET_THEMES)[number] }) {
  const { library, activateConversation, update } = useAppearance();
  return (
    <>
      <p id="active">{library.active.id}</p>
      <button id="open" onClick={() => activateConversation(id, theme)} />
      <button id="leave" onClick={() => activateConversation(null)} />
      <button id="change" onClick={() => update({ id: "players-own", name: "Mine" })} />
    </>
  );
}

it("gives a game its author's look the first time and keeps what the player changes after that", async () => {
  const fantasy = PRESET_THEMES.find((t) => t.id === "fantasy")!;
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    createRoot(host).render(
      <ThemeProvider>
        <Probe id="game-1" theme={fantasy} />
      </ThemeProvider>,
    ),
  );
  await flush();
  const active = () => host.querySelector("#active")!.textContent;
  const press = (id: string) =>
    act(async () => host.querySelector<HTMLButtonElement>(`#${id}`)!.click());
  const player = active();
  expect(player).not.toBe("fantasy");

  await press("open");
  expect(active()).toBe("fantasy");
  await press("change");
  expect(active()).toBe("players-own");
  await press("leave");
  expect(active()).toBe(player);
  await press("open");
  // The player's own change for this game is what comes back, not the author's look again.
  expect(active()).toBe("players-own");
});
