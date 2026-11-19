// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useSimpleFrames, useSystemAsk } from "../../src/ui/play/ornament";
import { ThemeLibrarySchema, PRESET_THEMES, defaultThemeLibrary } from "../../src/ui/themes/theme";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Listener = () => void;
/** A system with these asks, which can change them while the page is open. */
function system(initial: { reducedMotion?: boolean; moreContrast?: boolean }) {
  const ask = { reducedMotion: false, moreContrast: false, ...initial };
  const listeners = new Set<Listener>();
  const matches = (query: string) =>
    query.includes("reduced-motion")
      ? ask.reducedMotion
      : query.includes("prefers-contrast")
        ? ask.moreContrast
        : false;
  const impl = (query: string) => ({
    get matches() {
      return matches(query);
    },
    media: query,
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
  });
  vi.stubGlobal("matchMedia", impl);
  Object.defineProperty(window, "matchMedia", { value: impl, configurable: true });
  return {
    set: async (next: Partial<typeof ask>) => {
      Object.assign(ask, next);
      await act(async () => listeners.forEach((fn) => fn()));
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true });
  document.body.innerHTML = "";
});

function Probe({ chosen }: { chosen: boolean }) {
  const simple = useSimpleFrames(chosen);
  const ask = useSystemAsk();
  return (
    <p id="probe">
      {String(simple)}|{String(ask.reducedMotion)}|{String(ask.moreContrast)}
    </p>
  );
}
async function mount(chosen: boolean) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(<Probe chosen={chosen} />));
  return () => host.querySelector("#probe")!.textContent;
}

it("keeps the frames as the theme draws them when nothing asks for plain ones", async () => {
  system({});
  const read = await mount(false);
  expect(read()).toBe("false|false|false");
});

it("makes them plain when the player has chosen simple frames", async () => {
  system({});
  const read = await mount(true);
  expect(read()).toBe("true|false|false");
});

it("makes them plain by itself when the system asks for less motion", async () => {
  const sys = system({ reducedMotion: true });
  const read = await mount(false);
  expect(read()).toBe("true|true|false");
  await sys.set({ reducedMotion: false });
  expect(read()).toBe("false|false|false");
});

it("makes them plain by itself when the system asks for more contrast, and follows it as it changes", async () => {
  const sys = system({});
  const read = await mount(false);
  expect(read()).toBe("false|false|false");
  await sys.set({ moreContrast: true });
  expect(read()).toBe("true|false|true");
  await sys.set({ moreContrast: false });
  expect(read()).toBe("false|false|false");
});

it("works where the browser cannot tell what the system asks for", async () => {
  vi.stubGlobal("matchMedia", undefined);
  Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true });
  const read = await mount(false);
  expect(read()).toBe("false|false|false");
});

it("is kept with the appearance: off in a library saved before it, and read as saved", () => {
  const old = JSON.parse(JSON.stringify(defaultThemeLibrary())) as Record<string, unknown>;
  delete old.simpleFrames;
  expect(ThemeLibrarySchema.parse(old).simpleFrames).toBe(false);
  expect(defaultThemeLibrary().simpleFrames).toBe(false);
  const on = { ...defaultThemeLibrary(), simpleFrames: true, active: PRESET_THEMES[0]! };
  expect(ThemeLibrarySchema.parse(JSON.parse(JSON.stringify(on))).simpleFrames).toBe(true);
});
