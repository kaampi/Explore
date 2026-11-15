// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { IDBFactory } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import { PlayStartPaths, type StartAdventure } from "../../src/ui/home/PlayStartPaths";
import { HomeScreen } from "../../src/ui/home/HomeScreen";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { emptyCampaignScene, newCampaignTemplate } from "../../src/library/LibrarySchema";
import type { StudioView } from "../../src/ui/studio/types";

vi.mock("../../src/ui/connection/ConnectionProvider", () => ({
  useConnection: () => ({ discovery: null, preferredModel: "", refresh: () => {} }),
}));
vi.mock("../../src/ui/connection/ConnectionHelp", () => ({ HomeConnection: () => null }));
vi.mock("../../src/ui/home/CheckUpdates", () => ({ CheckUpdates: () => null }));
vi.mock("../../src/ui/home/CoreManuscripts", () => ({ CoreManuscripts: () => null }));

function render(element: React.ReactElement) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  return {
    host,
    show: () => act(async () => root.render(element)),
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

const sample = (count: number): StartAdventure[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `a${index + 1}`,
    name: `Adventure ${index + 1}`,
    scenes: 2,
  }));

function card(host: HTMLElement) {
  return host.querySelector<HTMLElement>('[aria-label="Adventure"]')!;
}

it("lists saved adventures to play and links to the builder", async () => {
  const played: string[] = [];
  const studio: StudioView[] = [];
  const ui = render(
    <PlayStartPaths
      onFree={() => {}}
      onStudio={(view) => studio.push(view)}
      onPlayAdventure={(id) => played.push(id)}
      adventures={sample(2)}
      disabled={false}
    />,
  );
  try {
    await ui.show();
    const rows = Array.from(card(ui.host).querySelectorAll(".sb-start-path__adventures button"));
    expect(rows.map((row) => row.querySelector("strong")!.textContent)).toEqual([
      "Adventure 1",
      "Adventure 2",
    ]);
    await act(async () => (rows[1] as HTMLButtonElement).click());
    expect(played).toEqual(["a2"]);
    const builder = Array.from(card(ui.host).querySelectorAll("button")).find(
      (button) => button.textContent === "Open the Adventure Builder →",
    )!;
    await act(async () => builder.click());
    expect(studio).toEqual(["campaigns"]);
  } finally {
    await ui.close();
  }
});

it("shows three adventures and says how many more are in the builder", async () => {
  const ui = render(
    <PlayStartPaths
      onFree={() => {}}
      onStudio={() => {}}
      onPlayAdventure={() => {}}
      adventures={sample(5)}
      disabled={false}
    />,
  );
  try {
    await ui.show();
    expect(card(ui.host).querySelectorAll(".sb-start-path__adventures li")).toHaveLength(3);
    expect(card(ui.host).textContent).toContain("2 more in the Adventure Builder");
  } finally {
    await ui.close();
  }
});

it("invites the player to build a first adventure when there are none", async () => {
  const ui = render(
    <PlayStartPaths
      onFree={() => {}}
      onStudio={() => {}}
      onPlayAdventure={() => {}}
      adventures={[]}
      disabled={false}
    />,
  );
  try {
    await ui.show();
    expect(card(ui.host).textContent).toContain("No adventures yet");
    expect(card(ui.host).querySelector(".sb-start-path__adventures")).toBeNull();
    expect(card(ui.host).textContent).toContain("Open the Adventure Builder");
  } finally {
    await ui.close();
  }
});

it("cannot play an adventure with no scenes, and disables everything while busy", async () => {
  const played = vi.fn();
  const ui = render(
    <PlayStartPaths
      onFree={() => {}}
      onStudio={() => {}}
      onPlayAdventure={played}
      adventures={[{ id: "empty", name: "Empty", scenes: 0 }]}
      disabled={false}
    />,
  );
  try {
    await ui.show();
    const row = card(ui.host).querySelector<HTMLButtonElement>(
      ".sb-start-path__adventures button",
    )!;
    expect(row.disabled).toBe(true);
    expect(row.textContent).toContain("No scenes yet");
    await act(async () => row.click());
    expect(played).not.toHaveBeenCalled();
  } finally {
    await ui.close();
  }
  const busy = render(
    <PlayStartPaths
      onFree={() => {}}
      onStudio={() => {}}
      onPlayAdventure={played}
      adventures={sample(1)}
      disabled
    />,
  );
  try {
    await busy.show();
    const buttons = Array.from(busy.host.querySelectorAll("button"));
    expect(buttons.every((button) => button.disabled)).toBe(true);
  } finally {
    await busy.close();
  }
});

it("still has Free play and With rules as before", async () => {
  const free = vi.fn();
  const studio: StudioView[] = [];
  const ui = render(
    <PlayStartPaths
      onFree={free}
      onStudio={(view) => studio.push(view)}
      onPlayAdventure={() => {}}
      adventures={[]}
      disabled={false}
    />,
  );
  try {
    await ui.show();
    await act(async () =>
      ui.host.querySelector<HTMLButtonElement>('button[aria-label="Free play"]')!.click(),
    );
    await act(async () =>
      ui.host.querySelector<HTMLButtonElement>('button[aria-label="With rules"]')!.click(),
    );
    expect(free).toHaveBeenCalledTimes(1);
    expect(studio).toEqual(["rulesets"]);
  } finally {
    await ui.close();
  }
});

it("opens the scene list for a saved adventure chosen on the home screen", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "home-adventures");
  const built = connectedAdventureExample();
  await repo.saveRealm(built.realm);
  for (const place of built.places) await repo.savePlace(place);
  for (const person of built.characters) await repo.saveCharacter(person);
  await repo.saveCampaign(built.campaign);
  await repo.saveCampaign(
    newCampaignTemplate({ name: "Empty one", scenes: [emptyCampaignScene()] }),
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const ui = render(
    <HomeScreen
      repo={repo}
      session={null}
      sessionId="s"
      onResume={() => {}}
      onStart={async () => {}}
      onStudio={() => {}}
    />,
  );
  try {
    await ui.show();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const row = Array.from(
      card(ui.host).querySelectorAll<HTMLButtonElement>(".sb-start-path__adventures button"),
    ).find((button) => button.textContent?.includes(built.campaign.name))!;
    expect(row).toBeTruthy();
    await act(async () => row.click());
    expect(document.body.textContent).toContain("Enter scene →");
  } finally {
    await ui.close();
  }
});
