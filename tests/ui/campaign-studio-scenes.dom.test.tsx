// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";
import { CampaignStudio } from "../../src/ui/studio/CampaignStudio";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { emptyCampaignScene, newCampaignTemplate } from "../../src/library/LibrarySchema";

const someone = {
  characterId: "someone",
  position: "",
  mood: "calm",
  clothing: "",
  holding: "",
  trust: "20",
  familiarity: "10",
  tension: "5",
};

async function open(
  campaign: ReturnType<typeof newCampaignTemplate>,
  library?: ReturnType<typeof connectedAdventureExample>,
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const repo = new IndexedDBRepository(new IDBFactory(), `studio-${campaign.id}`);
  if (library) {
    await repo.saveRealm(library.realm);
    for (const place of library.places) await repo.savePlace(place);
    for (const person of library.characters) await repo.saveCharacter(person);
    for (const object of library.objects) await repo.saveObject(object);
  }
  await repo.saveCampaign(campaign);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <CampaignStudio
        sessionId="s"
        repo={repo}
        resume={{ campaignId: campaign.id }}
        onStart={() => {}}
        onOpenShelf={() => {}}
        onOneOff={() => {}}
      />,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

function buttons(host: HTMLElement) {
  return Array.from(host.querySelectorAll("button")).map((b) => b.textContent ?? "");
}

async function clickNav(host: HTMLElement, label: string) {
  const button = host.querySelector<HTMLButtonElement>(`[data-step="${label}"]`)!;
  await act(async () => button.click());
}

it("sends a new adventure to Storyboard and offers no second way to add a scene", async () => {
  const campaign = newCampaignTemplate({ name: "Fresh", scenes: [emptyCampaignScene()] });
  const ui = await open(campaign);
  try {
    expect(ui.host.textContent).toContain("Scenes in this adventure");
    expect(buttons(ui.host)).toContain("Open Storyboard Editor →");
    expect(buttons(ui.host)).not.toContain("+ Scene");
    expect(ui.host.textContent).not.toContain("Earlier scene format");
    expect(ui.host.textContent).toContain("Make it playable in Storyboard");
  } finally {
    await ui.close();
  }
});

it("keeps older AI scenes, under their own heading, still startable", async () => {
  const campaign = newCampaignTemplate({
    name: "Old style",
    scenes: [{ ...emptyCampaignScene(), name: "Opening", placeId: "p1", people: [someone] }],
  });
  const ui = await open(campaign);
  try {
    expect(ui.host.textContent).toContain("Earlier scene format");
    expect(buttons(ui.host)).not.toContain("+ Scene");
    expect(buttons(ui.host).some((label) => /start/i.test(label))).toBe(true);
  } finally {
    await ui.close();
  }
});

it("shows playable and older scenes side by side without hiding either", async () => {
  const built = connectedAdventureExample();
  const campaign = {
    ...built.campaign,
    scenes: [
      ...built.campaign.scenes,
      {
        ...emptyCampaignScene(),
        name: "An old scene",
        placeId: built.places[0]!.id,
        people: [someone],
      },
    ],
  };
  const ui = await open(campaign);
  try {
    await clickNav(ui.host, "scenes");
    expect(buttons(ui.host)).toContain("Test this scene →");
    expect(ui.host.textContent).toContain("Earlier scene format");
    const names = Array.from(ui.host.querySelectorAll("input")).map((input) => input.value);
    expect(names).toContain("An old scene");
  } finally {
    await ui.close();
  }
});

it("shows the guided steps in order and marks the finished ones", async () => {
  const built = connectedAdventureExample();
  const ui = await open(built.campaign, built);
  try {
    const steps = Array.from(ui.host.querySelectorAll<HTMLElement>(".campaign-nav__step"));
    expect(steps.map((step) => step.dataset.step)).toEqual([
      "world",
      "you",
      "cast",
      "scenes",
      "connections",
      "test",
    ]);
    const done = (id: string) =>
      ui.host
        .querySelector(`[data-step="${id}"] .campaign-nav__mark`)!
        .classList.contains("is-done");
    expect(done("scenes")).toBe(true);
    expect(done("connections")).toBe(true);
    expect(done("test")).toBe(true);
    expect(ui.host.querySelector('[data-step="scenes"]')!.textContent).toContain("2 of 2 ready");
  } finally {
    await ui.close();
  }
});

it("opens Storyboard on the step that was chosen", async () => {
  const built = connectedAdventureExample();
  const ui = await open(built.campaign, built);
  try {
    await clickNav(ui.host, "connections");
    const connections = document.querySelector('[aria-label="Connections"]');
    expect(connections?.getAttribute("aria-current")).toBe("step");
  } finally {
    await ui.close();
  }
});

it("switches between people and things inside the Cast step", async () => {
  const campaign = newCampaignTemplate({ name: "Fresh", scenes: [emptyCampaignScene()] });
  const ui = await open(campaign);
  try {
    await clickNav(ui.host, "cast");
    const pressed = () =>
      Array.from(ui.host.querySelectorAll(".campaign-cast-switch button"))
        .filter((b) => b.getAttribute("aria-pressed") === "true")
        .map((b) => b.textContent);
    expect(pressed()).toEqual(["People"]);
    const things = Array.from(ui.host.querySelectorAll(".campaign-cast-switch button")).find(
      (b) => b.textContent === "Things",
    ) as HTMLButtonElement;
    await act(async () => things.click());
    expect(pressed()).toEqual(["Things"]);
    expect(ui.host.querySelector('[data-step="cast"]')!.getAttribute("aria-current")).toBe("step");
  } finally {
    await ui.close();
  }
});
