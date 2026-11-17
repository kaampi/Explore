// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { CoreManuscripts } from "../../src/ui/home/CoreManuscripts";
import { copyCoreCharacter } from "../../src/integrations/coreBible";

const entryAt = (revision: number) => ({
  workspaceId: "w-1",
  projectId: "book-one",
  title: "Night Keys",
  language: "English",
  translationGroupId: "f",
  revision,
  updatedAt: "2026-10-27",
});
const entry = entryAt(2);
const edda = { entity_ref: "edda", name: "Edda", referenceImages: [], facts: [] };
const bibleWith = (e1: string) => [
  { kind: "characters", label: "Characters", entities: [edda] },
  {
    kind: "events",
    label: "Events",
    entities: [
      {
        entity_ref: "e1",
        name: "The messenger vanishes",
        referenceImages: [],
        facts: [{ predicate: "who", label: "Who", value: e1 }],
      },
      { entity_ref: "e2", name: "A note is found", referenceImages: [], facts: [] },
    ],
  },
];

async function mount(repo: IndexedDBRepository, revision = 2, e1 = "Edda sees it happen.") {
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
          ? [entryAt(revision)]
          : {
              ...entryAt(revision),
              manuscript: { title: "Night Keys", synopsis: "", chapters: [], bible: bibleWith(e1) },
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
    container,
    text: () => container.textContent ?? "",
    close: async () => {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    },
  };
}

it("creates scene drafts from chosen events into a new adventure, with no game content and a suggestion from a copied card", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "core-events-ui");
  await repo.saveCharacter(
    copyCoreCharacter(edda, { workspaceId: "w-1", projectId: "book-one", revision: 2 }),
  );
  const ui = await mount(repo);
  try {
    await ui.click("Create scene drafts");
    const box = Array.from(ui.container.querySelectorAll("label"))
      .find((l) => l.textContent?.includes("A note is found"))!
      .querySelector("input")!;
    await act(async () => box.click());
    expect(ui.text()).toContain("Add drafts (1)");

    await ui.click("Add drafts (1)");

    const [campaign] = await repo.listCampaigns();
    expect(campaign!.name).toBe("Night Keys");
    expect(campaign!.scenes.map((s) => s.name)).toEqual(["The messenger vanishes"]);
    const scene = campaign!.scenes[0]!;
    expect(scene.encounter).toBeUndefined();
    expect(scene.draft!.suggestedCharacterIds).toHaveLength(1);
    expect(scene.draft!.facts).toEqual([{ label: "Who", value: "Edda sees it happen." }]);
    expect(campaign!.storyboardSections!.map((c) => c.title)).toEqual(["Night Keys"]);
    expect(ui.text()).toContain("1 scene draft added to “Night Keys”");
  } finally {
    await ui.close();
  }
});

it("adds the rest to the same adventure later, and does not make the same draft twice", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "core-events-ui-2");
  const first = await mount(repo);
  await first.click("Create scene drafts");
  await first.click("Add drafts (2)");
  await first.close();

  const ui = await mount(repo);
  try {
    await ui.click("Create scene drafts");
    const select = ui.container.querySelector<HTMLSelectElement>(
      'select[aria-label="Adventure for the drafts"]',
    )!;
    const [campaign] = await repo.listCampaigns();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
        select,
        campaign!.id,
      );
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await ui.click("Add drafts (2)");

    expect((await repo.listCampaigns())[0]!.scenes).toHaveLength(2);
    expect((await repo.listCampaigns()).length).toBe(1);
    expect(ui.text()).toContain("0 scene drafts added");
    expect(ui.text()).toContain(
      "Already there, left as they are: The messenger vanishes, A note is found",
    );
  } finally {
    await ui.close();
  }
});

it("reviews a draft the manuscript has changed, and updates only its notes when the author says so", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "core-events-ui-3");
  const first = await mount(repo);
  await first.click("Create scene drafts");
  await first.click("Add drafts (2)");
  await first.close();
  const [saved] = await repo.listCampaigns();
  await repo.saveCampaign({
    ...saved!,
    scenes: saved!.scenes.map((scene) => ({ ...scene, name: `${scene.name} (mine)` })),
  });

  const ui = await mount(repo, 3, "Edda sees it happen from the roof.");
  try {
    await ui.click("Create scene drafts");
    const select = ui.container.querySelector<HTMLSelectElement>(
      'select[aria-label="Adventure for the drafts"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
        select,
        saved!.id,
      );
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await ui.click("Add drafts (2)");

    expect(ui.text()).toContain("The manuscript has changed");
    expect(ui.text()).toContain("Edda sees it happen.");
    expect(ui.text()).toContain("Edda sees it happen from the roof.");
    expect((await repo.listCampaigns())[0]!.scenes[0]!.draft!.facts[0]!.value).toBe(
      "Edda sees it happen.",
    );

    await ui.click("Update notes");

    const [after] = await repo.listCampaigns();
    const scene = after!.scenes.find((s) => s.draft?.origin.entityRef === "e1")!;
    expect(scene.draft!.facts[0]!.value).toBe("Edda sees it happen from the roof.");
    expect(scene.draft!.origin.revision).toBe(3);
    expect(scene.name).toBe("The messenger vanishes (mine)");
    expect(
      ui.container.querySelector('section[aria-label="The manuscript has changed"]'),
    ).toBeNull();
  } finally {
    await ui.close();
  }
});

it("keeps the notes as they are when the author chooses Keep", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "core-events-ui-4");
  const first = await mount(repo);
  await first.click("Create scene drafts");
  await first.click("Add drafts (2)");
  await first.close();
  const [saved] = await repo.listCampaigns();

  const ui = await mount(repo, 3, "Something new.");
  try {
    await ui.click("Create scene drafts");
    const select = ui.container.querySelector<HTMLSelectElement>(
      'select[aria-label="Adventure for the drafts"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
        select,
        saved!.id,
      );
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await ui.click("Add drafts (2)");
    await ui.click("Keep");

    const [after] = await repo.listCampaigns();
    expect(
      after!.scenes.find((s) => s.draft?.origin.entityRef === "e1")!.draft!.facts[0]!.value,
    ).toBe("Edda sees it happen.");
    expect(
      after!.scenes.find((s) => s.draft?.origin.entityRef === "e1")!.draft!.origin.revision,
    ).toBe(2);
  } finally {
    await ui.close();
  }
});
