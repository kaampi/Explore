// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PlayWorkspace } from "../../src/ui/home/PlayWorkspace";
import { PRESET_THEMES, shellForTheme } from "../../src/ui/themes/theme";
import { playMapFixture } from "../fixtures/play-map";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";

let session: ReturnType<typeof playMapFixture>["session"];
let theme: { background: string; backgroundMode: string } = {
  background: "#ffffff",
  backgroundMode: "scene",
};
vi.mock("../../src/ui/EngineStore", () => ({
  useEngine: () => ({ useSession: () => session, phase: "idle", setOllamaModel: () => {} }),
}));
vi.mock("../../src/ui/components/ChatPanel", () => ({
  ChatPanel: () => <div data-chat="true">Conversation</div>,
}));
vi.mock("../../src/ui/connection/ConnectionProvider", () => ({
  useConnection: () => ({ discovery: {}, refresh: () => {}, chooseModel: () => {} }),
}));
vi.mock("../../src/ui/connection/connection", () => ({ modelReadiness: () => "ready" }));
vi.mock("../../src/ui/themes/ThemeProvider", () => ({
  useAppearance: () => ({ library: { active: theme } }),
  playThemeStyle: () => ({}),
}));
vi.mock("../../src/ui/audio/GameAudio", () => ({ GameAudio: () => null }));

async function playSurface(active: typeof theme) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  theme = active;
  const f = playMapFixture();
  session = f.session;
  const repo = new IndexedDBRepository(new IDBFactory(), "themed-shell-" + active.background);
  await repo.saveRealm(f.world);
  const host = document.createElement("div");
  host.className = "sandbox-root";
  host.dataset.shell = "dark";
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <PlayWorkspace repo={repo} onHome={() => {}} onAppearance={() => {}} onIdeas={() => {}} />,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
  return {
    surface: host.querySelector<HTMLElement>(".sb-themed-play")!,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it("chooses the palette from the theme's background", () => {
  expect(shellForTheme({ background: "#ffffff" })).toBe("light");
  expect(shellForTheme({ background: "#f4efe3" })).toBe("light");
  expect(shellForTheme({ background: "#101418" })).toBe("dark");
  expect(shellForTheme({ background: "#2a1f3d" })).toBe("dark");
  // Something that is not a colour falls back to the light palette.
  expect(shellForTheme({})).toBe("light");
  expect(shellForTheme({ background: "not a colour" })).toBe("light");
  // Every theme that comes with the app gets a palette that suits it.
  for (const preset of PRESET_THEMES) expect(["light", "dark"]).toContain(shellForTheme(preset));
});

it("gives the play surface the light palette inside a light theme, even when the app is dark", async () => {
  const ui = await playSurface({ background: "#f4efe3", backgroundMode: "scene" });
  try {
    expect(ui.surface.closest('[data-shell="dark"]')).not.toBeNull();
    expect(ui.surface.getAttribute("data-shell")).toBe("light");
  } finally {
    await ui.close();
  }
});

it("gives the play surface the dark palette inside a dark theme, even when the app is light", async () => {
  const ui = await playSurface({ background: "#101418", backgroundMode: "scene" });
  try {
    expect(ui.surface.getAttribute("data-shell")).toBe("dark");
  } finally {
    await ui.close();
  }
});

it("lets either palette be put on any element, and the theme's own colours win over it", () => {
  const tokens = readFileSync("src/ui/tokens.css", "utf8");
  expect(tokens).toMatch(/\[data-shell="light"\]\s*\{/);
  expect(tokens).toMatch(/\[data-shell="dark"\]\s*\{/);
  // The light palette is the base of the page and the frame too.
  expect(tokens).toMatch(/:root,\s*\.sandbox-root,\s*\[data-shell="light"\]/);
  // The play theme sets its own text, panel and accent after the palette, on the same element.
  const frame = readFileSync("src/ui/experience.css", "utf8");
  expect(frame).toMatch(/\.sb-themed-play\s*\{[^}]*--text:\s*var\(--play-text\)/);
  expect(frame).toMatch(/\.sb-themed-play\s*\{[^}]*--accent:\s*var\(--play-accent\)/);
});
