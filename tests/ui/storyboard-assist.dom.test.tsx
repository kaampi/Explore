// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyPatch } from "../../src/library/authoringPatch";
import type { CampaignTemplate } from "../../src/library/LibrarySchema";
import { PlayableStoryboard } from "../../src/ui/studio/PlayableStoryboard";
import { JUST_ADDED_MS } from "../../src/ui/studio/useStoryboardAssist";
import {
  continueProposals,
  deepenProposals,
  places,
  sketchAdventure,
} from "../fixtures/authoring-sketch";
import { createFakeAssist } from "./fakeAssistPanel";

let host: HTMLElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const board = () => host.querySelector<HTMLElement>(".storyboard-board")!;
const proposalScenes = () =>
  Array.from(host.querySelectorAll<HTMLElement>("[data-proposal-scene]"));
const proposalLinks = () => Array.from(host.querySelectorAll<SVGElement>("[data-proposal-link]"));
const realCard = (id: string) => board().querySelector<HTMLElement>(`[data-scene-id="${id}"]`);
const button = (text: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text));
const status = () => host.querySelector(".storyboard-assist__status")?.textContent;

type Fake = ReturnType<typeof createFakeAssist>;

async function mount(
  options: {
    fake?: Fake | null;
    saved?: () => CampaignTemplate;
    reload?: (() => Promise<CampaignTemplate>) | null;
    /** Makes saving fail, as a database that is full or busy would. */
    failSave?: boolean;
  } = {},
) {
  const sketch = sketchAdventure();
  const fake = options.fake === undefined ? createFakeAssist() : options.fake;
  const changes: CampaignTemplate[] = [];
  /** The database: what is saved. The studio saves into it, and the help reads from it. */
  const db = { data: structuredClone(sketch.campaign) as CampaignTemplate };
  const reload = vi.fn(
    options.reload === undefined
      ? async () => options.saved?.() ?? structuredClone(db.data)
      : (options.reload ?? (async () => structuredClone(db.data))),
  );
  const saveFirst = vi.fn(async (next?: CampaignTemplate) => {
    if (options.failSave) return null;
    db.data = structuredClone(next ?? current);
    return structuredClone(db.data);
  });
  let current = sketch.campaign;
  function Harness() {
    const [campaign, setCampaign] = useState(sketch.campaign);
    current = campaign;
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={places}
        characters={[]}
        objects={sketch.library.objects}
        busy={false}
        onChange={(next) => {
          changes.push(next);
          setCampaign(next);
        }}
        onPlay={() => {}}
        {...(fake ? { renderAssist: fake.renderAssist } : {})}
        {...(options.reload === null ? {} : { reloadCampaign: reload })}
        saveFirst={saveFirst}
        onSave={() => void saveFirst()}
      />
    );
  }
  await act(async () => root.render(<Harness />));
  // Choose the tower, which is the first scene and so already chosen.
  return { ...sketch, fake, changes, reload, saveFirst, db, campaign: () => current };
}

const contextMenu = async (element: Element) =>
  act(async () => {
    element.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }),
    );
  });
const menuRows = () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));

describe("the ways in", () => {
  it("shows none when there is no panel to open", async () => {
    await mount({ fake: null });
    expect(host.querySelector(".storyboard-assist")).toBeNull();
    expect(button("✦")).toBeUndefined();
    const { tower } = sketchAdventure();
    await contextMenu(board().querySelector(`[data-scene-id="${tower}"]`)!);
    expect(menuRows().length).toBeGreaterThan(0);
    expect(menuRows().some((row) => row.textContent?.includes("✦"))).toBe(false);
  });

  it("puts the scene's name, Deepen, Continue from here and ⋯ in the toolbar", async () => {
    const { fake, tower } = await mount();
    const group = host.querySelector<HTMLElement>(".storyboard-assist")!;
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("AI help for Watchtower");
    expect(group.querySelector(".storyboard-assist__name")!.textContent).toBe("Watchtower:");
    expect(Array.from(group.querySelectorAll("button")).map((b) => b.textContent)).toEqual([
      "✦ Deepen",
      "✦ Continue from here",
      "⋯",
    ]);
    expect(group.querySelector('[aria-label="More for this scene"]')).not.toBeNull();
    await act(async () => button("✦ Continue from here")!.click());
    expect(fake!.state.opened).toEqual([
      { campaignId: "adv", intent: "continue", target: { sceneId: tower } },
    ]);
  });

  it("opens the same two choices from the right-click menu on a scene, and Continue on a route", async () => {
    const { fake, tower, hall } = await mount();
    await contextMenu(board().querySelector(`[data-scene-id="${hall}"]`)!);
    expect(
      menuRows()
        .slice(0, 2)
        .map((row) => row.textContent),
    ).toEqual(["✦ Deepen", "✦ Continue from here"]);
    await act(async () => menuRows()[0]!.click());
    expect(fake!.state.opened.at(-1)).toMatchObject({
      intent: "deepen",
      target: { sceneId: hall },
    });
    await fake!.close({ changed: false, newSceneIds: [] });

    const route = board().querySelector<SVGElement>("[data-link-id]")!;
    await contextMenu(route);
    const rows = menuRows().map((row) => row.textContent);
    expect(rows[0]).toBe("✦ Continue from here");
    expect(rows).not.toContain("✦ Deepen");
    await act(async () => menuRows()[0]!.click());
    expect(fake!.state.opened.at(-1)).toMatchObject({
      intent: "continue",
      target: { linkId: route.dataset.linkId },
    });
    void tower;
  });

  it("is reached from the keyboard: the buttons are tab stops, and the menu opens on a focused card", async () => {
    const { fake, tower } = await mount();
    const deepen = button("✦ Deepen")!;
    expect(deepen.disabled).toBe(false);
    expect(deepen.tabIndex).toBeGreaterThanOrEqual(0);
    deepen.focus();
    expect(document.activeElement).toBe(deepen);

    const card = board().querySelector<HTMLElement>(`[data-scene-id="${tower}"]`)!;
    card.focus();
    expect(card.tabIndex).toBe(0);
    await contextMenu(card);
    // The menu takes the focus, on its first row, and the arrow keys and Enter work on it.
    expect(document.activeElement).toBe(menuRows()[0]);
    const menu = document.querySelector('[role="menu"]')!;
    await act(async () => {
      menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(document.activeElement!.textContent).toBe("✦ Continue from here");
    // Enter on a button is a click.
    await act(async () => (document.activeElement as HTMLElement).click());
    expect(fake!.state.opened.at(-1)).toMatchObject({
      intent: "continue",
      target: { sceneId: tower },
    });
  });
});

describe("the preview", () => {
  it("draws what is proposed dashed, with a letter, and chosen and not chosen look different", async () => {
    const { fake, tower } = await mount();
    await act(async () => button("✦ Continue from here")!.click());
    const proposals = continueProposals(tower).map((p) => ({ ...p, selected: p.key !== "B" }));
    await fake!.preview({ proposals });
    const scenes = proposalScenes();
    expect(scenes.map((el) => el.dataset.proposalKey)).toEqual(["A", "C", "B"]);
    expect(
      scenes.map((el) => el.querySelector(".storyboard-card__proposal-key")!.textContent),
    ).toEqual(["A", "C", "B"]);
    const chosen = scenes.filter((el) => el.classList.contains("is-chosen"));
    expect(chosen.map((el) => el.dataset.proposalKey)).toEqual(["A", "C"]);
    expect(
      scenes.find((el) => el.dataset.proposalKey === "B")!.classList.contains("is-unchosen"),
    ).toBe(true);
    // Two new routes for each, drawn dashed in the same two ways.
    expect(proposalLinks()).toHaveLength(6);
    const lines = proposalLinks().map((g) => g.querySelector("path")!.getAttribute("class")!);
    expect(lines.filter((c) => c.includes("is-chosen"))).toHaveLength(4);
    expect(lines.filter((c) => c.includes("is-unchosen"))).toHaveLength(2);
    // None of it is for a screen reader. The count is, in a line that is read when it changes.
    for (const el of [...scenes, ...proposalLinks()])
      expect(el.getAttribute("aria-hidden")).toBe("true");
    const live = host.querySelector(".storyboard-assist__status")!;
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("3 proposals shown, 2 chosen");
    // The scenes that were there are dimmed, but the one being helped is not.
    expect(realCard(tower)!.classList.contains("is-dimmed-by-assist")).toBe(false);
    const others = Array.from(board().querySelectorAll<HTMLElement>("[data-scene-id]")).filter(
      (el) => el.dataset.sceneId !== tower,
    );
    expect(others.length).toBe(2);
    for (const el of others) expect(el.classList.contains("is-dimmed-by-assist")).toBe(true);
  });

  it("lifts the proposal the pointer is over", async () => {
    const { fake, tower } = await mount();
    await act(async () => button("✦ Continue from here")!.click());
    await fake!.preview({ proposals: continueProposals(tower), hoverKey: "B" });
    const hovered = (key: string) =>
      host.querySelector(`[data-proposal-key="${key}"]`)!.classList.contains("is-hovered");
    expect([hovered("A"), hovered("B"), hovered("C")]).toEqual([false, true, false]);
    await fake!.preview({ proposals: continueProposals(tower), hoverKey: "C" });
    expect([hovered("A"), hovered("B"), hovered("C")]).toEqual([false, false, true]);
    const linePaths = proposalLinks().map((g) => g.querySelector("path")!.getAttribute("class")!);
    expect(linePaths.filter((c) => c.includes("is-hovered"))).toHaveLength(2);
  });

  it("is replaced by the next preview, and gone with null, and nothing is saved", async () => {
    const { fake, tower, changes, campaign, reload } = await mount();
    const before = campaign();
    await act(async () => button("✦ Continue from here")!.click());
    await fake!.preview({ proposals: continueProposals(tower) });
    expect(proposalScenes()).toHaveLength(3);
    await fake!.preview({ proposals: continueProposals(tower).slice(0, 1) });
    expect(proposalScenes().map((el) => el.dataset.proposalKey)).toEqual(["A"]);
    expect(status()).toBe("1 proposal shown, 0 chosen");
    await fake!.preview(null);
    expect(proposalScenes()).toHaveLength(0);
    expect(proposalLinks()).toHaveLength(0);
    expect(status()).toBe("");
    expect(board().querySelectorAll(".is-dimmed-by-assist")).toHaveLength(0);
    expect(changes).toEqual([]);
    expect(campaign()).toBe(before);
    expect(reload).not.toHaveBeenCalled();
  });

  it("marks a scene that gets more, with what it gets", async () => {
    const { fake, hall } = await mount();
    await act(async () => button("✦ Deepen")!.click());
    // The panel is helping with the tower; the hall is a scene a proposal adds to.
    await fake!.preview({ proposals: deepenProposals(hall) });
    const mark = host.querySelector<HTMLElement>(`[data-proposal-mark="${hall}"]`)!;
    expect(mark.textContent).toBe("+2 actions · +1 item");
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(proposalScenes()).toHaveLength(0);
    // The scene with a mark is part of the proposal, so it is not dimmed.
    expect(realCard(hall)!.classList.contains("is-dimmed-by-assist")).toBe(false);
    await fake!.preview({
      proposals: deepenProposals(hall).map((p) => ({ ...p, selected: p.key === "1" })),
    });
    expect(host.querySelector(`[data-proposal-mark="${hall}"] `)!.className).toContain("is-chosen");
  });

  it("puts the proposals beside the scene they grow from, on the grid, without covering anything", async () => {
    const { fake, tower } = await mount();
    await act(async () => button("✦ Continue from here")!.click());
    await fake!.preview({ proposals: continueProposals(tower) });
    const rects = Array.from(
      board().querySelectorAll<HTMLElement>("[data-scene-id],[data-proposal-scene]"),
    ).map((el) => ({
      x: parseFloat(el.style.left),
      y: parseFloat(el.style.top),
      w: parseFloat(el.style.width),
      h: parseFloat(el.style.height),
    }));
    expect(rects).toHaveLength(6);
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        expect(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y).toBe(
          false,
        );
      }
  });
});

describe("closing", () => {
  it("takes the preview away and leaves the adventure as it was, when nothing was saved", async () => {
    const { fake, tower, changes, campaign, reload } = await mount();
    const before = campaign();
    await act(async () => button("✦ Continue from here")!.click());
    await fake!.preview({ proposals: continueProposals(tower) });
    await fake!.close({ changed: false, newSceneIds: [] });
    expect(proposalScenes()).toHaveLength(0);
    expect(host.querySelector("[data-assist-panel]")).toBeNull();
    expect(changes).toEqual([]);
    expect(campaign()).toBe(before);
    expect(reload).not.toHaveBeenCalled();
    expect(fake!.state.unmounted).toBe(1);
  });

  it("shows what was saved, in the places the preview showed it, with no dashed mark left", async () => {
    const sketch = sketchAdventure();
    const chosen = continueProposals(sketch.tower).filter((p) => p.key !== "B");
    const saved = applyPatch(sketch.campaign, sketch.library, {
      ops: chosen.flatMap((p) => p.patch.ops),
    });
    const { fake, tower } = await mount({ saved: () => saved.campaign });
    await act(async () => button("✦ Continue from here")!.click());
    await fake!.preview({
      proposals: continueProposals(tower).map((p) => ({ ...p, selected: p.key !== "B" })),
    });
    // Where each proposal is, measured from the tower's card: the edge of the board moves when
    // the unchosen proposals go, but nothing moves in relation to the tower.
    const fromTower = (el: HTMLElement) => {
      const origin = realCard(tower)!;
      return [
        parseFloat(el.style.left) - parseFloat(origin.style.left),
        parseFloat(el.style.top) - parseFloat(origin.style.top),
      ];
    };
    const seen = new Map(
      proposalScenes().map((el) => [
        el.querySelector(".storyboard-card__name")!.textContent,
        fromTower(el),
      ]),
    );
    // Watch every state the screen is in on the way: the preview must give way to the saved
    // scenes in one go.
    const states: string[] = [];
    const roofId = saved.newSceneIds[0]!;
    const watch = new MutationObserver(() =>
      states.push(
        `${proposalScenes().length ? "preview" : "no preview"}/${realCard(roofId) ? "saved" : "not saved"}`,
      ),
    );
    watch.observe(host, { childList: true, subtree: true, attributes: true });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await fake!.close({
      changed: true,
      newSceneIds: saved.newSceneIds,
      focus: { sceneId: roofId },
    });
    await act(async () => {});
    watch.disconnect();
    expect(proposalScenes()).toHaveLength(0);
    expect(proposalLinks()).toHaveLength(0);
    expect(host.querySelector("[data-assist-panel]")).toBeNull();
    expect(new Set(states)).not.toContain("no preview/not saved");
    expect(new Set(states)).not.toContain("preview/saved");
    // The saved scenes stand where the preview put them.
    for (const id of saved.newSceneIds) {
      const card = realCard(id)!;
      const name = card.querySelector(".storyboard-card__name")!.textContent;
      expect(fromTower(card)).toEqual(seen.get(name));
    }
    // And the one in focus is chosen, and lit up for a few seconds.
    expect(realCard(roofId)!.classList.contains("is-selected")).toBe(true);
    expect(realCard(roofId)!.classList.contains("is-just-added")).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(JUST_ADDED_MS + 50);
    });
    expect(realCard(roofId)!.classList.contains("is-just-added")).toBe(false);
    expect(board().querySelectorAll(".is-dimmed-by-assist")).toHaveLength(0);
  });

  it("closes only once, however many times the panel says so", async () => {
    const { fake, tower, reload } = await mount();
    await act(async () => button("✦ Continue from here")!.click());
    await fake!.preview({ proposals: continueProposals(tower) });
    const props = fake!.state.props!;
    await act(async () => {
      props.onClose({ changed: true, newSceneIds: [] });
      props.onClose({ changed: true, newSceneIds: [] });
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("while the panel is open", () => {
  async function drag(card: HTMLElement, dx: number, dy: number) {
    card.setPointerCapture = () => {};
    const x = parseFloat(card.style.left) + 20;
    const y = parseFloat(card.style.top) + 20;
    await act(async () =>
      card.dispatchEvent(
        new MouseEvent("pointerdown", { button: 0, bubbles: true, clientX: x, clientY: y }),
      ),
    );
    await act(async () =>
      board().dispatchEvent(
        new MouseEvent("pointermove", { bubbles: true, clientX: x + dx, clientY: y + dy }),
      ),
    );
    await act(async () => board().dispatchEvent(new MouseEvent("pointerup", { bubbles: true })));
  }

  it("cannot move a scene, draw a route, or arrange, and the connect handle is off", async () => {
    const { fake, hall, changes, tower } = await mount();
    await act(async () => button("✦ Continue from here")!.click());
    await fake!.preview({ proposals: continueProposals(tower) });
    const card = realCard(hall)!;
    const handle = card.querySelector<HTMLButtonElement>(".storyboard-card__port")!;
    expect(handle.disabled).toBe(true);
    const select = card.querySelector<HTMLSelectElement>(".storyboard-card__chapter")!;
    expect(select.disabled).toBe(true);
    expect(button("Arrange")!.disabled).toBe(true);
    const count = changes.length;
    await drag(card, 80, 40);
    expect(changes.length).toBe(count);
    // The way that is open shows as pressed; the other way is off.
    expect(button("✦ Continue from here")!.getAttribute("aria-pressed")).toBe("true");
    expect(button("✦ Deepen")!.disabled).toBe(true);
    // After it closes, it all works again.
    await fake!.close({ changed: false, newSceneIds: [] });
    expect(
      realCard(hall)!.querySelector<HTMLButtonElement>(".storyboard-card__port")!.disabled,
    ).toBe(false);
    expect(button("Arrange")!.disabled).toBe(false);
    await drag(realCard(hall)!, 80, 40);
    expect(changes.length).toBeGreaterThan(count);
  });
});

async function dragTo(card: HTMLElement, dx: number, dy: number) {
  card.setPointerCapture = () => {};
  const x = parseFloat(card.style.left) + 20;
  const y = parseFloat(card.style.top) + 20;
  await act(async () =>
    card.dispatchEvent(
      new MouseEvent("pointerdown", { button: 0, bubbles: true, clientX: x, clientY: y }),
    ),
  );
  await act(async () =>
    board().dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: x + dx, clientY: y + dy }),
    ),
  );
  await act(async () => board().dispatchEvent(new MouseEvent("pointerup", { bubbles: true })));
}

describe("review 2 of the contract (#78)", () => {
  it("keeps the author's unsaved move of a card and the scene the panel saved, together", async () => {
    const sketch = sketchAdventure();
    // The saved adventure: the same as the sketch, with the continue scenes added and the hall where it was.
    const saved = applyPatch(sketch.campaign, sketch.library, {
      ops: continueProposals(sketch.tower)[0]!.patch.ops,
    }).campaign;
    const { fake, hall, tower, campaign } = await mount({ saved: () => saved });
    const card = realCard(hall)!;
    await dragTo(card, 120, 80);
    const moved = campaign().scenes.find((scene) => scene.id === hall)!.position;
    expect(moved).toBeDefined();
    expect(moved).not.toEqual(sketch.campaign.scenes.find((scene) => scene.id === hall)!.position);

    await act(async () => button("✦ Continue from here")!.click());
    await fake!.preview({
      proposals: continueProposals(tower)
        .slice(0, 1)
        .map((p) => ({ ...p, selected: true })),
    });
    const added = saved.scenes
      .map((scene) => scene.id)
      .filter((id) => !sketch.campaign.scenes.some((item) => item.id === id));
    await fake!.close({ changed: true, newSceneIds: added });
    await act(async () => {});
    // The move stays, and the new scene is there.
    expect(campaign().scenes.find((scene) => scene.id === hall)!.position).toEqual(moved);
    expect(campaign().scenes.some((scene) => scene.name === "The roof")).toBe(true);
  });

  it("does not let an earlier panel change a later one: a late preview or close is ignored", async () => {
    const { fake, tower, hall } = await mount();
    await act(async () => button("✦ Continue from here")!.click());
    const first = fake!.state.props!;
    await act(async () => first.onClose({ changed: false, newSceneIds: [] }));
    await act(async () => button("✦ Deepen")!.click());
    expect(fake!.state.opened.at(-1)).toMatchObject({
      intent: "deepen",
      target: { sceneId: tower },
    });
    await fake!.preview({ proposals: deepenProposals(hall) });
    expect(host.querySelector("[data-proposal-mark]")).not.toBeNull();
    // The earlier panel says it is done, twice, and clears the preview.
    await act(async () => {
      first.onPreview(null);
      first.onClose({ changed: true, newSceneIds: [] });
      first.onClose({ changed: true, newSceneIds: [] });
    });
    expect(host.querySelector("[data-proposal-mark]")).not.toBeNull();
    expect(host.querySelector("[data-assist-panel]")).not.toBeNull();
    expect(fake!.state.props!.request.intent).toBe("deepen");
  });

  it("keeps the saved scenes and asks to read again when the reread fails, and does not save twice", async () => {
    const sketch = sketchAdventure();
    const saved = applyPatch(sketch.campaign, sketch.library, {
      ops: continueProposals(sketch.tower)[0]!.patch.ops,
    }).campaign;
    let fail = true;
    const reload = vi.fn(async () => {
      if (fail) throw new Error("disk busy");
      return saved;
    });
    const { fake, tower, changes } = await mount({ reload });
    await act(async () => button("✦ Continue from here")!.click());
    await fake!.preview({
      proposals: continueProposals(tower)
        .slice(0, 1)
        .map((p) => ({ ...p, selected: true })),
    });
    await fake!.close({
      changed: true,
      newSceneIds: saved.scenes
        .map((s) => s.id)
        .filter((id) => !sketch.campaign.scenes.some((s) => s.id === id)),
    });
    await act(async () => {});
    expect(host.querySelector("[data-assist-panel]")).toBeNull();
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("The changes were saved but could not be read");
    const retry = button("Read again");
    expect(retry).toBeDefined();
    const before = changes.length;
    fail = false;
    await act(async () => retry!.click());
    await act(async () => {});
    expect(reload).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(changes.length).toBeGreaterThan(before);
    expect(host.querySelector(`[data-scene-id="${saved.scenes.at(-1)!.id}"]`)).not.toBeNull();
  });

  it("gives no way in when the panel has no way to read the adventure again", async () => {
    const fake = createFakeAssist();
    await mount({ fake, reload: null });
    expect(host.querySelector(".storyboard-assist")).toBeNull();
    expect(button("✦ Deepen")).toBeUndefined();
  });
});

describe("merging what the panel saved with the author's unsaved work", () => {
  it("keeps a moved card and adds the panel's scene; a scene changed both ways is reported", async () => {
    const { mergeSaved } = await import("../../src/ui/studio/useStoryboardAssist");
    const sketch = sketchAdventure();
    const base = sketch.campaign;
    // The author moved the hall and renamed the tower.
    const local = {
      ...base,
      scenes: base.scenes.map((scene) =>
        scene.id === sketch.hall
          ? { ...scene, position: { x: 999, y: 111 } }
          : scene.id === sketch.tower
            ? { ...scene, name: "Renamed by hand" }
            : scene,
      ),
    };
    // The panel added a scene to the hall and to the tower.
    const saved = applyPatch(base, sketch.library, {
      ops: [
        { op: "addAction", sceneId: sketch.hall, label: "Warm your hands", outcome: "Cold." },
        { op: "addAction", sceneId: sketch.tower, label: "Look", outcome: "Wind." },
      ],
    }).campaign;
    const { campaign, conflicts } = mergeSaved(local, base, saved);
    const newHall = campaign.scenes.find((scene) => scene.id === sketch.hall)!;
    expect(newHall.position).toEqual({ x: 999, y: 111 });
    expect(newHall.encounter!.definition.interactions.map((a) => a.label)).toContain(
      "Warm your hands",
    );
    expect(campaign.scenes.find((scene) => scene.id === sketch.tower)!.name).toBe(
      "Renamed by hand",
    );
    expect(conflicts).toEqual(["Renamed by hand"]);
  });
});

describe("saving and the panel (#78 review, points 1–5)", () => {
  async function setArrival(text: string) {
    const field = host.querySelector<HTMLTextAreaElement>('[data-storyboard-field="arrival"]')!;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setter.call(field, text);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("saves the author's unsaved move and text before the help opens, and keeps them when the panel saves", async () => {
    const { fake, hall, tower, db, campaign } = await mount();
    await dragTo(realCard(hall)!, 120, 80);
    await setArrival("A bell tolls.");
    expect(
      campaign().scenes.find((scene) => scene.id === hall)!.encounter!.definition.description,
    ).toBe("A bell tolls.");
    // Not saved yet: the database does not have them.
    expect(
      db.data.scenes.find((scene) => scene.id === hall)!.encounter!.definition.description,
    ).not.toBe("A bell tolls.");
    await act(async () => button("✦ Continue from here")!.click());
    await act(async () => {});
    // Saved before the panel opened.
    expect(
      db.data.scenes.find((scene) => scene.id === hall)!.encounter!.definition.description,
    ).toBe("A bell tolls.");
    const moved = db.data.scenes.find((scene) => scene.id === hall)!.position;
    expect(moved).toBeDefined();
    // The panel saves a new scene into the database.
    const patch = continueProposals(tower)[0]!.patch;
    db.data = applyPatch(db.data, sketchAdventure().library, patch).campaign;
    await fake!.close({ changed: true, newSceneIds: ["adv:scene:roof"] });
    await act(async () => {});
    // Both changes are in Storyboard, and in the database.
    expect(campaign().scenes.find((scene) => scene.id === hall)!.position).toEqual(moved);
    expect(
      campaign().scenes.find((scene) => scene.id === hall)!.encounter!.definition.description,
    ).toBe("A bell tolls.");
    expect(campaign().scenes.some((scene) => scene.id === "adv:scene:roof")).toBe(true);
    expect(db.data.scenes.find((scene) => scene.id === hall)!.position).toEqual(moved);
    expect(
      db.data.scenes.find((scene) => scene.id === hall)!.encounter!.definition.description,
    ).toBe("A bell tolls.");
    expect(db.data.scenes.some((scene) => scene.id === "adv:scene:roof")).toBe(true);
  });

  it("does not open the help when the adventure cannot be saved, and says why", async () => {
    const { fake, hall, db } = await mount({ failSave: true });
    await dragTo(realCard(hall)!, 120, 80);
    await act(async () => button("✦ Continue from here")!.click());
    await act(async () => {});
    expect(fake!.state.opened).toEqual([]);
    expect(host.querySelector("[data-assist-panel]")).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("could not be saved");
    expect(db.data.scenes.find((scene) => scene.id === hall)!.position).toBeUndefined();
  });

  it("leaves the placed scenes saved, so the adventure is not changed after the panel closes", async () => {
    const { fake, tower, db, campaign } = await mount();
    await act(async () => button("✦ Continue from here")!.click());
    await act(async () => {});
    db.data = applyPatch(
      db.data,
      sketchAdventure().library,
      continueProposals(tower)[0]!.patch,
    ).campaign;
    await fake!.close({ changed: true, newSceneIds: ["adv:scene:roof"] });
    await act(async () => {});
    const shown = campaign().scenes.find((scene) => scene.id === "adv:scene:roof")!.position;
    expect(shown).toBeDefined();
    expect(db.data.scenes.find((scene) => scene.id === "adv:scene:roof")!.position).toEqual(shown);
    expect(button("Save adventure")?.disabled).toBe(false);
  });

  it("keeps the panel's change when the reread fails: Save adventure does not write the old draft over it", async () => {
    const { fake, tower, db, saveFirst } = await mount({
      reload: async () => {
        throw new Error("busy");
      },
    });
    await act(async () => button("✦ Continue from here")!.click());
    await act(async () => {});
    db.data = applyPatch(
      db.data,
      sketchAdventure().library,
      continueProposals(tower)[0]!.patch,
    ).campaign;
    const calls = saveFirst.mock.calls.length;
    await fake!.close({ changed: true, newSceneIds: ["adv:scene:roof"] });
    await act(async () => {});
    expect(host.textContent).toContain(
      "The changes were saved but could not be read. Open the adventure again.",
    );
    const save = button("Save adventure")!;
    expect(save.disabled).toBe(true);
    await act(async () => save.click());
    expect(saveFirst.mock.calls.length).toBe(calls);
    expect(db.data.scenes.some((scene) => scene.id === "adv:scene:roof")).toBe(true);
  });

  it("shows the way that opened the panel as pressed, and not the other", async () => {
    const { hall } = await mount();
    await act(async () => button("✦ Deepen")!.click());
    await act(async () => {});
    expect(button("✦ Deepen")!.getAttribute("aria-pressed")).toBe("true");
    expect(button("✦ Continue from here")!.getAttribute("aria-pressed")).toBe("false");
    void hall;
  });

  it("names the two menu rows in the three languages", async () => {
    const { tower } = await mount();
    await contextMenu(realCard(tower)!);
    expect(menuRows().map((row) => row.textContent)).toEqual(
      expect.arrayContaining(["Edit scene"]),
    );
    expect(menuRows().map((row) => row.textContent)).toEqual(
      expect.arrayContaining(["Add action"]),
    );
  });
});
