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
const bible = (mill: string, name = "The Old Mill") => [
  {
    kind: "locations",
    label: "Locations",
    entities: [
      {
        entity_ref: "mill",
        name,
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

async function mount(
  repo: IndexedDBRepository,
  revision: number,
  mill: string,
  name = "The Old Mill",
) {
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
              manuscript: {
                title: "Night Keys",
                synopsis: "",
                chapters: [],
                bible: bible(mill, name),
              },
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

/** Record the order of saves, to see the world is saved after the places its map points to. */
function recording(repo: IndexedDBRepository) {
  const order: string[] = [];
  const realms: Awaited<ReturnType<IndexedDBRepository["listRealms"]>> = [];
  const savePlace = repo.savePlace.bind(repo);
  const saveRealm = repo.saveRealm.bind(repo);
  repo.savePlace = async (place) => {
    order.push(`place:${place.id}`);
    await savePlace(place);
  };
  repo.saveRealm = async (realm) => {
    order.push(`realm:${realm.id}`);
    realms.push(structuredClone(realm));
    await saveRealm(realm);
  };
  return { order, realms };
}

it("puts an imported place on the world's map, and saves the world after the place", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "core-entities-ui-map-1");
  const log = recording(repo);
  const ui = await mount(repo, 2, "A leaning mill.");
  try {
    await ui.click("Copy to kaampi Explore library", 0);

    const [place] = await repo.listPlaces();
    const [world] = await repo.listRealms();
    expect(world!.worldMap!.nodes.map((n) => n.placeId)).toEqual([place!.id]);
    expect(world!.worldMap!.nodes[0]!.name).toBe("The Old Mill");
    expect(log.order.at(-1)).toBe(`realm:${world!.id}`);
    expect(log.order.indexOf(`place:${place!.id}`)).toBeLessThan(
      log.order.lastIndexOf(`realm:${world!.id}`),
    );
    expect(
      log.order.filter(
        (entry) =>
          entry.startsWith("realm:") &&
          log.order.indexOf(entry) < log.order.indexOf(`place:${place!.id}`),
      ),
    ).toEqual([]);
  } finally {
    await ui.close();
  }
});

it("puts every place of a world made in one go on its map, saved after the places", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "core-entities-ui-map-2");
  const log = recording(repo);
  const ui = await mount(repo, 2, "A leaning mill.");
  try {
    await ui.click("Create world from this manuscript");
    await ui.click("Create world (3)");

    const places = await repo.listPlaces();
    const [world] = await repo.listRealms();
    expect(world!.worldMap!.nodes.map((n) => n.placeId)).toEqual(places.map((p) => p.id));
    const lastRealm = log.order.lastIndexOf(`realm:${world!.id}`);
    for (const place of places)
      expect(log.order.indexOf(`place:${place.id}`)).toBeLessThan(lastRealm);
    expect(log.order.at(-1)).toBe(`realm:${world!.id}`);
    const saved = log.realms.at(-1)!;
    expect(saved.worldMap!.nodes.every((n) => places.some((p) => p.id === n.placeId))).toBe(true);
  } finally {
    await ui.close();
  }
});

it("renames the point on the map with a place renamed from the manuscript, unless the author renamed the point", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "core-entities-ui-map-3");
  const first = await mount(repo, 2, "A leaning mill.");
  await first.click("Copy to kaampi Explore library", 0);
  await first.close();
  const [world] = await repo.listRealms();
  const [place] = await repo.listPlaces();
  expect(world!.worldMap!.nodes[0]!.name).toBe(place!.name);
  await repo.saveRealm({
    ...world!,
    worldMap: {
      ...world!.worldMap!,
      nodes: [{ ...world!.worldMap!.nodes[0]!, name: "Brightwater Mill" }],
    },
  });

  // The manuscript renames the mill; the author had already renamed its point.
  const renamed = await mount(repo, 3, "A leaning mill.", "The Ruined Mill");
  try {
    await renamed.click("Copy to kaampi Explore library", 0);
    const box = renamed.container.querySelector<HTMLInputElement>(
      'section[aria-label="Review updates"] input[type="checkbox"]',
    )!;
    await act(async () => box.click());
    await renamed.click("Apply selected updates");

    expect((await repo.listPlaces())[0]!.name).toBe("The Ruined Mill");
    expect((await repo.listRealms())[0]!.worldMap!.nodes[0]!.name).toBe("Brightwater Mill");
  } finally {
    await renamed.close();
  }
});
