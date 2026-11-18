// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlayWorkspace } from "../../src/ui/home/PlayWorkspace";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { INITIAL_GAME_MINUTES } from "../../src/state/gameClock";
import type { Session } from "../../src/state/StateSchema";

let session: Session;
let phase = "idle";
vi.mock("../../src/ui/EngineStore", () => ({
  useEngine: () => ({ useSession: () => session, phase, setOllamaModel: () => {} }),
}));
vi.mock("../../src/ui/components/ChatPanel", () => ({
  ChatPanel: () => <div data-chat="true">Conversation</div>,
}));
vi.mock("../../src/ui/connection/ConnectionProvider", () => ({
  useConnection: () => ({ discovery: {}, refresh: () => {}, chooseModel: () => {} }),
}));
vi.mock("../../src/ui/connection/connection", () => ({ modelReadiness: () => "ready" }));
vi.mock("../../src/ui/themes/ThemeProvider", () => ({
  useAppearance: () => ({ library: { active: { backgroundMode: "none", background: "#f4efe3" } } }),
  playThemeStyle: () => ({}),
}));
vi.mock("../../src/ui/audio/GameAudio", () => ({
  GameAudio: () => <button type="button">Sound</button>,
}));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  phase = "idle";
  const built = connectedAdventureExample();
  session = startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "play-frame",
    [built.realm],
    { characters: built.characters },
  );
});
afterEach(() => vi.restoreAllMocks());

async function mount(options: { onHome?: (s: Session) => void; onAppearance?: () => void } = {}) {
  const repo = new IndexedDBRepository(new IDBFactory(), "play-frame-ui");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <LanguageProvider>
        <PlayWorkspace
          repo={repo}
          onHome={options.onHome ?? (() => {})}
          onAppearance={options.onAppearance ?? (() => {})}
          onIdeas={() => {}}
        />
      </LanguageProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
const rows = () =>
  Array.from(document.querySelectorAll('[role="menu"] [role^="menuitem"]')).map(
    (row) => row.textContent,
  );

it("puts an engine scene in a top row and three columns: place and people, story, in the scene", async () => {
  const ui = await mount();
  try {
    const frame = ui.host.querySelector(".play-view")!;
    expect(frame).not.toBeNull();
    expect(
      Array.from(frame.children).map(
        (child) => child.getAttribute("aria-label") ?? child.className,
      ),
    ).toEqual(["The place and the people", "play-view__center", "In the scene"]);
    expect(frame.querySelector(".play-view__center .chat-log")).not.toBeNull();
    expect(frame.querySelector(".play-view__center .gate-scene-composer")).not.toBeNull();
    expect(frame.querySelector(".play-view__right .sb-game-toolbox")).not.toBeNull();
    // The row over the frame, and not the old toolbar of a conversation.
    expect(ui.host.querySelector(".play-top")).not.toBeNull();
    expect(ui.host.querySelector(".sb-play-toolbar")).toBeNull();
  } finally {
    await ui.close();
  }
});

it("shows the place's name in the top row, and its time only when the adventure has travel times", async () => {
  const withoutTimes = await mount();
  try {
    expect(withoutTimes.host.querySelector(".play-top__place")!.textContent).toBe(
      "A missing messenger",
    );
    expect(withoutTimes.host.querySelector(".play-top__time")).toBeNull();
  } finally {
    await withoutTimes.close();
  }
  session.adventure!.links[0]!.minutes = 20;
  const withTimes = await mount();
  try {
    expect(withTimes.host.querySelector(".play-top__time")!.textContent).toBe("Day 1 · 08:00");
    expect(INITIAL_GAME_MINUTES).toBe(8 * 60);
  } finally {
    await withTimes.close();
  }
});

it("goes back to the overview from the first button, which waits while a reply is being written", async () => {
  const onHome = vi.fn();
  const ui = await mount({ onHome });
  try {
    const home = ui.host.querySelector<HTMLButtonElement>(".play-top__home")!;
    expect(home.textContent).toBe("To overview");
    await act(async () => home.click());
    expect(onHome).toHaveBeenCalledOnce();
  } finally {
    await ui.close();
  }
  phase = "streaming";
  const busy = await mount({ onHome });
  try {
    const home = busy.host.querySelector<HTMLButtonElement>(".play-top__home")!;
    expect(home.disabled).toBe(true);
    expect(home.title).toBe("Wait for the reply to finish");
  } finally {
    await busy.close();
  }
});

it("has a menu with appearance, AI and model, the inspector and the language", async () => {
  const onAppearance = vi.fn();
  const ui = await mount({ onAppearance });
  try {
    const button = ui.host.querySelector<HTMLButtonElement>('button[aria-label="Menu"]')!;
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    await act(async () => button.click());
    // A chosen row starts with a tick: the language the interface is in.
    expect(rows().map((row) => row!.replace("✓", ""))).toEqual([
      "Appearance",
      "AI and model",
      "Inspector",
      "Cast",
      "English",
      "Svenska",
      "Norsk bokmål",
    ]);
    const choose = (label: string) =>
      Array.from(document.querySelectorAll<HTMLElement>('[role^="menuitem"]')).find(
        (row) => row.textContent === label,
      )!;
    await act(async () => choose("Appearance").click());
    expect(onAppearance).toHaveBeenCalledOnce();

    // Switching the language changes the words of the row itself.
    await act(async () => button.click());
    await act(async () => choose("Svenska").click());
    expect(ui.host.querySelector(".play-top__home")!.textContent).toBe("Till översikten");
  } finally {
    await ui.close();
  }
});

it("keeps the sound control mounted in the top row, and the picture of the place and the people on the left", async () => {
  const ui = await mount();
  try {
    expect(ui.host.querySelector(".play-top__tools")!.textContent).toContain("Sound");
    const left = ui.host.querySelector(".play-view__left")!;
    expect(left.querySelector(".play-view__scene")!.getAttribute("aria-label")).toBe(
      "Picture of the place: A missing messenger",
    );
    expect(left.textContent).toContain("People nearby");
    expect(left.textContent).toContain("Edda");
    // The people are not also listed in the column on the right.
    expect(ui.host.querySelector(".play-view__right")!.textContent).not.toContain("People nearby");
  } finally {
    await ui.close();
  }
});

it("keeps the old toolbar for a conversation, which has no frame", async () => {
  delete session.encounter;
  const ui = await mount();
  try {
    expect(ui.host.querySelector(".sb-play-toolbar")).not.toBeNull();
    expect(ui.host.querySelector(".play-top")).toBeNull();
    expect(ui.host.querySelector(".play-view")).toBeNull();
  } finally {
    await ui.close();
  }
});
