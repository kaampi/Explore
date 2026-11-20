// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { IDBFactory } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import { CutsceneFilmSchema, CutscenePlacementSchema } from "../../cutscenes/schema";
import { newCampaignTemplate } from "../../library/LibrarySchema";
import { IndexedDBRepository } from "../../persistence/IndexedDBRepository";
import { ThemeProvider } from "../themes/ThemeProvider";
import { PRESET_THEMES } from "../themes/theme";
import { CutsceneStudio } from "./CutsceneStudio";
import { CutsceneLibrary } from "./CutsceneLibrary";

function setup() {
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
  function findButton(name: string, scope: ParentNode = host) {
    return Array.from(scope.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === name || b.textContent === name,
    );
  }
  async function click(name: string, scope: ParentNode = host) {
    const item = findButton(name, scope);
    expect(item, name).toBeDefined();
    await act(async () => item?.click());
  }
  function field(label: string) {
    const caption = Array.from(host.querySelectorAll("label")).find(
      (item) => item.querySelector("span")?.textContent === label,
    );
    const control = caption?.querySelector<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea");
    expect(control, label).toBeDefined();
    return control!;
  }
  async function input(label: string, value: string) {
    const control = field(label);
    await act(async () => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value")!.set!.call(
        control,
        value,
      );
      control.dispatchEvent(
        new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
      );
    });
  }
  async function action(item: string) {
    const menuitem = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).find((option) => option.textContent === item);
    expect(menuitem, item).toBeDefined();
    await act(async () => menuitem?.click());
  }
  async function close() {
    await act(async () => root.unmount());
    host.remove();
  }
  async function waitFor(done: () => boolean) {
    for (let i = 0; i < 50 && !done(); i++)
      await act(async () => new Promise((resolve) => setTimeout(resolve, 4)));
    expect(done()).toBe(true);
  }
  return { host, root, click, field, input, action, close, waitFor, findButton };
}

it("edits every channel, previews, reorders steps, and saves through the film API", async () => {
  const ui = setup();
  const saved = vi.fn();
  const closed = vi.fn();
  const film = CutsceneFilmSchema.parse({
    id: "dawn",
    title: "Dawn",
    beats: [{ id: "one" }],
    createdAt: "",
    updatedAt: "",
  });
  function Host() {
    const [value, setValue] = useState(film);
    return (
      <CutsceneStudio
        film={value}
        previewTheme={PRESET_THEMES[0]!}
        onClose={closed}
        onSave={(value) => {
          saved(value);
          setValue(value);
        }}
      />
    );
  }
  try {
    await act(async () => ui.root.render(<Host />));
    await ui.input("Title", "At dawn");
    await ui.input("Display", "fullscreen");
    await ui.input("Image", "clear");
    const firstImage = ui.findButton("Step 1, Image")!;
    await act(async () =>
      firstImage.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
    );
    expect(document.activeElement).toBe(ui.findButton("Step 1, Sound"));
    await ui.input("Action", "effect");
    await ui.input("Caption when sound is unavailable", "[A knock]");
    await ui.click("Step 1, Text");
    await ui.input("Text", "Dawn breaks.");
    await ui.input("Style", "whisper");
    await ui.click("Step 1, Advance");
    await ui.input("Advance", "after");
    await ui.click("Add step after selection");
    await ui.click("Step 2, Text");
    await ui.input("Text", "Someone arrives.");
    await ui.click("Step 2");
    await ui.action("Move left");
    expect(ui.findButton("Step 1, Text")?.textContent).toBe("Someone arrives.");
    await ui.click("Step 1");
    await ui.action("Duplicate");
    expect(ui.findButton("Step 3, Text")?.textContent).toBe("Dawn breaks.");
    await ui.click("Step 2");
    await ui.action("Delete");
    expect(ui.findButton("Step 3, Text")).toBeUndefined();
    await ui.click("Undo");
    expect(ui.findButton("Step 3, Text")).toBeDefined();
    await ui.click("Redo");
    expect(ui.findButton("Step 3, Text")).toBeUndefined();
    await ui.click("Play from the start");
    expect(ui.host.querySelector(".cutscene-reel")).toBeTruthy();
    await ui.click("Stop preview");
    expect(saved).not.toHaveBeenCalled();
    await ui.click("Close");
    expect(ui.host.querySelector("dialog")?.textContent).toContain("unsaved changes");
    await ui.click("Cancel", ui.host.querySelector("dialog")!);
    expect(closed).not.toHaveBeenCalled();
    await ui.click("Save");
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.lastCall?.[0]).toMatchObject({
      title: "At dawn",
      display: "fullscreen",
      beats: [
        { text: { text: "Someone arrives." } },
        {
          text: { text: "Dawn breaks.", style: "whisper" },
          image: { source: { kind: "clear" } },
          sound: { action: "effect", caption: "[A knock]" },
          advance: { kind: "after", seconds: 3 },
        },
      ],
    });
    await ui.click("Close");
    expect(closed).toHaveBeenCalledOnce();
  } finally {
    await ui.close();
  }
});

it("creates, duplicates, renames and deletes library films with a usage warning", async () => {
  const ui = setup();
  const repo = new IndexedDBRepository(new IDBFactory(), "film-library", 15);
  try {
    await act(async () =>
      ui.root.render(
        <ThemeProvider>
          <CutsceneLibrary repo={repo} onDirtyChange={() => {}} />
        </ThemeProvider>,
      ),
    );
    await ui.click("+ New film");
    await ui.input("Title", "At the house");
    await ui.click("Save");
    await ui.waitFor(() => ui.host.querySelector(".ui-row__name")?.textContent === "At the house");
    const [film] = await repo.listCutsceneFilms();
    await repo.saveCampaign(
      newCampaignTemplate({
        name: "A short adventure",
        cutscenes: [
          CutscenePlacementSchema.parse({
            id: "intro",
            filmId: film!.id,
            trigger: { kind: "scene", sceneId: "start" },
          }),
        ],
      }),
    );
    const menu = () => ui.host.querySelector<HTMLElement>(".ui-row__menu")!;
    await act(async () => menu().click());
    await ui.action("Duplicate");
    await ui.waitFor(() => ui.host.textContent?.includes("Copy of At the house") ?? false);
    const original = Array.from(ui.host.querySelectorAll(".ui-row")).find(
      (row) => row.querySelector(".ui-row__name")?.textContent === "At the house",
    )!;
    await act(async () => original.querySelector<HTMLElement>(".ui-row__menu")?.click());
    await ui.action("Rename");
    const dialog = ui.host.querySelector("dialog")!;
    const name = dialog.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        name,
        "The house",
      );
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await ui.click("Save", dialog);
    await ui.waitFor(() =>
      Array.from(ui.host.querySelectorAll(".ui-row__name")).some(
        (row) => row.textContent === "The house",
      ),
    );
    await act(async () => original.querySelector<HTMLElement>(".ui-row__menu")?.click());
    await ui.action("Delete");
    await ui.waitFor(() =>
      /A short adventure/.test(ui.host.querySelector("dialog")?.textContent ?? ""),
    );
    await ui.click("Delete", ui.host.querySelector("dialog")!);
    await ui.waitFor(() => !ui.host.querySelector("dialog"));
    expect((await repo.listCutsceneFilms()).map(({ title }) => title)).toEqual([
      "Copy of At the house",
    ]);
  } finally {
    await ui.close();
    await repo.close();
  }
});
