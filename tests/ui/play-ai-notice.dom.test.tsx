// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PlayWorkspace } from "../../src/ui/home/PlayWorkspace";
import { playMapFixture } from "../fixtures/play-map";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";

let session: ReturnType<typeof playMapFixture>["session"];
let layout: "wide" | "narrow" = "wide";
vi.mock("../../src/ui/EngineStore", () => ({
  useEngine: () => ({ useSession: () => session, phase: "idle", setOllamaModel: () => {} }),
}));
vi.mock("../../src/ui/components/ChatPanel", () => ({
  ChatPanel: () => <div>Conversation</div>,
}));
vi.mock("../../src/ui/components/EncounterPanel", () => ({
  EncounterPanel: () => <div data-encounter="true">Encounter</div>,
}));
vi.mock("../../src/ui/connection/ConnectionProvider", () => ({
  useConnection: () => ({ discovery: {}, refresh: () => {}, chooseModel: () => {} }),
}));
vi.mock("../../src/ui/connection/connection", () => ({ modelReadiness: () => "unavailable" }));
vi.mock("../../src/ui/connection/ConnectionHelp", () => ({
  ConnectionHelp: () => <p data-help="true">Connection settings</p>,
}));
vi.mock("../../src/ui/play/usePlayLayout", () => ({ usePlayLayout: () => layout }));
vi.mock("../../src/ui/themes/ThemeProvider", () => ({
  useAppearance: () => ({ library: { active: { background: "#ffffff" } } }),
  playThemeStyle: () => ({}),
}));
vi.mock("../../src/ui/audio/GameAudio", () => ({ GameAudio: () => null }));

async function inEncounter(size: typeof layout) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  }
  layout = size;
  const f = playMapFixture();
  session = { ...f.session, encounter: { definition: { title: "A test" } } } as never;
  const repo = new IndexedDBRepository(new IDBFactory(), "ai-notice-" + size);
  const host = document.createElement("div");
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
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it("shows the AI notice during an encounter when AI is missing, and its button opens the connection settings", async () => {
  const ui = await inEncounter("wide");
  try {
    expect(ui.host.querySelector("[data-encounter]")).not.toBeNull();
    const notice = ui.host.querySelector(".sb-play-connection")!;
    expect(notice).not.toBeNull();
    expect(notice.classList.contains("sb-play-connection--compact")).toBe(false);
    expect(notice.textContent).toContain("AI is unavailable. Connect it");
    const button = notice.querySelector("button")!;
    expect(button.textContent).toBe("Set up AI");
    await act(async () => button.click());
    expect(document.querySelector("[data-help]")).not.toBeNull();
  } finally {
    await ui.close();
  }
});

it("keeps the notice to one short row in a narrow window, with the button still there", async () => {
  const ui = await inEncounter("narrow");
  try {
    const notice = ui.host.querySelector(".sb-play-connection")!;
    expect(notice.classList.contains("sb-play-connection--compact")).toBe(true);
    expect(notice.textContent).toContain("AI is not connected.");
    expect(notice.querySelector("button")?.textContent).toBe("Set up AI");
  } finally {
    await ui.close();
  }
});
