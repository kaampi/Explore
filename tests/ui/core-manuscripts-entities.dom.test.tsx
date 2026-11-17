// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { CoreManuscripts } from "../../src/ui/home/CoreManuscripts";

const entry = (revision: number) => ({
  workspaceId: "w-1",
  projectId: "book-one",
  title: "Night Keys",
  language: "English",
  translationGroupId: "family",
  revision,
  updatedAt: "2026-10-27",
});
const bible = (mill: string) => [
  {
    kind: "locations",
    label: "Locations",
    entities: [
      {
        entity_ref: "mill",
        name: "The Old Mill",
        looks: mill,
        referenceImages: [],
        facts: [{ predicate: "built", label: "Built", value: "After the flood" }],
      },
    ],
  },
  {
    kind: "objects",
    label: "Objects",
    entities: [
      { entity_ref: "key", name: "Brass key", looks: "Worn.", referenceImages: [], facts: [] },
    ],
  },
  {
    kind: "groups",
    label: "Groups",
    entities: [
      {
        entity_ref: "guild",
        name: "The Millers' Guild",
        looks: "A trade guild.",
        referenceImages: [],
        facts: [],
      },
    ],
  },
];

async function mount(repo: IndexedDBRepository, revision: number, mill: string) {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.open = false;
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      Response.json(
        path.endsWith("/manuscripts")
          ? [entry(revision)]
          : {
              ...entry(revision),
              manuscript: { title: "Night Keys", synopsis: "", chapters: [], bible: bible(mill) },
            },
      ),
    ),
  );
  await act(async () => root.render(<CoreManuscripts repo={repo} />));
  const click = async (label: string, index = 0) => {
    const buttons = Array.from(container.querySelectorAll("button")).filter((b) =>
      b.textContent?.includes(label),
    );
    if (!buttons[index]) throw new Error(`Missing ${label}`);
    await act(async () => {
      buttons[index]!.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
  };
  await click("Find shared manuscripts");
  await click("Night Keys");
  return {
    click,
    text: () => container.textContent ?? "",
    container,
    close: async () => {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    },
  };
}

it("copies a place, a thing and a faction, the place into a world made from the manuscript", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "core-entities-ui");
  const ui = await mount(repo, 2, "A leaning mill.");
  try {
    expect(await repo.listPlaces()).toEqual([]);

    await ui.click("Copy to kaampi Explore library", 0);
    await ui.click("Copy to kaampi Explore library", 1);
    await ui.click("Copy to kaampi Explore library", 2);

    const [place] = await repo.listPlaces();
    const realms = await repo.listRealms();
    expect(place!.name).toBe("The Old Mill");
    expect(place!.note).toBe("A leaning mill.\nBuilt: After the flood");
    expect(realms.map((r) => r.name)).toContain("Night Keys");
    expect(place!.realmId).toBe(realms.find((r) => r.name === "Night Keys")!.id);
    expect((await repo.listObjects()).map((o) => o.name)).toEqual(["Brass key"]);
    expect((await repo.listFactions()).map((f) => f.name)).toEqual(["The Millers' Guild"]);
    expect(ui.text()).toContain("was copied to your factions");
  } finally {
    await ui.close();
  }
});

it("copying again reviews what changed instead of making a second card, and applies only what is chosen", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "core-entities-ui-2");
  const first = await mount(repo, 2, "A leaning mill.");
  await first.click("Copy to kaampi Explore library", 0);
  await first.close();

  const again = await mount(repo, 3, "A burnt-out mill.");
  try {
    await again.click("Copy to kaampi Explore library", 0);

    expect((await repo.listPlaces()).length).toBe(1);
    expect(again.text()).toContain("Select the facts you want to update.");
    const box = again.container.querySelector<HTMLInputElement>(
      'section[aria-label="Review updates"] input[type="checkbox"]',
    )!;
    await act(async () => box.click());
    await again.click("Apply selected updates");

    const [place] = await repo.listPlaces();
    expect(place!.note).toContain("A burnt-out mill.");
    expect(place!.coreOrigin!.revision).toBe(3);
    expect((await repo.listRealms()).length).toBe(1);
  } finally {
    await again.close();
  }
});

it("creates a world from chosen entries in one go, and a second go adds the rest to the same world", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "core-entities-ui-3");
  const ui = await mount(repo, 2, "A leaning mill.");
  try {
    await ui.click("Create world from this manuscript");
    expect(ui.text()).toContain("Create world (3)");
    const box = Array.from(ui.container.querySelectorAll("label"))
      .find((l) => l.textContent?.includes("Brass key"))!
      .querySelector("input")!;
    await act(async () => box.click());
    expect(ui.text()).toContain("Create world (2)");

    await ui.click("Create world (2)");

    expect((await repo.listRealms()).map((r) => r.name)).toEqual(["Night Keys"]);
    expect((await repo.listPlaces()).map((p) => p.name)).toEqual(["The Old Mill"]);
    expect((await repo.listFactions()).map((f) => f.name)).toEqual(["The Millers' Guild"]);
    expect(await repo.listObjects()).toEqual([]);
    expect(ui.text()).toContain("Created the world “Night Keys” with 1 place, 1 faction");

    await ui.click("Create world from this manuscript");
    await ui.click("Create world (3)");

    expect((await repo.listRealms()).length).toBe(1);
    expect((await repo.listObjects()).map((o) => o.name)).toEqual(["Brass key"]);
    expect((await repo.listPlaces()).length).toBe(1);
    expect(ui.text()).toContain("Added to the world “Night Keys” with 1 thing");
    expect(ui.text()).toContain("Already in your library, left as they are");
  } finally {
    await ui.close();
  }
});
