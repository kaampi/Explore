import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import { EventLog } from "../../src/events/EventLog";
import { newAdventureGuideDraft } from "../../src/library/adventureGuidePlan";
import { lighthouseExample } from "../../src/library/examples/guidePlans";
import { guideRevisionRows, GuideSceneConflictError } from "../../src/library/guideSceneRevision";
import { syncAdventure } from "../../src/library/sceneSync";
import {
  CampaignEditConflictError,
  IndexedDBRepository,
} from "../../src/persistence/IndexedDBRepository";
import { sessionFromAdventureStart } from "../../src/session/campaignStart";
import { StateEngine } from "../../src/state/StateEngine";

async function fixture(name: string) {
  const factory = new IDBFactory();
  const repo = new IndexedDBRepository(factory, name);
  const draft = newAdventureGuideDraft(lighthouseExample.plan, lighthouseExample.answers);
  await repo.createGuideDraft(draft);
  const campaign = await repo.approveGuideDraft(draft.id, draft.revision);
  const harbor = campaign.scenes.find(({ name }) => name === "Hamnen")!;
  const start = { campaignId: campaign.id, sceneId: campaign.startSceneId! };
  const [letter] = await repo.listObjects();
  return {
    repo,
    otherTab: new IndexedDBRepository(factory, name),
    campaign,
    start,
    letter: letter!,
    harbor: { campaignId: campaign.id, sceneId: harbor.id },
  };
}

async function playHarbor(repo: IndexedDBRepository, campaignId: string) {
  const [campaign, realms, places, objects] = await Promise.all([
    repo.loadCampaign(campaignId),
    repo.listRealms(),
    repo.listPlaces(),
    repo.listObjects(),
  ]);
  const result = sessionFromAdventureStart(
    { campaign, realms, places, objects, characters: [], voices: [], rulesets: [] },
    "guide-revision-playtest",
  );
  if (!result.ok) throw new Error(result.reason);
  const engine = new StateEngine(result.session, new EventLog());
  const startText = result.session.encounter!.definition.items[0]!.readableContent;
  for (const label of ["Läs brevet", "Fråga i hamnen"]) {
    const game = engine.getSession().encounter!;
    const interaction = game.definition.interactions.find((action) => action.label === label)!;
    engine.executeEncounterAction({
      id: interaction.id,
      expectedSceneId: game.definition.id,
      expectedRevision: game.state.revision,
      action: { kind: "interaction", interactionId: interaction.id },
    });
  }
  const link = campaign.sceneLinks.find(({ label }) => label === "Gå till hamnen")!;
  engine.transitionAdventure({
    id: "harbor",
    linkId: link.id,
    expectedStateVersion: engine.getSession().stateVersion,
  });
  return { startText, session: engine.getSession() };
}

it("revises the played scene and keeps the Studio letter text on the next playtest", async () => {
  const { repo, otherTab, campaign, harbor, letter } = await fixture("guide-scenes-playtest");
  const first = await playHarbor(repo, campaign.id);
  expect(first.session.adventure?.currentSceneId).toBe(harbor.sceneId);
  expect(await repo.hasGuideScene(harbor)).toBe(true);
  expect(await repo.hasGuideScene({ ...harbor, campaignId: "older-adventure" })).toBe(false);
  await otherTab.saveObject({ ...letter, readableContent: "Studio: följ ljuset till piren." });
  const loaded = await repo.loadGuideSceneRevision(harbor);
  const review = await repo.saveGuideSceneRevision(harbor, loaded.revision.revision, {
    arrival: "Hamnarbetaren ger dig ett nytt uppdrag.",
  });
  expect(guideRevisionRows(review).map(({ id }) => id)).toEqual(["arrival"]);
  await repo.applyGuideSceneRevision(review, {});
  const second = await playHarbor(repo, campaign.id);
  expect(second.startText).toBe("Studio: följ ljuset till piren.");
  expect(second.session.encounter?.definition.description).toBe(
    "Hamnarbetaren ger dig ett nytt uppdrag.",
  );
  expect(first.session.encounter?.definition.description).toContain("främling följer efter");
});

it("keeps the new harbor text when an older Storyboard tab saves only the title", async () => {
  const { repo, otherTab, campaign, harbor } = await fixture("guide-scenes-title");
  const baseline = await otherTab.loadCampaign(campaign.id);
  const scene = await repo.loadGuideSceneRevision(harbor);
  const review = await repo.saveGuideSceneRevision(harbor, scene.revision.revision, {
    arrival: "Ny hamntext.",
  });
  await repo.applyGuideSceneRevision(review, {});
  const edited = { ...baseline, name: "Ny titel från Storyboard" };
  await expect(otherTab.saveCampaign(edited)).rejects.toBeInstanceOf(CampaignEditConflictError);
  const saved = await otherTab.saveEditedCampaign(edited, baseline);
  expect(saved.name).toBe("Ny titel från Storyboard");
  expect((await playHarbor(repo, campaign.id)).session.encounter?.definition.description).toBe(
    "Ny hamntext.",
  );
});

it("requires a choice when Studio and the guide change the same arrival text", async () => {
  const { repo, otherTab, campaign, harbor } = await fixture("guide-scenes-studio-conflict");
  const baseline = await otherTab.loadCampaign(campaign.id);
  const scene = await repo.loadGuideSceneRevision(harbor);
  const review = await repo.saveGuideSceneRevision(harbor, scene.revision.revision, {
    arrival: "Guidens hamntext.",
  });
  await repo.applyGuideSceneRevision(review, {});
  const edited = structuredClone(baseline);
  edited.name = "Ny titel";
  edited.scenes.find(({ id }) => id === harbor.sceneId)!.encounter!.definition.description =
    "Min hamntext.";
  const rejected = await otherTab
    .saveEditedCampaign(edited, baseline)
    .catch((error: unknown) => error);
  expect(rejected).toBeInstanceOf(CampaignEditConflictError);
  if (!(rejected instanceof CampaignEditConflictError)) throw new Error("Expected a conflict.");
  expect(rejected.conflicts).toEqual([
    expect.objectContaining({
      latest: "Guidens hamntext.",
      local: "Min hamntext.",
    }),
  ]);
  expect((await repo.loadCampaign(campaign.id)).name).toBe(baseline.name);
  await otherTab.saveEditedCampaign(edited, baseline, {
    revision: rejected.revision!,
    choices: { [rejected.conflicts[0]!.key]: "local" },
  });
  expect((await repo.loadCampaign(campaign.id)).name).toBe("Ny titel");
  expect((await playHarbor(repo, campaign.id)).session.encounter?.definition.description).toBe(
    "Min hamntext.",
  );
});

it("shows both versions of a changed letter and keeps a guide edit local to this adventure", async () => {
  const { repo, otherTab, campaign, start, letter } = await fixture("guide-scenes-letter");
  const otherAdventure = { ...campaign, id: "sharing-the-letter" };
  await repo.saveCampaign(otherAdventure);
  await otherTab.saveObject({ ...letter, readableContent: "Brevet ändrades i Studio." });
  const fieldId = `item:${letter.id}`;
  const original = await repo.loadGuideSceneRevision(start);
  const review = await repo.saveGuideSceneRevision(start, original.revision.revision, {
    [fieldId]: "Ett nytt brev från guiden.",
  });
  expect(guideRevisionRows(review)).toEqual([
    expect.objectContaining({
      conflict: true,
      proposed: "Ett nytt brev från guiden.",
      field: expect.objectContaining({
        baseline: letter.readableContent,
        current: "Brevet ändrades i Studio.",
      }),
    }),
  ]);
  await expect(repo.applyGuideSceneRevision(review, {})).rejects.toThrow("Välj vilken text");
  const kept = await repo.applyGuideSceneRevision(review, { [fieldId]: "studio" });
  expect(kept.guideItemText?.[letter.id]).toBeUndefined();
  const current = await repo.loadGuideSceneRevision(start);
  const nextReview = await repo.saveGuideSceneRevision(start, current.revision.revision, {
    [fieldId]: "Läs bara detta i fyräventyret.",
  });
  const changed = await repo.applyGuideSceneRevision(nextReview, { [fieldId]: "guide" });
  expect(changed.guideItemText?.[letter.id]).toBe("Läs bara detta i fyräventyret.");
  const savedLibrary = await repo.loadObject(letter.id);
  expect(savedLibrary.readableContent).toBe("Brevet ändrades i Studio.");
  const first = await playHarbor(repo, campaign.id);
  const second = await playHarbor(repo, otherAdventure.id);
  expect(first.startText).toBe("Läs bara detta i fyräventyret.");
  expect(second.startText).toBe("Brevet ändrades i Studio.");
  const synced = syncAdventure(changed, { objects: [savedLibrary], characters: [], places: [] });
  expect(synced.scenes[0]?.encounter?.definition.items[0]?.readableContent).toBe(
    "Läs bara detta i fyräventyret.",
  );
});

it("rejects stale field values, a competing guide draft and a scene removed in Studio", async () => {
  const { repo, otherTab, campaign, harbor } = await fixture("guide-scenes-race");
  const before = await repo.loadGuideSceneRevision(harbor);
  const review = await repo.saveGuideSceneRevision(harbor, before.revision.revision, {
    arrival: "Guidens text.",
  });
  const studio = await otherTab.loadCampaign(campaign.id);
  studio.scenes.find(({ id }) => id === harbor.sceneId)!.encounter!.definition.description =
    "Nyare text i Studio.";
  await otherTab.saveCampaign(studio);
  await expect(repo.applyGuideSceneRevision(review, {})).rejects.toBeInstanceOf(
    GuideSceneConflictError,
  );
  const latest = await repo.loadGuideSceneRevision(harbor);
  expect(latest.revision.changes).toEqual({ arrival: "Guidens text." });
  const newer = await otherTab.saveGuideSceneRevision(harbor, latest.revision.revision, {
    name: "Den gamla hamnen",
  });
  await expect(
    repo.saveGuideSceneRevision(harbor, latest.revision.revision, { arrival: "För gammalt." }),
  ).rejects.toBeInstanceOf(GuideSceneConflictError);
  await expect(repo.applyGuideSceneRevision(latest, { arrival: "guide" })).rejects.toBeInstanceOf(
    GuideSceneConflictError,
  );
  const refreshed = await otherTab.loadCampaign(campaign.id);
  await otherTab.saveCampaign({
    ...refreshed,
    scenes: refreshed.scenes.filter(({ id }) => id !== harbor.sceneId),
    sceneLinks: refreshed.sceneLinks.filter(({ toSceneId }) => toSceneId !== harbor.sceneId),
  });
  await expect(repo.applyGuideSceneRevision(newer, {})).rejects.toThrow("Scenen finns inte kvar");
  expect(
    (await repo.loadCampaign(campaign.id)).scenes.some(({ id }) => id === harbor.sceneId),
  ).toBe(false);
});

it("rolls back both records on interruption and resumes the saved proposal on retry", async () => {
  const { repo, otherTab, campaign, harbor } = await fixture("guide-scenes-abort");
  const loaded = await repo.loadGuideSceneRevision(harbor);
  const review = await repo.saveGuideSceneRevision(harbor, loaded.revision.revision, {
    arrival: "Ny hamntext.",
  });
  const original = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
    this: IDBObjectStore,
    value,
    key,
  ) {
    const request = original.call(this, value, key);
    if (this.name === "prefs" && String(value.id).startsWith("guide-scene-revision:"))
      request.addEventListener("success", () => this.transaction.abort(), { once: true });
    return request;
  });
  try {
    await expect(repo.applyGuideSceneRevision(review, {})).rejects.toThrow();
  } finally {
    spy.mockRestore();
  }
  const reopened = await otherTab.loadGuideSceneRevision(harbor);
  expect(reopened.revision).toEqual(review.revision);
  expect(reopened.fields.find(({ id }) => id === "arrival")?.current).not.toBe("Ny hamntext.");
  await otherTab.applyGuideSceneRevision(reopened, {});
  expect((await playHarbor(repo, campaign.id)).session.encounter?.definition.description).toBe(
    "Ny hamntext.",
  );
});
