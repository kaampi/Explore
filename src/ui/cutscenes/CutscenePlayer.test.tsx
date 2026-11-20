// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { CutsceneFilmSchema } from "../../cutscenes/schema";
import { PRESET_THEMES } from "../themes/theme";
import { CutscenePlayer, type CutscenePlayerProps } from "./CutscenePlayer";

function model(beats: unknown[], skippable = true) {
  return CutsceneFilmSchema.parse({
    id: "demo",
    title: "The room",
    createdAt: "",
    updatedAt: "",
    beats,
    skippable,
    images: [
      {
        id: "room",
        alt: "A room at dawn",
        dataUrl: "data:image/png;base64,x",
        thumbDataUrl: "data:image/png;base64,x",
      },
    ],
  });
}

const settle = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));

async function mount(
  film: CutscenePlayerProps["film"],
  overrides: Partial<CutscenePlayerProps> = {},
) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onEnd = vi.fn();
  const loadTrack = vi.fn(async () => null as Blob | null);
  const options = {
    film,
    theme: PRESET_THEMES[0]!,
    simple: false,
    onEnd,
    sound: { enabled: false, volume: 1, loadTrack },
    ...overrides,
  };
  await act(async () =>
    root.render(
      <StrictMode>
        <CutscenePlayer {...options} />
      </StrictMode>,
    ),
  );
  return {
    host,
    onEnd,
    loadTrack,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
    press: (key: string) =>
      act(async () =>
        host
          .querySelector(".cutscene-reel")
          ?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })),
      ),
    click: (label: string) =>
      act(async () =>
        Array.from(host.querySelectorAll("button"))
          .find((button) => button.textContent === label)
          ?.click(),
      ),
  };
}

describe("the independent cut-scene player", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("focuses a named region, announces whole text, and only ends after the last step", async () => {
    const film = model([
      {
        id: "first",
        image: {
          source: { kind: "set", imageId: "room" },
          in: { effect: "none" },
          out: { effect: "none" },
        },
        text: {
          text: "First light",
          in: { effect: "typewriter", seconds: 2 },
          out: { effect: "stay" },
        },
      },
      {
        id: "second",
        text: { text: "Someone knocks", in: { effect: "none" }, out: { effect: "stay" } },
      },
    ]);
    const original = structuredClone(film);
    const ui = await mount(film);
    try {
      const region = ui.host.querySelector("section")!;
      expect(document.activeElement).toBe(region);
      expect(region.getAttribute("aria-labelledby")).toBe(region.querySelector("h2")?.id);
      expect(
        Array.from(region.querySelectorAll('[aria-live="polite"]'), (item) => item.textContent),
      ).toEqual(["A room at dawn", "First light"]);
      await ui.press("Escape");
      expect(ui.onEnd).not.toHaveBeenCalled();
      await ui.press("Enter");
      expect(region.querySelector(".cutscene-reel__copy")?.textContent).toBe("First light");
      await ui.press(" ");
      expect(region.querySelector(".cutscene-reel__copy")?.textContent).toBe("Someone knocks");
      expect(ui.onEnd).not.toHaveBeenCalled();
      expect(film).toEqual(original);
      await ui.press("Enter");
      await ui.press("Enter");
      await ui.click("Skip");
      expect(ui.onEnd).toHaveBeenCalledExactlyOnceWith("finished");
    } finally {
      await ui.close();
    }
  });

  it("supports skipping once, hides skip when disabled, and never ends on unmount", async () => {
    const skip = await mount(model([{ id: "first" }]));
    await skip.click("Skip");
    await skip.click("Skip");
    expect(skip.onEnd).toHaveBeenCalledExactlyOnceWith("skipped");
    await skip.close();
    const leave = await mount(
      model([{ id: "first", advance: { kind: "after", seconds: 2 } }], false),
    );
    expect(
      Array.from(leave.host.querySelectorAll("button"), (button) => button.textContent),
    ).not.toContain("Skip");
    await leave.close();
    await settle(3000);
    expect(leave.onEnd).not.toHaveBeenCalled();
  });

  it("pauses auto-advance and renders motion-free text and disabled-audio captions immediately", async () => {
    const ui = await mount(
      model([
        {
          id: "first",
          advance: { kind: "after", seconds: 2 },
          text: {
            text: "Someone whispers",
            in: { effect: "typewriter", delay: 3, seconds: 4 },
            out: { effect: "zoom-out", seconds: 2 },
          },
          sound: { action: "effect", trackId: "knock", caption: "[A knock]" },
        },
      ]),
      { simple: true },
    );
    try {
      expect(ui.host.querySelector(".cutscene-reel__copy")?.textContent).toBe("Someone whispers");
      expect(ui.host.querySelector(".cutscene-reel__caption")?.textContent).toBe("[A knock]");
      expect(ui.loadTrack).not.toHaveBeenCalled();
      await ui.click("Pause");
      await settle(3000);
      expect(ui.onEnd).not.toHaveBeenCalled();
      await ui.click("Resume");
      await settle(2200);
      expect(ui.onEnd).toHaveBeenCalledExactlyOnceWith("finished");
    } finally {
      await ui.close();
    }
  });

  it("announces missing audio, loops available music and releases it at the end", async () => {
    const pause = vi.fn();
    const revoke = vi.fn();
    const audios: { loop: boolean; volume: number }[] = [];
    const create = vi.fn(() => "blob:track");
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    vi.stubGlobal(
      "Audio",
      class {
        loop = false;
        volume = 0;
        paused = false;
        play = vi.fn(async () => {});
        pause = pause;
        constructor() {
          audios.push(this);
        }
      },
    );
    const loadTrack = vi.fn(async (id: string) =>
      id === "music" ? new Blob(["mock tone"]) : null,
    );
    const ui = await mount(
      model([
        { id: "first", sound: { action: "music", trackId: "music", volume: 0.5 } },
        {
          id: "second",
          sound: { action: "effect", trackId: "missing", caption: "[The door opens]" },
        },
      ]),
      { sound: { enabled: true, volume: 0.5, loadTrack } },
    );
    try {
      expect(audios[0]?.loop).toBe(true);
      expect(audios[0]?.volume).toBe(0.25);
      await ui.press("Enter");
      expect(ui.host.querySelector(".cutscene-reel__caption")?.textContent).toBe(
        "[The door opens]",
      );
      expect(loadTrack).toHaveBeenCalledTimes(2);
      await ui.press("Enter");
      expect(ui.onEnd).toHaveBeenCalledExactlyOnceWith("finished");
      await ui.close();
      await settle(1100);
      expect(pause).toHaveBeenCalled();
      expect(revoke).toHaveBeenCalledWith("blob:track");
    } finally {
      if (ui.host.isConnected) await ui.close();
    }
  });
});
