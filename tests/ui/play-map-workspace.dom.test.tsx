import { innVisitExample } from "../../src/scenarios/innVisit";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { newRulesetTemplate } from "../../src/library/LibrarySchema";
import { syncAdventure } from "../../src/library/sceneSync";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { adventureOptions } from "../../src/game/AdventureEngine";
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
  useAppearance: () => ({ library: { active: { backgroundMode: "scene" } } }),
  playThemeStyle: () => ({}),
}));
vi.mock("../../src/ui/audio/GameAudio", () => ({ GameAudio: () => null }));

it("adds the real map to the right sidebar during Free Play while keeping the conversation and avoiding dice tools", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const f = playMapFixture();
  session = f.session;
  const repo = new IndexedDBRepository(new IDBFactory(), "map-workspace");
  await repo.saveRealm(f.world);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(
        <PlayWorkspace repo={repo} onHome={() => {}} onAppearance={() => {}} onIdeas={() => {}} />,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(host.querySelector("[data-chat]")).not.toBeNull();
    expect(host.querySelector("aside.sb-game-toolbox .play-map-card")).not.toBeNull();
    expect(host.querySelector(".sb-themed-play--rules")).not.toBeNull();
    expect(host.textContent).toContain("Riverside");
    expect(host.textContent).not.toContain("Roll the dice");
    expect(host.textContent).not.toContain("Secret hideout");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("shows the real inn floor map and switches the encounter backdrop when entering its store room", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = innVisitExample(),
    engine = new StateEngine(
      startPlayableCampaign(
        built.campaign,
        built.campaign.scenes[0]!,
        built.places,
        "inn-backdrop",
        [built.realm],
      ),
      new EventLog(),
    );
  session = engine.getSession();
  const repo = new IndexedDBRepository(new IDBFactory(), "inn-backdrop-ui"),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = async () => {
    session = engine.getSession();
    await act(async () => {
      root.render(
        <PlayWorkspace repo={repo} onHome={() => {}} onAppearance={() => {}} onIdeas={() => {}} />,
      );
    });
  };
  const go = (label: string) => {
    const s = engine.getSession();
    engine.transitionAdventure({
      id: crypto.randomUUID(),
      linkId: adventureOptions(s).find((o) => o.label === label)!.id,
      expectedStateVersion: s.stateVersion,
    });
  };
  try {
    await render();
    go("Enter the inn");
    await render();
    // The map is on request: "Show map" opens it in a panel.
    expect(host.querySelector(".play-map-card")).toBeNull();
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
    };
    await act(async () =>
      Array.from(host.querySelectorAll("aside button"))
        .find((b) => b.textContent === "Show map")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(host.querySelector("dialog .play-map-card")).not.toBeNull();
    expect(host.querySelector(".play-view__scene .chat-log__backdrop img")).not.toBeNull();
    const warm = host.querySelector(".chat-log__backdrop img")!.getAttribute("src");
    for (const action of [
      { kind: "interaction", interactionId: "take-key" },
      { kind: "interact", barrierId: built.storeDoorId, operation: "unlock" },
      { kind: "interact", barrierId: built.storeDoorId, operation: "open" },
    ] as const) {
      const s = engine.getSession();
      engine.executeEncounterAction({
        id: crypto.randomUUID(),
        expectedSceneId: s.sceneId!,
        expectedRevision: s.encounter!.state.revision,
        action,
      });
    }
    go("Go to store room");
    await render();
    expect(host.querySelector(".chat-log__backdrop img")!.getAttribute("src")).not.toBe(warm);
    expect(host.querySelector('[aria-label="Your location: Store room"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("keeps the engine panel, not the chat's dice panel, when the adventure has a rule-set", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample();
  const set = newRulesetTemplate({
    name: "Classic",
    source: "player",
    attributes: [{ id: "str", name: "Strength", kind: "number", min: 1, max: 18 }] as never,
  });
  const campaign = syncAdventure(
    { ...structuredClone(built.campaign), rulesetId: set.id },
    { characters: built.characters, objects: built.objects, places: built.places, rulesets: [set] },
  );
  session = startPlayableCampaign(
    campaign,
    campaign.scenes[0]!,
    built.places,
    "with-rules",
    [built.realm],
    {
      characters: built.characters,
      rulesets: [set],
    },
  );
  const repo = new IndexedDBRepository(new IDBFactory(), "rules-panel"),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(
        <PlayWorkspace repo={repo} onHome={() => {}} onAppearance={() => {}} onIdeas={() => {}} />,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(session.ruleset?.name).toBe("Classic");
    expect(host.querySelector('textarea[aria-label="Say something"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Roll the dice");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
