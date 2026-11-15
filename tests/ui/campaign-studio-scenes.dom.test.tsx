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

async function open(campaign: ReturnType<typeof newCampaignTemplate>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const repo = new IndexedDBRepository(new IDBFactory(), `studio-${campaign.id}`);
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
  const button = Array.from(host.querySelectorAll(".campaign-nav__btn")).find(
    (b) => b.textContent === label,
  ) as HTMLButtonElement;
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
    await clickNav(ui.host, "Scenes");
    expect(buttons(ui.host)).toContain("Test this scene →");
    expect(ui.host.textContent).toContain("Earlier scene format");
    const names = Array.from(ui.host.querySelectorAll("input")).map((input) => input.value);
    expect(names).toContain("An old scene");
  } finally {
    await ui.close();
  }
});
