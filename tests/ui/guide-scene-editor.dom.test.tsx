// @vitest-environment jsdom
import { IDBFactory } from "fake-indexeddb";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { newAdventureGuideDraft } from "../../src/library/adventureGuidePlan";
import { lighthouseExample } from "../../src/library/examples/guidePlans";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import type { Session } from "../../src/state/StateSchema";
import { GuideSceneEditor } from "../../src/ui/studio/GuideSceneEditor";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import { CampaignStudio } from "../../src/ui/studio/CampaignStudio";
import { ConnectionProvider } from "../../src/ui/connection/ConnectionProvider";

it("compares a manual Studio change, keeps it by choice and starts a fresh playtest", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal ??= function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function () {
    this.open = false;
  };
  const repo = new IndexedDBRepository(new IDBFactory(), "guide-scene-editor");
  const draft = newAdventureGuideDraft(lighthouseExample.plan, lighthouseExample.answers);
  await repo.createGuideDraft(draft);
  const campaign = await repo.approveGuideDraft(draft.id, draft.revision);
  const [letter] = await repo.listObjects();
  await repo.saveObject({ ...letter!, readableContent: "Sparad Studio-text." });
  const target = { campaignId: campaign.id, sceneId: campaign.startSceneId! };
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const play = vi.fn<(session: Session) => Promise<void>>().mockResolvedValue(undefined);
  async function until(check: () => void) {
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      check();
    });
  }
  async function click(text: string) {
    const button = Array.from(host.querySelectorAll("button")).find(
      (entry) => entry.textContent === text,
    );
    expect(button, text).toBeDefined();
    await act(async () => button!.click());
  }
  async function fill(label: string, value: string) {
    const area = Array.from(host.querySelectorAll("label"))
      .find((entry) => entry.firstElementChild?.textContent === label)
      ?.querySelector("textarea");
    expect(area, label).toBeDefined();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        area,
        value,
      );
      area!.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  try {
    localStorage.setItem("sandboxai:interface-language", "sv");
    await act(async () =>
      root.render(
        <LanguageProvider>
          <GuideSceneEditor repo={repo} target={target} close={() => {}} onPlay={play} />
        </LanguageProvider>,
      ),
    );
    await until(() => expect(host.textContent).toContain("Sparad Studio-text."));
    await click("Ändra ankomsttext");
    await fill("Ankomsttext", "Fyrvakten står vid ett öppet fönster.");
    await click("Ändra läsbar text för ”det oväntade brevet”");
    await fill("Läsbar text för ”Det oväntade brevet”", "Förslag om ny brevtext.");
    await click("Granska ändringar");
    await until(() => expect(host.querySelector('[aria-label="Jämför ändringar"]')).not.toBeNull());
    expect(host.textContent).toContain("Sparad Studio-text.");
    expect(host.textContent).toContain("Förslag om ny brevtext.");
    const apply = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Tillämpa valda ändringar",
    )!;
    expect(apply.disabled).toBe(true);
    const keep = Array.from(host.querySelectorAll("label"))
      .find((entry) => entry.textContent?.trim() === "Behåll nuvarande text")!
      .querySelector("input")!;
    await act(async () => keep.click());
    await act(async () => apply.click());
    await until(() => expect(host.textContent).toContain("Scenen är uppdaterad"));
    await click("Provspela från början");
    await until(() => expect(play).toHaveBeenCalledTimes(1));
    const session = play.mock.calls[0]![0];
    expect(session.encounter?.definition.description).toBe("Fyrvakten står vid ett öppet fönster.");
    expect(session.encounter?.definition.items[0]?.readableContent).toBe("Sparad Studio-text.");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    localStorage.removeItem("sandboxai:interface-language");
  }
});

it.each([
  { remoteField: "name", remoteText: "Nytt namn i flik B" },
  { remoteField: "arrival", remoteText: "Ankomst skriven i flik B" },
])(
  "preserves the local arrival after reloading a competing $remoteField proposal",
  async ({ remoteField, remoteText }) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    HTMLDialogElement.prototype.showModal ??= function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function () {
      this.open = false;
    };
    const factory = new IDBFactory();
    const repo = new IndexedDBRepository(factory, "guide-reload");
    const otherTab = new IndexedDBRepository(factory, "guide-reload");
    const draft = newAdventureGuideDraft(lighthouseExample.plan, lighthouseExample.answers);
    await repo.createGuideDraft(draft);
    const campaign = await repo.approveGuideDraft(draft.id, draft.revision);
    const target = { campaignId: campaign.id, sceneId: campaign.startSceneId! };
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    const ownText = "Ankomst skriven i flik A";
    function button(label: string) {
      return Array.from(host.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.trim() === label,
      );
    }
    async function until(check: () => void) {
      await vi.waitFor(async () => {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        });
        check();
      });
    }
    async function click(label: string) {
      expect(button(label)).toBeDefined();
      await act(async () => button(label)!.click());
    }
    try {
      localStorage.setItem("sandboxai:interface-language", "sv");
      await act(async () =>
        root.render(
          <LanguageProvider>
            <GuideSceneEditor repo={repo} target={target} close={() => {}} />
          </LanguageProvider>,
        ),
      );
      await until(() => expect(button("Ändra ankomsttext")).toBeDefined());
      await click("Ändra ankomsttext");
      const textarea = host.querySelector("textarea")!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
          textarea,
          ownText,
        );
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await otherTab.saveGuideSceneRevision(target, 0, { [remoteField]: remoteText });
      await click("Granska ändringar");
      await until(() => expect(button("Läs in senaste scenen")).toBeDefined());
      await click("Läs in senaste scenen");
      if (remoteField === "arrival") {
        await until(() => expect(button("Behåll min text")).toBeDefined());
        expect(host.textContent).toContain(ownText);
        expect(host.textContent).toContain(remoteText);
        expect(button("Spara ändringsutkast")?.disabled).toBe(true);
        await click("Behåll min text");
      } else {
        await until(() =>
          expect(Array.from(host.querySelectorAll("textarea"), (input) => input.value)).toEqual(
            expect.arrayContaining([ownText, remoteText]),
          ),
        );
      }
      await click("Spara ändringsutkast");
      await until(() => expect(host.textContent).toContain("Ändringsutkastet är sparat."));
      const reopened = await otherTab.loadGuideSceneRevision(target);
      expect(reopened.revision.changes).toEqual(
        remoteField === "arrival" ? { arrival: ownText } : { arrival: ownText, name: remoteText },
      );
    } finally {
      await act(async () => root.unmount());
      host.remove();
      localStorage.removeItem("sandboxai:interface-language");
    }
  },
);

it("saves a title from an open Storyboard tab without restoring the old scene text", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const factory = new IDBFactory();
  const repo = new IndexedDBRepository(factory, "studio-revision-title");
  const guideTab = new IndexedDBRepository(factory, "studio-revision-title");
  const draft = newAdventureGuideDraft(lighthouseExample.plan, lighthouseExample.answers);
  await repo.createGuideDraft(draft);
  const campaign = await repo.approveGuideDraft(draft.id, draft.revision);
  const harbor = campaign.scenes.find(({ name }) => name === "Hamnen")!;
  const target = { campaignId: campaign.id, sceneId: harbor.id };
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <CampaignStudio
          repo={repo}
          sessionId="studio-review"
          resume={{ campaignId: campaign.id }}
          onStart={() => {}}
          onOpenShelf={() => {}}
          onOneOff={() => {}}
        />,
      ),
    );
    const title = await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      const input = host.querySelector<HTMLInputElement>('input[aria-label="Adventure name"]');
      expect(input).not.toBeNull();
      return input!;
    });
    const reading = await guideTab.loadGuideSceneRevision(target);
    const review = await guideTab.saveGuideSceneRevision(target, reading.revision.revision, {
      arrival: "Hamnen uppdaterades från guiden.",
    });
    await guideTab.applyGuideSceneRevision(review, {});
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        title,
        "Ny titel från Studio",
      );
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Save adventure",
    )!;
    await act(async () => save.click());
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      const saved = await repo.loadCampaign(campaign.id);
      expect(saved.name).toBe("Ny titel från Studio");
      expect(
        saved.scenes.find(({ id }) => id === harbor.id)?.encounter?.definition.description,
      ).toBe("Hamnen uppdaterades från guiden.");
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("saves and reopens a new manual adventure after editing a guide adventure in the same Studio", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal ??= function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function () {
    this.open = false;
  };
  const repo = new IndexedDBRepository(new IDBFactory(), "studio-new-after-guide");
  const guideDraft = newAdventureGuideDraft(lighthouseExample.plan, lighthouseExample.answers);
  await repo.createGuideDraft(guideDraft);
  const guideCampaign = await repo.approveGuideDraft(guideDraft.id, guideDraft.revision);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const manualName = "The Lantern Festival";

  function title() {
    return host.querySelector<HTMLInputElement>('input[aria-label="Adventure name"]');
  }
  async function until(check: () => void) {
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      check();
    });
  }
  async function click(label: string) {
    const button = Array.from(host.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    expect(button, label).toBeDefined();
    await act(async () => button!.click());
  }

  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
  try {
    await act(async () =>
      root.render(
        <ConnectionProvider>
          <CampaignStudio
            repo={repo}
            sessionId="studio-review"
            resume={null}
            onStart={() => {}}
            onOpenShelf={() => {}}
            onOneOff={() => {}}
          />
        </ConnectionProvider>,
      ),
    );
    await until(() => expect(host.textContent).toContain(guideCampaign.name));
    await click(guideCampaign.name);
    await until(() => expect(title()?.value).toBe(guideCampaign.name));

    await click("All adventures");
    await click("New adventure");
    await act(async () => {
      const input = title()!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        manualName,
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Save adventure");
    await until(() => expect(host.textContent).toContain("Saved."));

    await click("All adventures");
    await click(manualName);
    await until(() => expect(title()?.value).toBe(manualName));
    const saved = await repo.listCampaigns();
    expect(saved).toHaveLength(2);
    const manual = saved.find(({ name }) => name === manualName);
    expect(manual?.id).toBeTruthy();
    expect(manual?.id).not.toBe(guideCampaign.id);
    expect(await repo.loadCampaign(guideCampaign.id)).toEqual(guideCampaign);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
