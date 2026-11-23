// @vitest-environment jsdom
import { IDBFactory } from "fake-indexeddb";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { newAdventureGuideDraft } from "../../src/library/adventureGuidePlan";
import { lighthouseExample } from "../../src/library/examples/guidePlans";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import type { Session } from "../../src/state/StateSchema";
import { ConnectionProvider } from "../../src/ui/connection/ConnectionProvider";
import { HomeScreen } from "../../src/ui/home/HomeScreen";
import { PlayableStoryboard } from "../../src/ui/studio/PlayableStoryboard";

it("uses the saved start on the home page after a Storyboard repair and retains the legacy picker", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
  const dialogMethods = ["showModal", "close"] as const;
  const dialogPrototype = HTMLDialogElement.prototype;
  const descriptors = dialogMethods.map((method) =>
    Object.getOwnPropertyDescriptor(dialogPrototype, method),
  );
  for (const method of dialogMethods) {
    if (!dialogPrototype[method])
      Object.defineProperty(dialogPrototype, method, { configurable: true, value: () => {} });
  }
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    const repo = new IndexedDBRepository(new IDBFactory(), "lighthouse-home");
    const draft = newAdventureGuideDraft(lighthouseExample.plan, lighthouseExample.answers);
    await repo.createGuideDraft(draft);
    const campaign = await repo.approveGuideDraft(draft.id, draft.revision);
    const { startSceneId, ...legacy } = campaign;
    const shed = campaign.scenes.find((scene) => scene.name === "Sjöboden")!;
    await repo.saveCampaign({
      ...campaign,
      scenes: [shed, ...campaign.scenes.filter((scene) => scene.id !== shed.id)],
    });
    await repo.saveCampaign({ ...legacy, id: "legacy", name: "Older adventure" });
    const start = vi.fn<(session: Session) => Promise<void>>().mockResolvedValue(undefined);
    const home = () => (
      <ConnectionProvider>
        <HomeScreen
          repo={repo}
          session={null}
          sessionId="home"
          onResume={() => {}}
          onStart={start}
          onStudio={() => {}}
        />
      </ConnectionProvider>
    );
    await act(async () => root.render(home()));

    async function openAdventure(name: string) {
      const entry = await vi.waitFor(async () => {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        });
        const found = Array.from(host.querySelectorAll("button")).find(
          (button) => !button.disabled && button.textContent?.includes(name),
        );
        expect(found).toBeDefined();
        return found!;
      });
      await act(async () => entry.click());
      return host.querySelector("dialog")!;
    }
    const guided = await openAdventure(campaign.name);
    const guidedChoices = guided.querySelectorAll<HTMLButtonElement>("button.sb-scene-choice");
    expect(Array.from(guidedChoices, (choice) => choice.textContent)).toEqual(["Play"]);
    await act(async () => {
      guidedChoices[0]!.click();
      await vi.waitFor(() =>
        expect(start).toHaveBeenCalledWith(
          expect.objectContaining({
            sceneId: startSceneId,
          }),
        ),
      );
    });
    const close = guided.querySelector<HTMLButtonElement>(".sb-dialog__heading button")!;
    await act(async () => close.click());

    const older = await openAdventure("Older adventure");
    const olderChoices = Array.from(
      older.querySelectorAll<HTMLButtonElement>("button.sb-scene-choice"),
    );
    expect(olderChoices.some((choice) => choice.textContent?.includes("Sjöboden"))).toBe(true);

    const places = await repo.listPlaces();
    const objects = await repo.listObjects();
    const stored = await repo.loadCampaign(campaign.id);
    let save: Promise<void> | undefined;
    function Editor() {
      const [edited, change] = useState({ ...stored, scenes: campaign.scenes });
      return (
        <PlayableStoryboard
          campaign={edited}
          places={places}
          characters={[]}
          objects={objects}
          busy={false}
          onChange={change}
          onPlay={() => {}}
          onSave={() => {
            save = repo.saveCampaign(edited);
          }}
        />
      );
    }
    await act(async () => root.render(<Editor />));
    expect(host.querySelector<HTMLInputElement>('[data-storyboard-field="name"]')?.value).toBe(
      "Fyren",
    );
    const removeScene = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Remove scene",
    )!;
    await act(async () => removeScene.click());
    await act(async () =>
      host.querySelector<HTMLButtonElement>('.storyboard-workflow [aria-label="Test"]')!.click(),
    );
    const startScene = Array.from(host.querySelectorAll("label"))
      .find((label) => label.textContent?.includes("Adventure starting scene"))!
      .querySelector("select")!;
    expect(startScene.value).toBe("");
    expect(Array.from(startScene.options, ({ value }) => value)).not.toContain(startSceneId);
    expect(Array.from(startScene.options, ({ text }) => text)).not.toContain("Återföreningen");
    await act(async () => {
      startScene.value = shed.id;
      startScene.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const saveButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Save adventure",
    )!;
    await act(async () => {
      saveButton.click();
      await save;
    });
    const reopened = await repo.loadCampaign(campaign.id);
    expect(reopened.startSceneId).toBe(shed.id);
    expect(reopened.scenes.some(({ id }) => id === startSceneId)).toBe(false);
    await act(async () => root.render(home()));
    const repaired = await openAdventure(campaign.name);
    await act(async () => {
      repaired.querySelector<HTMLButtonElement>(".sb-scene-choice")!.click();
      await vi.waitFor(() =>
        expect(start).toHaveBeenLastCalledWith(
          expect.objectContaining({
            sceneId: shed.id,
          }),
        ),
      );
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
    for (const [index, method] of dialogMethods.entries()) {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(dialogPrototype, method, descriptor);
      else Reflect.deleteProperty(dialogPrototype, method);
    }
    vi.unstubAllGlobals();
  }
});
