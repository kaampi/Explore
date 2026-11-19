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
let saveFails = false;
const saveEncounter = vi.fn(() =>
  saveFails ? Promise.reject(new Error("disk full")) : Promise.resolve(),
);
vi.mock("../../src/ui/EngineStore", () => ({
  useEngine: () => ({
    useSession: () => session,
    phase,
    setOllamaModel: () => {},
    saveEncounter,
  }),
}));
vi.mock("../../src/ui/components/ChatPanel", () => ({
  ChatPanel: () => <div data-chat="true">Conversation</div>,
}));
vi.mock("../../src/ui/connection/ConnectionProvider", () => ({
  useConnection: () => ({ discovery: {}, refresh: () => {}, chooseModel: () => {} }),
}));
vi.mock("../../src/ui/connection/connection", () => ({ modelReadiness: () => "ready" }));
let activeTheme: Record<string, unknown> = { backgroundMode: "none", background: "#f4efe3" };
let simpleFrames = false;
vi.mock("../../src/ui/themes/ThemeProvider", () => ({
  useAppearance: () => ({ library: { active: activeTheme, simpleFrames } }),
  playThemeStyle: () => ({}),
}));
vi.mock("../../src/ui/audio/GameAudio", () => ({
  GameAudio: () => <button type="button">Sound</button>,
}));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  localStorage.clear();
  activeTheme = { backgroundMode: "none", background: "#f4efe3" };
  simpleFrames = false;
  phase = "idle";
  saveFails = false;
  saveEncounter.mockClear();
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

/** A window of this width, for the layouts that depend on it. */
function widthOf(width: number) {
  const query = (q: string) => {
    const max = /max-width:\s*(\d+)px/.exec(q);
    return {
      matches: max ? width <= Number(max[1]) : false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    };
  };
  Object.defineProperty(window, "matchMedia", { value: query, configurable: true });
}
afterEach(() => {
  Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true });
});

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

it("folds the left column to its strip by itself from 1024 to 1439 px, with no button for it", async () => {
  widthOf(1280);
  const ui = await mount();
  try {
    expect(ui.host.querySelector(".play-view--collapsed")).not.toBeNull();
    expect(ui.host.querySelector(".play-people--collapsed")).not.toBeNull();
    expect(ui.host.querySelector(".play-people__toggle")).toBeNull();
    // The right column is still there.
    expect(ui.host.querySelector(".play-view__right .play-scene")).not.toBeNull();
  } finally {
    await ui.close();
  }
});

it("is one column under 1024 px: a banner, the story, and In the scene and the journal as panels", async () => {
  widthOf(800);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const ui = await mount();
  try {
    expect(ui.host.querySelector(".play-view--narrow")).not.toBeNull();
    expect(ui.host.querySelector(".play-view__scene--banner")).not.toBeNull();
    expect(ui.host.querySelector(".play-view__right")).toBeNull();
    expect(ui.host.querySelector(".play-do")).not.toBeNull();

    const panels = Array.from(
      ui.host.querySelectorAll<HTMLButtonElement>(".play-view__panels button"),
    );
    expect(panels.map((b) => b.textContent)).toEqual(["In the scene", "Journal"]);
    await act(async () => panels[0]!.click());
    const panel = document.querySelector('dialog[aria-label="In the scene"]')!;
    expect(panel.querySelector(".play-scene")).not.toBeNull();
    // In a panel it is not folded and has no button for folding.
    expect(panel.querySelector(".play-scene__fold")).toBeNull();
    await act(async () => panel.querySelector<HTMLButtonElement>(".sb-icon")!.click());
    expect(document.querySelector('dialog[aria-label="In the scene"]')).toBeNull();

    await act(async () => panels[1]!.click());
    expect(document.querySelector('dialog[aria-label="Journal"]')).not.toBeNull();
  } finally {
    await ui.close();
  }
});

it("opens the journal from the top row or from What you know, and closes it again", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const ui = await mount();
  try {
    const open = Array.from(ui.host.querySelectorAll<HTMLButtonElement>(".play-top__journal"));
    expect(open).toHaveLength(1);
    expect(document.querySelector('dialog[aria-label="Journal"]')).toBeNull();
    await act(async () => open[0]!.click());
    expect(document.querySelector('dialog[aria-label="Journal"]')).not.toBeNull();
    await act(async () =>
      document.querySelector<HTMLButtonElement>('dialog[aria-label="Journal"] .sb-icon')!.click(),
    );
    expect(document.querySelector('dialog[aria-label="Journal"]')).toBeNull();

    const link = Array.from(ui.host.querySelectorAll<HTMLButtonElement>(".play-scene button")).find(
      (b) => b.textContent === "See everything in the journal",
    )!;
    await act(async () => link.click());
    expect(document.querySelector('dialog[aria-label="Journal"]')).not.toBeNull();
  } finally {
    await ui.close();
  }
});

it("stays in the scene and says so when saving on the way out fails", async () => {
  const onHome = vi.fn();
  saveFails = true;
  const ui = await mount({ onHome });
  try {
    await act(async () => ui.host.querySelector<HTMLButtonElement>(".play-top__home")!.click());
    expect(onHome).not.toHaveBeenCalled();
    expect(ui.host.textContent).toContain("Saving is unavailable");
  } finally {
    await ui.close();
  }
});

it("goes back to the overview from the first button, which waits while a reply is being written", async () => {
  const onHome = vi.fn();
  const ui = await mount({ onHome });
  try {
    const home = ui.host.querySelector<HTMLButtonElement>(".play-top__home")!;
    expect(home.textContent).toBe("To overview");
    await act(async () => home.click());
    // The scene is saved first, then the overview opens.
    expect(saveEncounter).toHaveBeenCalledOnce();
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
    expect(left.querySelector(".play-person__name")!.textContent).toBe("Edda");
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

function addLines() {
  const conversation = session.conversation as Record<string, unknown>[];
  conversation.push(
    { turn: 2, role: "player", content: "Ask Edda about the messenger" },
    { turn: 3, role: "character", toldBy: "narrator", content: "Edda points to the north path." },
    { turn: 4, role: "player", content: "Look around" },
    { turn: 5, role: "character", toldBy: "narrator", content: "The square is quiet." },
  );
}
const ideaText = () =>
  Array.from(document.querySelectorAll("dialog textarea, dialog input")).map(
    (field) => (field as HTMLTextAreaElement).value,
  );

it("keeps one line of the story as an idea, with just that line", async () => {
  addLines();
  const ui = await mount();
  try {
    const row = Array.from(ui.host.querySelectorAll(".play-row--narrator")).find((r) =>
      r.textContent?.includes("Edda points to the north path."),
    )!;
    await act(async () => {
      row.querySelector<HTMLButtonElement>('[aria-label="Save this line as an idea"]')!.click();
    });
    const shown = ideaText().join("\n");
    expect(shown).toContain("Edda points to the north path.");
    expect(shown).not.toContain("The square is quiet.");
    expect(shown).not.toContain("Ask Edda about the messenger");
  } finally {
    await ui.close();
  }
});

it("keeps the last three lines as an idea from the main button in the top row", async () => {
  addLines();
  const ui = await mount();
  try {
    const button = ui.host.querySelector<HTMLButtonElement>(".play-top__idea")!;
    expect(button.textContent).toBe("Save idea");
    expect(button.className).toContain("ui-button--idea");
    await act(async () => button.click());
    const shown = ideaText().join("\n");
    expect(shown).toContain("Edda points to the north path.");
    expect(shown).toContain("Look around");
    expect(shown).toContain("The square is quiet.");
    expect(shown).not.toContain("Ask Edda about the messenger");
  } finally {
    await ui.close();
  }
});

it("folds the whole left column to a strip, and the frame follows", async () => {
  const ui = await mount();
  try {
    const frame = ui.host.querySelector(".play-view")!;
    expect(frame.classList.contains("play-view--collapsed")).toBe(false);
    await act(async () =>
      ui.host.querySelector<HTMLButtonElement>(".play-people__toggle")!.click(),
    );
    expect(frame.classList.contains("play-view--collapsed")).toBe(true);
    expect(localStorage.getItem("explore-play-left-collapsed")).toBe("1");
  } finally {
    await ui.close();
  }
});

const marksOf = (host: HTMLElement, selector: string) =>
  host.querySelector(selector)?.getAttribute("data-orn-set");

it("uses the ornament parts, drawn plain without ornaments, so the view looks as before", async () => {
  const ui = await mount();
  try {
    for (const selector of [
      ".play-view__scene",
      ".play-person",
      ".play-story",
      ".play-view__right",
      ".play-person__name",
      ".play-do__title",
      ".play-row--divider",
    ])
      expect(marksOf(ui.host, selector), selector).toBe("plain");
    expect(ui.host.querySelector(".sb-themed-play")!.getAttribute("style") ?? "").not.toContain(
      "data:image",
    );
  } finally {
    await ui.close();
  }
});

it("draws the parts in the set of the theme, with the pictures made from its colours", async () => {
  activeTheme = {
    backgroundMode: "none",
    background: "#14110d",
    panel: "#211b14",
    accent: "#c9a24a",
    ornament: "forged",
    ornamentLevel: "full",
    headingFont: "cinzel",
  };
  const ui = await mount();
  try {
    for (const selector of [
      ".play-view__scene",
      ".play-person",
      ".play-story",
      ".play-view__right",
      ".play-person__name",
      ".play-do__title",
      ".play-row--divider",
      ".play-do__suggestion",
    ])
      expect(marksOf(ui.host, selector), selector).toBe("forged");
    const style = ui.host.querySelector<HTMLElement>(".sb-themed-play")!;
    expect(style.style.getPropertyValue("--ornament")).toBe("#c9a24a");
    expect(style.style.getPropertyValue("--ornament-frame")).toContain("data:image/svg+xml");
    expect(style.style.getPropertyValue("--heading-font")).toContain("Cinzel");
  } finally {
    await ui.close();
  }
});

const fantasyTheme = {
  backgroundMode: "none",
  background: "#101217",
  panel: "#1a1d24",
  accent: "#c9a66b",
  ornament: "forged",
  ornamentLevel: "full",
  headingFont: "cinzel",
};
const WHERE = [
  ".play-view__scene",
  ".play-person",
  ".play-story",
  ".play-view__right",
  ".play-do__title",
];

it("draws plain frames in a theme with ornaments when the player has chosen simple frames", async () => {
  activeTheme = fantasyTheme;
  simpleFrames = true;
  const ui = await mount();
  try {
    for (const selector of WHERE) expect(marksOf(ui.host, selector), selector).toBe("plain");
    const style = ui.host.querySelector<HTMLElement>(".sb-themed-play")!.style;
    expect(style.getPropertyValue("--ornament-frame")).toBe("none");
  } finally {
    await ui.close();
  }
});

for (const [name, query] of [
  ["less motion", "reduced-motion"],
  ["more contrast", "prefers-contrast"],
] as const)
  it(`draws plain frames by itself when the system asks for ${name}`, async () => {
    activeTheme = fantasyTheme;
    const asks = (q: string) => ({
      matches: q.includes(query),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    });
    Object.defineProperty(window, "matchMedia", { value: asks, configurable: true });
    const ui = await mount();
    try {
      for (const selector of WHERE) expect(marksOf(ui.host, selector), selector).toBe("plain");
    } finally {
      await ui.close();
    }
  });
