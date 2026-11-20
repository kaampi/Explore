// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";
import { IndexedDBRepository } from "../../persistence/IndexedDBRepository";
import { cutsceneExample } from "../../cutscenes/example";
import { PlayableStoryboard } from "../studio/PlayableStoryboard";
import { CutsceneLibraryProvider } from "./CutsceneLibrary";

it("creates placements from the scene and connection menus and saves a new library film", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const built = cutsceneExample();
  const initial = { ...built.campaign, cutscenes: [], cutsceneFilms: [] };
  let snapshot = built.campaign;
  const repo = new IndexedDBRepository(new IDBFactory(), "cutscene-board", 15);
  function Harness() {
    const [campaign, setCampaign] = useState(initial as typeof built.campaign);
    snapshot = campaign;
    return (
      <CutsceneLibraryProvider repo={repo}>
        <PlayableStoryboard
          campaign={campaign}
          places={built.places}
          characters={built.characters}
          objects={built.objects}
          busy={false}
          onChange={setCampaign}
          onPlay={() => {}}
        />
      </CutsceneLibraryProvider>
    );
  }
  const click = async (label: string, scope: ParentNode = document.body) => {
    const button = Array.from(scope.querySelectorAll<HTMLElement>('button,[role="menuitem"]')).find(
      (element) => element.textContent === label,
    );
    expect(button, label).toBeDefined();
    await act(async () => button?.click());
  };
  const context = async (node: Element) => {
    expect(node).toBeTruthy();
    await act(async () =>
      node.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
    );
    await click("Add cut-scene");
  };

  try {
    await act(async () => root.render(<Harness />));
    await context(host.querySelector(".storyboard-card[data-scene-id]")!);
    expect(snapshot.cutscenes[0]?.trigger).toEqual({
      kind: "scene",
      sceneId: initial.scenes[0]!.id,
      every: false,
    });
    await click("Create a film");
    const dialog = host.querySelector("dialog")!;
    const title = dialog.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        title,
        "A first film",
      );
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Save", dialog);
    for (let i = 0; i < 50 && host.querySelector("dialog"); i++)
      await act(async () => new Promise((resolve) => setTimeout(resolve, 4)));
    expect(host.querySelector("dialog")).toBeNull();
    const film = await repo.loadCutsceneFilm(snapshot.cutscenes[0]!.filmId);
    expect(film.title).toBe("A first film");
    await context(host.querySelector(".storyboard-lines [data-link-id]")!);
    expect(snapshot.cutscenes[1]?.trigger).toEqual({
      kind: "link",
      linkId: initial.sceneLinks[0]!.id,
    });
    expect(host.querySelectorAll(".storyboard-cutscene__line")).toHaveLength(2);
    await click("Arrange");
    expect(
      snapshot.cutscenes.every(
        ({ position }) => position && position.x % 20 === 0 && position.y % 20 === 0,
      ),
    ).toBe(true);
  } finally {
    await act(async () => root.unmount());
    await repo.close();
    host.remove();
  }
});
