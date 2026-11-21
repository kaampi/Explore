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
  function field(label: string, scope: ParentNode = host) {
    const caption = Array.from(scope.querySelectorAll("label")).find(
      (item) => item.querySelector("span")?.textContent === label,
    );
    const control = caption?.querySelector<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea");
    expect(control, label).toBeDefined();
    return control!;
  }
  async function input(label: string, value: string, scope: ParentNode = host) {
    const control = field(label, scope);
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
  async function file(item: string) {
    await click("File");
    await action(item);
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
  function dialog() {
    return host.querySelector<HTMLDialogElement>("dialog[open]")!;
  }
  const closeDialog = () => click("Close dialog", dialog());
  return {
    host,
    root,
    click,
    field,
    input,
    action,
    file,
    close,
    waitFor,
    findButton,
    dialog,
    closeDialog,
  };
}

it("edits every channel, previews, reorders steps, and saves through the film API", async () => {
  const ui = setup();
  const saved = vi.fn();
  const closed = vi.fn();
  const film = CutsceneFilmSchema.parse({
    id: "dawn",
    title: "Dawn",
    beats: [{ id: "one" }],
    images: [{ id: "door", dataUrl: "example", thumbDataUrl: "example" }],
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
    await ui.click("Settings");
    await ui.input("Title", "At dawn");
    await ui.input("Display", "fullscreen");
    await ui.click("Close dialog", ui.host.querySelector("dialog")!);
    for (const channel of ["Image", "Sound", "Text"]) {
      expect(ui.findButton(`${channel} effects`)?.disabled).toBe(true);
      expect(ui.findButton(`${channel} timing`)?.disabled).toBe(true);
    }
    await ui.click("Step 1, Image");
    expect(ui.dialog().getAttribute("aria-label")).toBe("Image");
    const uploadImage = ui.field("Upload image", ui.dialog());
    expect(uploadImage.getAttribute("type")).toBe("file");
    await ui.input("Image", "asset:door", ui.dialog());
    await ui.closeDialog();
    expect(ui.findButton("Image timing")?.disabled).toBe(false);
    await ui.click("Image effects");
    await ui.input("Motion while displayed", "pan-left", ui.dialog());
    expect(ui.field("Duration (s)", ui.dialog()).value).toBe("12");
    await ui.input("Duration (s)", "3", ui.dialog());
    await ui.input("Image filter", "warm", ui.dialog());
    await ui.closeDialog();
    const firstImage = ui.findButton("Step 1, Image")!;
    await act(async () =>
      firstImage.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
    );
    expect(document.activeElement).toBe(ui.findButton("Step 1, Sound"));
    await ui.click("Step 1, Sound");
    const uploadAudio = ui.field("Upload audio", ui.dialog()) as HTMLInputElement;
    Object.defineProperty(uploadAudio, "files", {
      value: [new File(["tone"], "knock.wav", { type: "audio/wav" })],
    });
    await act(async () => uploadAudio.dispatchEvent(new Event("change", { bubbles: true })));
    const track = ui.field("Audio track", ui.dialog());
    await ui.waitFor(() => track.value !== "");
    const trackId = track.value;
    expect(ui.field("Action", ui.dialog()).value).toBe("effect");
    await ui.input("Caption when sound is unavailable", "[A knock]", ui.dialog());
    await ui.closeDialog();
    await ui.click("Sound effects");
    await ui.input("Fade (s)", "0.25", ui.dialog());
    await ui.closeDialog();
    await ui.click("Sound timing");
    expect(ui.field("Fade (s)", ui.dialog()).value).toBe("0.25");
    await ui.input("Delay (s)", "0.5", ui.dialog());
    await ui.closeDialog();
    await ui.click("Step 1, Text");
    await ui.input("Text", "Dawn breaks.", ui.dialog());
    await ui.input("Style", "whisper", ui.dialog());
    await ui.closeDialog();
    expect(ui.findButton("Text timing")?.disabled).toBe(false);
    await ui.click("Step 1, Advance");
    await ui.input("Advance", "after");
    await ui.click("Add step after selection");
    await ui.click("Step 2, Text");
    await ui.input("Text", "Someone arrives.", ui.dialog());
    await ui.closeDialog();
    await ui.click("Step 2");
    await ui.action("Move left");
    expect(ui.field("Text").value).toBe("Someone arrives.");
    await ui.click("Step 1");
    await ui.action("Duplicate");
    expect(ui.host.querySelector<HTMLSelectElement>('[aria-label="Go to step"]')?.value).toBe("2");
    await ui.click("Next step");
    await ui.click("Step 3, Text");
    expect(ui.field("Text", ui.dialog()).value).toBe("Dawn breaks.");
    await ui.closeDialog();
    await ui.click("Previous step");
    await ui.click("Step 2");
    await ui.action("Delete");
    expect(ui.host.querySelectorAll(".cutscene-time__navigation option")).toHaveLength(2);
    await ui.click("Undo");
    expect(ui.host.querySelectorAll(".cutscene-time__navigation option")).toHaveLength(3);
    await ui.click("Redo");
    expect(ui.host.querySelectorAll(".cutscene-time__navigation option")).toHaveLength(2);
    await ui.click("Play from the start");
    expect(ui.host.querySelector(".cutscene-reel")).toBeTruthy();
    await ui.click("Stop preview");
    expect(saved).not.toHaveBeenCalled();
    await ui.file("Close editor");
    expect(ui.host.querySelector("dialog")?.textContent).toContain("unsaved changes");
    await ui.click("Cancel", ui.host.querySelector("dialog")!);
    expect(closed).not.toHaveBeenCalled();
    await ui.file("Save");
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.lastCall?.[0]).toMatchObject({
      title: "At dawn",
      display: "fullscreen",
      beats: [
        { text: { text: "Someone arrives." } },
        {
          text: { text: "Dawn breaks.", style: "whisper" },
          image: {
            source: { kind: "set", imageId: "door" },
            during: "pan-left",
            motionSeconds: 3,
            filter: "warm",
          },
          sound: { action: "effect", trackId, caption: "[A knock]", fadeSeconds: 0.25, delay: 0.5 },
          advance: { kind: "after", seconds: 3 },
        },
      ],
    });
    await ui.file("Close editor");
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
    expect(ui.host.querySelector(".cutscene-library")?.getAttribute("data-editor-open")).toBe(
      "false",
    );
    await ui.file("+ New film");
    expect(ui.host.querySelector(".cutscene-library")?.getAttribute("data-editor-open")).toBe(
      "true",
    );
    await ui.click("Settings");
    await ui.input("Title", "At the house");
    await ui.click("Close dialog", ui.host.querySelector("dialog")!);
    await ui.file("Save");
    await ui.file("Open film");
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
    const dialog = ui.host.querySelector('dialog[aria-label="Rename"]')!;
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
      /A short adventure/.test(
        ui.host.querySelector('dialog[aria-label^="Delete"]')?.textContent ?? "",
      ),
    );
    await ui.click("Delete", ui.host.querySelector('dialog[aria-label^="Delete"]')!);
    await ui.waitFor(() => !ui.host.querySelector('dialog[aria-label^="Delete"]'));
    expect((await repo.listCutsceneFilms()).map(({ title }) => title)).toEqual([
      "Copy of At the house",
    ]);
  } finally {
    await ui.close();
    await repo.close();
  }
});

it("projects the selected step's actual playback times and edits its outgoing transition independently", async () => {
  const ui = setup();
  const saved = vi.fn();
  const film = CutsceneFilmSchema.parse({
    id: "knock",
    title: "A knock",
    beats: [
      {
        id: "one",
        image: {
          source: { kind: "set", imageId: "door" },
          in: { effect: "fade", delay: 0.5, seconds: 1 },
          out: { effect: "none" },
        },
        sound: { action: "effect", trackId: "knock" },
        text: {
          text: "Someone is there.",
          in: { effect: "none", delay: 2 },
          out: { effect: "stay" },
        },
        advance: { kind: "after", seconds: 1 },
      },
      { id: "two" },
    ],
    images: [{ id: "door", dataUrl: "example", thumbDataUrl: "example" }],
    createdAt: "",
    updatedAt: "",
  });
  try {
    await act(async () =>
      ui.root.render(
        <CutsceneStudio
          film={film}
          previewTheme={PRESET_THEMES[0]!}
          onClose={() => {}}
          onSave={saved}
        />,
      ),
    );
    const timeline = ui.host.querySelector('[aria-label="Step timeline · Step 1"]')!;
    const ruler = timeline.querySelector(".cutscene-time__ruler")!;
    expect(ruler.lastElementChild?.textContent).toBe("20 sec");
    expect(ui.host.querySelectorAll(".cutscene-time")).toHaveLength(1);
    expect(ui.host.querySelector("table")).toBeNull();
    expect(timeline.querySelector('[aria-label="Sound · Sound cue at 0 sec"]')).toBeTruthy();
    const picture = timeline.querySelector('[aria-label="Image · Image · 0.5 sec to 2 sec"]')!;
    expect(picture.querySelector("img")?.getAttribute("src")).toBe("example");
    expect(picture.querySelector<HTMLElement>('[data-shape="in"]')?.style.width).toContain("66.66");
    expect(timeline.textContent).toContain("Advances at 2 sec");
    expect(ui.findButton("Previous step", timeline)?.disabled).toBe(true);
    await ui.click("Next step", timeline);
    expect(timeline.getAttribute("aria-label")).toBe("Step timeline · Step 2");
    expect(ui.findButton("Next step", timeline)?.disabled).toBe(true);
    await ui.click("Previous step", timeline);
    await ui.click("Text · Someone is there. · 2 sec to 2 sec", timeline);
    expect(ui.field("Text", ui.dialog()).value).toBe("Someone is there.");
    await ui.closeDialog();
    await ui.click("Text timing", timeline);
    await ui.input("Wait before showing text (s)", "4", ui.dialog());
    await ui.closeDialog();
    expect(
      timeline.querySelector('[aria-label="Text · Someone is there. · 4 sec to 4 sec"]'),
    ).toBeTruthy();
    await ui.click("Sound timing", timeline);
    await ui.input("Delay (s)", "8.5", ui.dialog());
    await ui.closeDialog();
    expect(timeline.querySelector('[aria-label="Sound · Sound cue at 8.5 sec"]')).toBeTruthy();
    expect(timeline.textContent).toContain("Advances at 8.5 sec");
    expect(ruler.lastElementChild?.textContent).toBe("20 sec");
    await ui.click("Transition · Step 1 → Step 2");
    await ui.input("Transition", "crossfade");
    await ui.input("Duration (s)", "0.8");
    expect(timeline.textContent).toContain("Transition takes 0.8 sec");
    await ui.click("Zoom in", timeline);
    expect(timeline.textContent).toContain("150%");
    await ui.click("Reset zoom", timeline);
    const viewport = timeline.querySelector<HTMLDivElement>(".cutscene-time__viewport")!;
    const scale = viewport.querySelector<HTMLDivElement>(".cutscene-time__scale")!;
    Object.defineProperty(viewport, "clientWidth", { value: 400 });
    async function wheel(deltaY: number, ctrlKey: boolean) {
      const event = new WheelEvent("wheel", {
        clientX: 100,
        deltaY,
        ctrlKey,
        cancelable: true,
        bubbles: true,
      });
      await act(async () => scale.dispatchEvent(event));
      return event;
    }
    const regularWheel = await wheel(-240, false);
    expect(regularWheel.defaultPrevented).toBe(false);
    expect(scale.style.width).toBe("100%");
    const zoomWheel = await wheel(-240, true);
    expect(zoomWheel.defaultPrevented).toBe(true);
    expect(scale.style.width).toBe("200%");
    expect(scale.style.left).toBe("-100px");
    await wheel(240, true);
    expect(scale.style.width).toBe("100%");
    expect(scale.style.left).toBe("0px");
    await ui.file("Save");
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        beats: expect.arrayContaining([
          expect.objectContaining({
            transition: { effect: "crossfade", seconds: 0.8 },
            advance: { kind: "after", seconds: 1 },
          }),
        ]),
      }),
    );
  } finally {
    await ui.close();
  }
});

it("saves separate display and exit settings and previews the exit without a second step", async () => {
  const ui = setup();
  const saved = vi.fn();
  const film = CutsceneFilmSchema.parse({
    id: "signal",
    title: "Signal",
    createdAt: "",
    updatedAt: "",
    beats: [
      {
        id: "one",
        image: {
          source: { kind: "set", imageId: "still" },
          in: { effect: "none" },
          out: { effect: "none" },
        },
      },
    ],
    images: [{ id: "still", dataUrl: "example", thumbDataUrl: "example" }],
  });
  try {
    await act(async () =>
      ui.root.render(
        <CutsceneStudio
          film={film}
          previewTheme={PRESET_THEMES[0]!}
          onClose={() => {}}
          onSave={saved}
        />,
      ),
    );
    const group = (name: string) =>
      Array.from(ui.host.querySelectorAll("fieldset")).find(
        (item) => item.querySelector("legend")?.textContent === name,
      )!;
    await ui.click("Image effects");
    expect(ui.dialog().getAttribute("aria-label")).toBe("Image effects");
    await ui.input("Motion while displayed", "signal-glitch", ui.dialog());
    await ui.input("Strength (%)", "28", group("Signal interference"));
    await ui.input("Interference density (%)", "40", group("Signal interference"));
    const exit = group("Exit");
    await ui.input("Effect", "melt", exit);
    await ui.input("Strength (%)", "85", exit);
    await ui.input("Duration (s)", "4", group("Signal interference"));
    await ui.input("Duration (s)", "2.5", group("Exit"));
    await ui.closeDialog();
    await ui.click("Image timing");
    expect(ui.field("Duration (s)", group("Signal interference")).value).toBe("4");
    expect(ui.field("Duration (s)", group("Exit")).value).toBe("2.5");
    expect(ui.dialog().querySelector("select")).toBeNull();
    await ui.closeDialog();
    await ui.click("Image effects");
    await ui.click("Preview image exit", ui.dialog());
    expect(ui.host.querySelector("dialog[open]")).toBeNull();
    expect(ui.host.querySelector(".cutscene-reel__picture")?.getAttribute("src")).toBe("example");
    expect(ui.host.querySelector(".cutscene-reel__signal")).toBeNull();
    await ui.click("Stop preview");
    await ui.file("Save");
    expect(saved.mock.calls[0]?.[0].beats).toMatchObject([
      {
        image: {
          during: "signal-glitch",
          signal: { strength: 28, density: 40, seconds: 4 },
          out: { effect: "melt", seconds: 2.5, strength: 85 },
        },
      },
    ]);
  } finally {
    await ui.close();
  }
});

it("sets a pause before a specific repeated word and saves it with text interference", async () => {
  const ui = setup();
  const saved = vi.fn();
  const film = CutsceneFilmSchema.parse({
    id: "note",
    title: "The note",
    createdAt: "",
    updatedAt: "",
    beats: [{ id: "one" }],
  });
  try {
    await act(async () =>
      ui.root.render(
        <CutsceneStudio
          film={film}
          previewTheme={PRESET_THEMES[0]!}
          onClose={() => {}}
          onSave={saved}
        />,
      ),
    );
    const group = (name: string) =>
      Array.from(ui.host.querySelectorAll("fieldset")).find(
        (item) => item.querySelector("legend")?.textContent === name,
      )!;
    await ui.click("Step 1, Text");
    await ui.input("Text", "Mona … Mona!", ui.dialog());
    const stage = ui.host.querySelector(".cutscene-studio__poster-stage")!;
    const copy = stage.querySelector<HTMLDivElement>(".cutscene-reel__copy")!;
    expect(copy.textContent).toBe("Mona … Mona!");
    await ui.input("Style", "whisper", ui.dialog());
    await ui.input("Size", "large", ui.dialog());
    await ui.input("Position", "top", ui.dialog());
    await ui.input("Alignment", "right", ui.dialog());
    await ui.input("Font", "heading", ui.dialog());
    expect(copy.classList).toContain("cutscene-reel__copy--whisper");
    expect(copy.classList).toContain("cutscene-reel__copy--size-large");
    expect(copy.classList).toContain("cutscene-reel__copy--font-heading");
    expect(copy.parentElement?.classList).toContain("cutscene-reel__text--top");
    expect(copy.style.textAlign).toBe("right");

    await ui.closeDialog();
    await ui.click("Text effects");
    const entrance = group("How the text appears");
    await ui.input("Effect", "word-reveal", entrance);
    expect(entrance.textContent).toContain("Words appear one at a time.");
    const exit = group("How the text leaves");
    await ui.input("Effect", "fade", exit);
    const wordOptions = ui.field("Pause before word", entrance) as HTMLSelectElement;
    expect(Array.from(wordOptions.options, (option) => option.textContent)).toEqual([
      "None",
      "1. Mona",
      "2. Mona",
    ]);
    await ui.input("Pause before word", "2", entrance);
    await ui.input("Pause length (s)", "2.5", entrance);
    const during = group("While the text is visible");
    await ui.input("Effect", "signal-glitch", during);
    await ui.input("Strength (%)", "40", during);
    await ui.closeDialog();
    await ui.click("Text timing");
    expect(ui.field("Pause length (s)", group("How the text appears")).value).toBe("2.5");
    await ui.input("Duration (s)", "1.4", group("How the text leaves"));
    await ui.closeDialog();
    await ui.file("Save");
    expect(saved.mock.calls[0]?.[0].beats).toMatchObject([
      {
        text: {
          in: { effect: "word-reveal", pauseBefore: 2, pauseSeconds: 2.5 },
          out: { effect: "fade", seconds: 1.4 },
          during: "signal-glitch",
          signal: { strength: 40 },
        },
      },
    ]);
  } finally {
    await ui.close();
  }
});
