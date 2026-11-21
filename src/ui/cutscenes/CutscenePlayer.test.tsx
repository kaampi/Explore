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

  it("keeps visible motion and filter across steps and disables motion with simple frames", async () => {
    const film = model([
      {
        id: "one",
        image: {
          source: { kind: "set", imageId: "room" },
          during: "slow-zoom",
          motionSeconds: 3.5,
          filter: "sepia",
          in: { effect: "none" },
          out: { effect: "none" },
        },
      },
      {
        id: "two",
        text: {
          text: "Keep this letter.",
          style: "letter",
          in: { effect: "none" },
          out: { effect: "stay" },
        },
      },
    ]);
    const moving = await mount(film);
    try {
      const image = moving.host.querySelector("img")!;
      expect(image.dataset.motion).toBe("slow-zoom");
      expect(image.style.animationDuration).toBe("3.5s");
      expect(image.classList.contains("cutscene-reel__filter--sepia")).toBe(true);
      await moving.press("Enter");
      expect(moving.host.querySelector("img")).toBe(image);
      expect(moving.host.querySelector(".orn-note")?.textContent).toBe("Keep this letter.");
    } finally {
      await moving.close();
    }
    const still = await mount(film, { simple: true });
    try {
      const image = still.host.querySelector("img")!;
      expect(image.dataset.motion).toBe("none");
      expect(image.classList.contains("cutscene-reel__filter--sepia")).toBe(true);
    } finally {
      await still.close();
    }
  });

  it.each([false, true])(
    "melts before continuing, including at the last step (%s)",
    async (last) => {
      const film = model([
        {
          id: "show",
          image: {
            source: { kind: "set", imageId: "room" },
            in: { effect: "none" },
            out: { effect: "melt", seconds: 1 },
          },
          text: { text: "First", in: { effect: "none" }, out: { effect: "stay" } },
        },
        ...(last
          ? []
          : [
              {
                id: "next",
                text: { text: "Next", in: { effect: "none" }, out: { effect: "stay" } },
              },
            ]),
      ]);
      const ui = await mount(film);
      try {
        const button = last ? "Continue the game" : "Continue";
        const canvas = () => ui.host.querySelector<HTMLCanvasElement>("canvas.cutscene-reel__melt");
        expect(canvas()).toBeNull();
        const picture = ui.host.querySelector("img")!;
        await ui.click(button);
        const surface = canvas()!;
        expect(surface).toBeTruthy();
        expect(ui.host.querySelector("img")).toBe(picture);
        const drawImage = vi.fn();
        vi.spyOn(surface, "getContext").mockReturnValue({
          clearRect: vi.fn(),
          drawImage,
        } as unknown as CanvasRenderingContext2D);
        Object.defineProperties(picture, {
          naturalWidth: { value: 400 },
          naturalHeight: { value: 200 },
        });
        Object.defineProperties(surface, {
          clientWidth: { value: 240 },
          clientHeight: { value: 160 },
        });

        await ui.click(button);
        await settle(400);
        expect(canvas()).toBe(surface);
        expect(surface.hasAttribute("data-painted")).toBe(true);
        const offsets = drawImage.mock.calls.slice(-240).map((call) => Number(call[6]));
        expect(offsets).toHaveLength(240);
        expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(15);
        expect(
          Math.max(...offsets.slice(1).map((offset, i) => Math.abs(offset - offsets[i]!))),
        ).toBeLessThan(5);
        expect(ui.host.querySelector(".cutscene-reel__copy")?.textContent).toBe("First");
        expect(ui.onEnd).not.toHaveBeenCalled();
        await settle(700);
        expect(ui.host.querySelector(".cutscene-reel__image")).toBeNull();
        if (last) expect(ui.onEnd).toHaveBeenCalledWith("finished");
        else expect(ui.host.querySelector(".cutscene-reel__copy")?.textContent).toBe("Next");
      } finally {
        await ui.close();
      }
    },
  );

  it("plays and pauses the signal interference exit on image removal", async () => {
    const film = model([
      {
        id: "show",
        image: {
          source: { kind: "set", imageId: "room" },
          during: "signal-glitch",
          in: { effect: "none" },
          out: { effect: "signal-glitch", seconds: 2 },
        },
      },
      { id: "hold" },
      {
        id: "clear",
        image: { source: { kind: "clear" }, in: { effect: "none" }, out: { effect: "none" } },
      },
      { id: "timed", advance: { kind: "after", seconds: 2 } },
    ]);
    const selector = ".cutscene-reel__signal[data-ambient='false']";
    const ui = await mount(film);
    try {
      const ambient = ui.host.querySelector(".cutscene-reel__signal[data-ambient='true']");
      expect(ambient).toBeTruthy();
      await ui.press("Enter");
      expect(ui.host.querySelector(".cutscene-reel__signal")).toBe(ambient);
      await ui.press("Enter");
      await settle(80);
      const outgoing = ui.host.querySelector(selector);
      expect(outgoing).toBeTruthy();
      const style = outgoing?.getAttribute("style");
      await ui.click("Pause");
      await settle(3000);
      expect(ui.host.querySelector(selector)).toBe(outgoing);
      expect(outgoing?.getAttribute("style")).toBe(style);
      await ui.click("Resume");
      await settle(2100);
      expect(ui.host.querySelector(".cutscene-reel__image")).toBeNull();
    } finally {
      await ui.close();
    }

    const still = await mount(film, { simple: true });
    try {
      expect(still.host.querySelector(".cutscene-reel__signal")).toBeNull();
      await still.press("Enter");
      await still.press("Enter");
      expect(still.host.querySelector(".cutscene-reel__image")).toBeNull();
    } finally {
      await still.close();
    }
  });

  it("holds the chosen word until the pause ends and can display text and image interference together", async () => {
    const leadIn = "Through the doorway …\n";
    const source = leadIn + "Mona.";
    const film = model([
      {
        id: "show",
        image: {
          source: { kind: "set", imageId: "room" },
          during: "signal-glitch",
          in: { effect: "none" },
          out: { effect: "none" },
        },
        text: {
          text: source,
          in: { effect: "word-reveal", seconds: 1, pauseBefore: 4, pauseSeconds: 1 },
          out: { effect: "stay" },
          during: "signal-glitch",
        },
        advance: { kind: "after", seconds: 1 },
      },
      { id: "next" },
    ]);
    const ui = await mount(film);
    try {
      const signal = ui.host.querySelector<HTMLElement>(".cutscene-reel__text-signal")!;
      const picture = ui.host.querySelector<HTMLElement>(".cutscene-reel__signal")!;
      expect(signal.style.getPropertyValue("--cutscene-signal-period")).toBe(
        picture.style.getPropertyValue("--cutscene-signal-period"),
      );
      expect(ui.host.querySelector(".cutscene-reel__glyph[data-noise]")).not.toBeNull();
      const visible = () =>
        Array.from(signal.children)
          .filter((part) => getComputedStyle(part).visibility !== "hidden")
          .map((part) => part.textContent)
          .join("");
      expect(visible()).toBe("");
      await settle(1050);
      expect(visible()).toBe(leadIn);
      expect(ui.host.querySelectorAll('[aria-live="polite"]')[1]?.textContent).toBe(source);
      await ui.click("Pause");
      await settle(2200);
      expect(signal.dataset.paused).toBe("true");
      expect(visible()).toBe(leadIn);
      await ui.click("Resume");
      await settle(1050);
      expect(visible()).toBe(source);
      expect(ui.host.querySelector(".cutscene-reel__text-signal")).toBe(signal);
    } finally {
      await ui.close();
    }

    const still = await mount(film, { simple: true });
    try {
      expect(still.host.querySelector(".cutscene-reel__copy")?.textContent).toBe(source);
      expect(still.host.querySelector(".cutscene-reel__text-signal")).toBeNull();
    } finally {
      await still.close();
    }
  });

  it.each(["music", "effect"])(
    "stops timed %s at the clip end while the step stays open",
    async (action) => {
      const pause = vi.fn();
      const play = vi.fn(async () => {});
      const revoke = vi.fn();
      vi.stubGlobal("URL", { createObjectURL: () => "blob:timed", revokeObjectURL: revoke });
      vi.stubGlobal(
        "Audio",
        class {
          paused = false;
          play = play;
          pause = pause;
        },
      );
      const ui = await mount(
        model([{ id: "first", sound: { action, trackId: "bell", delay: 0.2, endAt: 1 } }]),
        { sound: { enabled: true, volume: 1, loadTrack: async () => new Blob(["bell"]) } },
      );
      try {
        await settle(300);
        expect(play).toHaveBeenCalledOnce();
        expect(pause).not.toHaveBeenCalled();
        await settle(850);
        expect(pause).toHaveBeenCalledOnce();
        expect(revoke).toHaveBeenCalledWith("blob:timed");
        expect(ui.onEnd).not.toHaveBeenCalled();
      } finally {
        await ui.close();
      }
    },
  );

  it("plays a sequence of text clips without restarting the zoom or looping music", async () => {
    const play = vi.fn(async () => {});
    const pause = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: () => "blob:music", revokeObjectURL: vi.fn() });
    vi.stubGlobal(
      "Audio",
      class {
        paused = false;
        play = play;
        pause = pause;
      },
    );
    const loadTrack = vi.fn(async () => new Blob(["rain"]));
    const ui = await mount(
      model([
        {
          id: "one",
          image: {
            source: { kind: "set", imageId: "room" },
            in: { effect: "none" },
            out: { effect: "none" },
            during: "slow-zoom",
          },
          sound: { action: "music", trackId: "rain" },
          textClips: [
            {
              id: "a",
              text: "First light",
              in: { effect: "none", delay: 0.2 },
              out: { effect: "stay" },
              endAt: 0.8,
            },
            {
              id: "b",
              text: "Someone knocks",
              in: { effect: "typewriter", seconds: 0.2, delay: 1 },
              out: { effect: "stay" },
              endAt: 1.7,
            },
          ],
        },
      ]),
      { sound: { enabled: true, volume: 1, loadTrack } },
    );
    try {
      const image = ui.host.querySelector("img");
      const caption = () => ui.host.querySelectorAll('[aria-live="polite"]')[1]?.textContent;
      expect(image?.dataset.motion).toBe("slow-zoom");
      expect(caption()).toBe("");
      await ui.press("Enter");
      await settle(350);
      expect(caption()).toBe("First light");
      await settle(570);
      expect(caption()).toBe("");
      await settle(400);
      expect(caption()).toBe("Someone knocks");
      expect(ui.host.querySelector("img")).toBe(image);
      expect(loadTrack).toHaveBeenCalledExactlyOnceWith("rain");
      expect(play).toHaveBeenCalledOnce();
      expect(pause).not.toHaveBeenCalled();
      await settle(450);
      expect(caption()).toBe("");
      expect(ui.onEnd).not.toHaveBeenCalled();
      await ui.press("Enter");
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
