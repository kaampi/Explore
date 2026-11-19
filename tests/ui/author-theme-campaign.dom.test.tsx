// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, it, vi } from "vitest";
import { CampaignStudio } from "../../src/ui/studio/CampaignStudio";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { PRESET_THEMES } from "../../src/ui/themes/theme";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// The choice of AI model needs a connection to the AI, which these tests do not use.
vi.mock("../../src/ui/components/OllamaModelPicker", () => ({
  OllamaModelPicker: () => <span data-model-picker="true" />,
}));
afterEach(() => {
  document.body.innerHTML = "";
});

async function open(theme?: (typeof PRESET_THEMES)[number]) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const library = connectedAdventureExample();
  const campaign = { ...library.campaign, ...(theme ? { theme } : {}) };
  const repo = new IndexedDBRepository(new IDBFactory(), `author-theme-${Math.random()}`);
  await repo.saveRealm(library.realm);
  for (const place of library.places) await repo.savePlace(place);
  for (const person of library.characters) await repo.saveCharacter(person);
  for (const object of library.objects) await repo.saveObject(object);
  await repo.saveCampaign(campaign);
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    createRoot(host).render(
      <LanguageProvider>
        <CampaignStudio
          sessionId="s"
          repo={repo}
          resume={{ campaignId: campaign.id }}
          onStart={() => {}}
          onOpenShelf={() => {}}
          onOneOff={() => {}}
        />
      </LanguageProvider>,
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  await act(async () => host.querySelector<HTMLButtonElement>('[data-step="world"]')!.click());
  const select = () =>
    host.querySelector<HTMLSelectElement>('select[aria-label="Look when it is played"]')!;
  const save = async () => {
    const button = Array.from(host.querySelectorAll("button")).find((b) =>
      /^Save adventure/i.test(b.textContent ?? ""),
    )!;
    await act(async () => button.click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
  };
  const pick = (value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
        select(),
        value,
      );
      select().dispatchEvent(new Event("change", { bubbles: true }));
    });
  return { repo, campaign, host, select, save, pick };
}

it("has a choice of look in the World step of the adventure, and saves it with the adventure", async () => {
  const ui = await open();
  expect(ui.select().value).toBe("");
  expect(ui.host.querySelector(".author-theme__hint")!.textContent).toContain(
    "The player can always change it while playing.",
  );

  await ui.pick("scifi");
  await ui.save();

  const saved = await ui.repo.loadCampaign(ui.campaign.id);
  expect(saved.theme).toEqual(PRESET_THEMES.find((t) => t.id === "scifi"));
});

it("shows the look an adventure has, and takes it away when none is chosen", async () => {
  const fantasy = PRESET_THEMES.find((t) => t.id === "fantasy")!;
  const ui = await open(fantasy);
  expect(ui.select().value).toBe("fantasy");

  await ui.pick("");
  await ui.save();

  expect((await ui.repo.loadCampaign(ui.campaign.id)).theme).toBeUndefined();
});
