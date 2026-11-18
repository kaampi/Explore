// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it } from "vitest";
import { PlayableStoryboard } from "../../src/ui/studio/PlayableStoryboard";
import { connectedAdventureExample } from "../../src/library/playableCampaign";

beforeEach(() => window.localStorage.clear());

async function mount(expanded: boolean) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [campaign, setCampaign] = useState(built.campaign);
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={built.places}
        characters={built.characters}
        objects={built.objects}
        busy={false}
        onChange={setCampaign}
        onPlay={() => {}}
        expanded={expanded}
      />
    );
  }
  await act(async () => root.render(<Harness />));
  return {
    host,
    handle: () => host.querySelector<HTMLElement>('[role="separator"]'),
    layout: () => host.querySelector<HTMLElement>(".playable-storyboard__layout")!,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

async function press(element: HTMLElement, key: string) {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

it("has no resize handle in the compact layout", async () => {
  const ui = await mount(false);
  try {
    expect(ui.handle()).toBeNull();
  } finally {
    await ui.close();
  }
});

it("starts at the original width and widens with the arrow keys", async () => {
  const ui = await mount(true);
  try {
    const handle = ui.handle()!;
    expect(handle.getAttribute("aria-valuenow")).toBe("330");
    expect(ui.layout().style.getPropertyValue("--storyboard-inspector-width")).toBe("330px");
    await press(handle, "ArrowLeft");
    await press(handle, "ArrowLeft");
    expect(Number(handle.getAttribute("aria-valuenow"))).toBeGreaterThan(330);
    expect(ui.layout().style.getPropertyValue("--storyboard-inspector-width")).toBe(
      `${handle.getAttribute("aria-valuenow")}px`,
    );
  } finally {
    await ui.close();
  }
});

it("goes back to the original width on Home and never narrower than it", async () => {
  const ui = await mount(true);
  try {
    const handle = ui.handle()!;
    await press(handle, "ArrowLeft");
    await press(handle, "Home");
    expect(handle.getAttribute("aria-valuenow")).toBe("330");
    await press(handle, "ArrowRight");
    expect(handle.getAttribute("aria-valuenow")).toBe("330");
  } finally {
    await ui.close();
  }
});

it("remembers the width the next time the editor opens", async () => {
  const first = await mount(true);
  try {
    await press(first.handle()!, "ArrowLeft");
    await press(first.handle()!, "ArrowLeft");
  } finally {
    await first.close();
  }
  const second = await mount(true);
  try {
    expect(Number(second.handle()!.getAttribute("aria-valuenow"))).toBeGreaterThan(330);
  } finally {
    await second.close();
  }
});
