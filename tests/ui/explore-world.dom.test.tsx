// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { IDBFactory } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { ExploreWorldDialog } from "../../src/ui/home/ExploreWorldDialog";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { adventureMapPlaces } from "../../src/library/adventureMap";
import type { Session } from "../../src/state/StateSchema";

HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};

async function mount(onStart = vi.fn(async (_session: Session) => {})) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const repo = new IndexedDBRepository(new IDBFactory(), "explore-world");
  const inn = innVisitExample();
  await repo.saveRealm(inn.realm);
  const places = adventureMapPlaces(inn.realm, []).map((e) => e.place);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <ExploreWorldDialog
        repo={repo}
        world={inn.realm}
        places={places}
        rulesets={[]}
        sessionId="free-play"
        model="mock"
        onStart={onStart}
        onClose={() => {}}
      />,
    ),
  );
  return {
    host,
    repo,
    inn,
    onStart,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

const set = async (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  await act(async () => {
    const proto = element instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
    );
  });
};

it("starts free play from the chosen place, as the chosen person, and saves nothing to the library", async () => {
  const ui = await mount();
  try {
    const before = JSON.stringify((await ui.repo.listCampaigns()).length);
    const start = ui.host.querySelector<HTMLSelectElement>('select[aria-label="Start at"]')!;
    const room = Array.from(start.options).find((o) => o.textContent?.includes("Common room"))!;
    await set(start, room.value);
    await set(ui.host.querySelector<HTMLInputElement>("input")!, "Wren");

    await act(async () =>
      Array.from(ui.host.querySelectorAll("button"))
        .find((b) => b.textContent?.startsWith("Explore this world"))!
        .click(),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(ui.onStart).toHaveBeenCalledTimes(1);
    const session = ui.onStart.mock.calls[0]![0];
    expect(session.encounter!.state.actors.player!.name).toBe("Wren");
    expect(
      session.adventure!.scenes.find((s) => s.id === session.adventure!.currentSceneId)!.name,
    ).toBe("Common room");
    expect(session.runtime.model).toBe("mock");
    expect(JSON.stringify((await ui.repo.listCampaigns()).length)).toBe(before);
  } finally {
    await ui.close();
  }
});

it("lists the places of the world to begin in, including the rooms of a building", async () => {
  const ui = await mount();
  try {
    const options = Array.from(
      ui.host.querySelectorAll<HTMLSelectElement>('select[aria-label="Start at"] option'),
    ).map((o) => o.textContent);

    expect(options.some((text) => text?.includes("Brookmere / The Copper Lantern / Kitchen"))).toBe(
      true,
    );
  } finally {
    await ui.close();
  }
});
