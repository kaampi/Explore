// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  emptyCampaignScene,
  type CampaignScene,
  type StoryboardLink,
  type StoryboardSection,
} from "@library/LibrarySchema";
import { StoryboardCanvas } from "../../src/ui/studio/StoryboardCanvas";
import { layoutStoryboard } from "../../src/ui/studio/storyboardLayout";
import { routeStoryboardLinks, storyboardLinkPoint } from "../../src/ui/studio/storyboardRouting";

const scenes: CampaignScene[] = [
  { ...emptyCampaignScene(), id: "a", name: "Arrival", position: { x: 0, y: 0 } },
  { ...emptyCampaignScene(), id: "b", name: "Kitchen", position: { x: 480, y: 0 } },
  { ...emptyCampaignScene(), id: "c", name: "Guest room", position: { x: 480, y: 400 } },
];

function link(id: string, fromSceneId: string, toSceneId: string, label = ""): StoryboardLink {
  return {
    id,
    fromSceneId,
    toSceneId,
    label,
    requiresFlags: [],
    requiresAbsentFlags: [],
    setsFlags: [],
  };
}

async function board(
  links: StoryboardLink[],
  initialScenes = scenes,
  initialSections: StoryboardSection[] = [],
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const noop = () => {};
  let snapshot = { scenes: initialScenes, sections: initialSections };
  function Harness() {
    const [current, setCurrent] = useState(snapshot);
    snapshot = current;
    return (
      <StoryboardCanvas
        scenes={current.scenes}
        sections={current.sections}
        links={links}
        chapters={[]}
        campaignName="Inn"
        onScenesChange={(scenes) => setCurrent((previous) => ({ ...previous, scenes }))}
        onLayoutChange={(scenes, sections) => setCurrent({ scenes, sections })}
        onLinksChange={noop}
        onChaptersChange={noop}
      />
    );
  }
  await act(async () => root.render(<Harness />));
  return {
    host,
    scenes: () => snapshot.scenes,
    state: () => snapshot,
    line: (id: string) =>
      host.querySelector<SVGPathElement>(`[data-link-id="${id}"] .storyboard-line`)!,
    hit: (id: string) =>
      host.querySelector<SVGPathElement>(`[data-link-id="${id}"] .storyboard-line-hit`)!,
    label: (id: string) => host.querySelector<SVGGElement>(`[data-storyboard-label-link="${id}"]`)!,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

function pointer(node: Element, type: "pointerover" | "pointerout") {
  return act(async () =>
    node.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: document.body })),
  );
}

function mockLabelBox(width: number, height: number) {
  const previous = Object.getOwnPropertyDescriptor(SVGElement.prototype, "getBBox");
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value: () => ({ x: -width / 2, y: -height / 2, width, height }),
  });
  return () => {
    if (previous) Object.defineProperty(SVGElement.prototype, "getBBox", previous);
    else Reflect.deleteProperty(SVGElement.prototype, "getBBox");
  };
}

it("focuses a scene's connections on hover and keyboard focus, and dims the rest", async () => {
  const ui = await board([
    { ...link("ab", "a", "b"), requiresOpenBarriers: ["door"] },
    link("bc", "b", "c", "Go upstairs"),
  ]);
  try {
    const a = ui.host.querySelector<HTMLElement>('[data-scene-id="a"]')!;
    expect(ui.line("ab").classList.contains("storyboard-line--locked")).toBe(true);
    expect(ui.label("ab").textContent).toBe("Locked");
    const markerOf = (line: SVGPathElement) =>
      document.getElementById(line.getAttribute("marker-end")!.slice(5, -1))!;
    const markerSize = (marker: HTMLElement) =>
      ["markerWidth", "markerHeight"].map((attribute) => marker.getAttribute(attribute));
    const normal = markerOf(ui.line("ab"));

    await pointer(a, "pointerover");
    const emphasized = markerOf(ui.line("ab"));
    expect(emphasized).not.toBe(normal);
    expect([normal, emphasized].map((marker) => marker.getAttribute("markerUnits"))).toEqual([
      "userSpaceOnUse",
      "userSpaceOnUse",
    ]);
    expect(markerSize(emphasized)).toEqual(markerSize(normal));
    expect(ui.line("ab").classList.contains("is-focused")).toBe(true);
    expect(ui.line("bc").classList.contains("is-dimmed")).toBe(true);
    expect(ui.label("bc").classList.contains("is-dimmed")).toBe(true);

    await pointer(a, "pointerout");
    expect(ui.line("bc").classList.contains("is-dimmed")).toBe(false);
    await act(async () => a.focus());
    expect(ui.line("ab").classList.contains("is-focused")).toBe(true);
    expect(ui.line("bc").classList.contains("is-dimmed")).toBe(true);
  } finally {
    await ui.close();
  }
});

it("uses the least overlapping positions and only reveals crowded labels on hover or selection", async () => {
  // Wide labels across two parallel connections cannot avoid one another.
  const restoreBox = mockLabelBox(170, 110);
  const ui = await board([
    link("first", "a", "b", "Go to kitchen"),
    link("second", "b", "a", "Go to guest room"),
  ]);
  const shown = (id: string) => ui.label(id).getAttribute("visibility") !== "hidden";
  try {
    const { endpoints, visibleScenes } = layoutStoryboard(scenes, []);
    const route = routeStoryboardLinks(visibleScenes, [
      { id: "first", from: endpoints.get("a")!, to: endpoints.get("b")! },
      { id: "second", from: endpoints.get("b")!, to: endpoints.get("a")! },
    ]).get("second")!;
    const x = Number(
      ui
        .label("second")
        .getAttribute("transform")
        ?.match(/translate\(([^ ]+)/)?.[1],
    );
    expect(
      Math.min(...[0.3, 0.7].map((t) => Math.abs(storyboardLinkPoint(route, t).x - x))),
    ).toBeLessThan(0.001);
    expect([shown("first"), shown("second")]).toEqual([false, false]);
    expect(ui.line("first").isConnected && ui.line("second").isConnected).toBe(true);

    await pointer(ui.hit("first"), "pointerover");
    expect([shown("first"), shown("second")]).toEqual([true, false]);
    await pointer(ui.hit("first"), "pointerout");
    await act(async () =>
      ui.hit("second").dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect([shown("first"), shown("second")]).toEqual([false, true]);

    await pointer(ui.hit("first"), "pointerover");
    expect([shown("first"), shown("second")]).toEqual([true, false]);
    await pointer(ui.hit("first"), "pointerout");
    expect([shown("first"), shown("second")]).toEqual([false, true]);
  } finally {
    await ui.close();
    restoreBox();
  }
});

it("moves an otherwise clear label off a card even when there are no other labels", async () => {
  const restoreBox = mockLabelBox(52, 44);
  const nearLine = { ...scenes[2]!, position: { x: 320, y: 77 } };
  const ui = await board(
    [link("first", "a", "b", "Go to kitchen")],
    [scenes[0]!, scenes[1]!, nearLine],
  );
  try {
    const label = ui.label("first");
    expect(label.getAttribute("visibility")).toBeNull();
    const labelX = Number(label.getAttribute("transform")?.match(/translate\(([^ ]+)/)?.[1]);
    expect(labelX).toBeGreaterThan(200);
    expect(labelX + 26).toBeLessThanOrEqual(nearLine.position.x);
  } finally {
    await ui.close();
    restoreBox();
  }
});

it("only reveals an unavoidable card collision for the active link, above the card", async () => {
  const restoreBox = mockLabelBox(80, 20);
  const closeBy = { ...scenes[1]!, position: { x: 240, y: 0 } };
  const ui = await board([link("first", "a", "b", "Go to kitchen")], [scenes[0]!, closeBy]);
  try {
    const label = ui.label("first");
    const endCard = ui.host.querySelector('[data-scene-id="b"]')!;
    expect(label.getAttribute("visibility")).toBe("hidden");
    await pointer(ui.hit("first"), "pointerover");
    expect(label.getAttribute("visibility")).toBeNull();
    expect(endCard.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    await pointer(ui.hit("first"), "pointerout");
    expect(label.getAttribute("visibility")).toBe("hidden");
  } finally {
    await ui.close();
    restoreBox();
  }
});

it("saves the snapped scene position and uses the exact drag position with Alt", async () => {
  const ui = await board([]);
  try {
    const workspace = ui.host.querySelector(".storyboard-board")!;
    const scene = ui.host.querySelector<HTMLElement>('[data-scene-id="a"]')!;
    scene.setPointerCapture = () => {};
    const dispatch = (node: Element, type: string, init: MouseEventInit = {}) =>
      act(async () => node.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init })));
    await dispatch(scene, "pointerdown", { clientX: 25, clientY: 15 });
    await dispatch(workspace, "pointermove", { clientX: 58, clientY: 62 });
    expect(ui.scenes()[0]?.position).toEqual({ x: 40, y: 40 });
    await dispatch(workspace, "pointermove", { clientX: 58, clientY: 62, altKey: true });
    await dispatch(workspace, "pointerup");
    expect(ui.scenes()[0]?.position).toEqual({ x: 33, y: 47 });
  } finally {
    await ui.close();
  }
});

it("restores exact earlier positions with Undo and Ctrl+Z only while the notice is visible", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const unplaced = { ...emptyCampaignScene(), id: "unplaced" };
  const initialScenes = [...scenes, unplaced];
  const initialSections: StoryboardSection[] = [
    { id: "empty", title: "Empty group", kind: "group", position: { x: 457, y: 123 } },
  ];
  const ui = await board([link("ab", "a", "b")], initialScenes, initialSections);
  const initial = ui.state();
  const button = (label: string) =>
    Array.from(ui.host.querySelectorAll("button")).find((button) => button.textContent === label)!;
  const click = (label: string) => act(async () => button(label).click());
  const ctrlZ = () =>
    act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });

  try {
    await click("Arrange");
    expect(ui.state()).not.toStrictEqual(initial);
    expect(ui.host.querySelector("[role=status]")?.textContent).toBe("Scenes arranged");
    await click("Undo");
    expect(ui.state()).toStrictEqual(initial);
    expect(ui.host.querySelector("[role=status]")).toBeNull();

    await click("Arrange");
    await act(async () => vi.advanceTimersByTime(9_999));
    expect(button("Undo")).toBeTruthy();
    await ctrlZ();
    expect(ui.state()).toStrictEqual(initial);

    await click("Arrange");
    const arranged = ui.state();
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(button("Undo")).toBeUndefined();
    await ctrlZ();
    expect(ui.state()).toStrictEqual(arranged);
  } finally {
    await ui.close();
    vi.useRealTimers();
  }
});
