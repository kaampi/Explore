import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";
import { EventLog } from "../../src/events/EventLog";
import { adventureOptions, knownThings } from "../../src/game/AdventureEngine";
import { buildGuideAdventure } from "../../src/library/buildGuideAdventure";
import {
  AdventureGuideDraftSchema,
  newAdventureGuideDraft,
  type AdventureGuideDraft,
} from "../../src/library/adventureGuidePlan";
import { lighthouseExample, musicianExample } from "../../src/library/examples/guidePlans";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import {
  sessionFromAdventureStart,
  sessionFromCampaignScene,
} from "../../src/session/campaignStart";
import { StateEngine } from "../../src/state/StateEngine";
import { adventureFacts } from "../../src/library/playableCampaign";
import { reachableFromStart, storyboardWarnings } from "../../src/ui/studio/storyboardReadiness";

function newLighthouseGuideDraft(map?: AdventureGuideDraft["map"]) {
  return newAdventureGuideDraft(lighthouseExample.plan, lighthouseExample.answers, map);
}

async function startArguments(repo: IndexedDBRepository, campaignId: string) {
  const [campaign, places, realms, objects] = await Promise.all([
    repo.loadCampaign(campaignId),
    repo.listPlaces(),
    repo.listRealms(),
    repo.listObjects(),
  ]);
  return { campaign, places, realms, objects, characters: [], voices: [], rulesets: [] };
}

/** Temporary guide playtest entry until the interview has a button of its own. */
async function startGuidePlaytest(repo: IndexedDBRepository, draftId: string) {
  const draft = await repo.loadGuideDraft(draftId);
  if (!draft.applied) throw new Error("Approve the plan before playing.");
  const args = await startArguments(repo, draft.applied.campaignId);
  const result = sessionFromAdventureStart(args, "guide-playtest");
  if (!result.ok) throw new Error(result.reason);
  return new StateEngine(result.session, new EventLog());
}

async function approvedPlan() {
  const repo = new IndexedDBRepository(new IDBFactory(), "lighthouse");
  const draft = newLighthouseGuideDraft();
  await repo.createGuideDraft(draft);
  const campaign = await repo.approveGuideDraft(draft.id, draft.revision);
  return { repo, draft, campaign };
}

function act(engine: StateEngine, label: string) {
  const game = engine.getSession().encounter!;
  const interaction = game.definition.interactions.find((action) => action.label === label)!;
  engine.executeEncounterAction(
    {
      id: crypto.randomUUID(),
      expectedRevision: game.state.revision,
      expectedSceneId: game.definition.id,
      action: { kind: "interaction", interactionId: interaction.id },
    },
    () => {
      throw new Error("The authored choices need no roll.");
    },
  );
}

function travel(engine: StateEngine, linkId: string) {
  engine.transitionAdventure({
    id: crypto.randomUUID(),
    linkId,
    expectedStateVersion: engine.getSession().stateVersion,
  });
}

it("reports a self-link on that plan link and saves no adventure resources on approval", async () => {
  const factory = new IDBFactory();
  const dbName = "guide-self-link";
  const repo = new IndexedDBRepository(factory, dbName);
  const draft = newLighthouseGuideDraft();
  await repo.createGuideDraft(draft);
  const link = draft.plan.links[0]!;
  link.toSceneId = link.fromSceneId;
  const issue = {
    path: ["plan", "links", link.id],
    message: "A link must lead to a different scene.",
  };
  expect(AdventureGuideDraftSchema.safeParse(draft)).toMatchObject({
    success: false,
    error: { issues: [issue] },
  });

  // Simulate a draft persisted before this validation rule existed.
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(dbName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("guideDrafts", "readwrite");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.objectStore("guideDrafts").put(draft);
    });
  } finally {
    db.close();
  }

  await expect(repo.approveGuideDraft(draft.id, draft.revision)).rejects.toMatchObject({
    issues: [issue],
  });
  expect(await repo.listCampaigns()).toEqual([]);
  expect(await repo.listRealms()).toEqual([]);
  expect(await repo.listPlaces()).toEqual([]);
  expect(await repo.listObjects()).toEqual([]);
});

it("keeps the story link between two different scenes at the same place", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "guide-shared-place");
  const draft = newLighthouseGuideDraft();
  const shed = draft.plan.scenes.find((scene) => scene.id === "shed");
  if (shed?.kind !== "playable") throw new Error("Expected a playable shed scene.");
  shed.placeId = "lighthouse";
  const preview = buildGuideAdventure(AdventureGuideDraftSchema.parse(draft));
  expect(preview.realm?.worldMap?.routes).toHaveLength(1);
  await repo.createGuideDraft(draft);
  const campaign = await repo.approveGuideDraft(draft.id, draft.revision);
  const link = campaign.sceneLinks.find(({ label }) => label === "Gå till sjöboden")!;
  const origin = campaign.scenes.find(({ id }) => id === link.fromSceneId)!;
  const target = campaign.scenes.find(({ id }) => id === link.toSceneId)!;
  expect(origin.id).not.toBe(target.id);
  expect(target.placeId).toBe(origin.placeId);
  expect(target.mapNodeId).toBe(origin.mapNodeId);

  const engine = await startGuidePlaytest(repo, draft.id);
  act(engine, "Läs brevet");
  act(engine, "Tyd ledtråden");
  travel(engine, link.id);
  expect(engine.getSession().sceneId).toBe(target.id);
});

it("starts the guide and ordinary play at the saved lighthouse and opens the shed only after the clue and choice", async () => {
  const { repo, campaign, draft } = await approvedPlan();
  const shedLink = campaign.sceneLinks.find((link) => link.label === "Gå till sjöboden")!;
  const args = await startArguments(repo, campaign.id);
  const shed = args.campaign.scenes.find((scene) => scene.id === shedLink.toSceneId)!;
  // Deliberately reorder the saved scenes to make the shed the first card.
  args.campaign.scenes = [shed, ...args.campaign.scenes.filter((scene) => scene.id !== shed.id)];
  await repo.saveCampaign(args.campaign);
  const saved = await startArguments(repo, campaign.id);
  const reachable = reachableFromStart(saved.campaign).scenes;
  expect(reachable).toEqual(
    new Set(saved.campaign.scenes.filter((scene) => scene.encounter).map(({ id }) => id)),
  );
  const facts = new Set(adventureFacts(saved.campaign).map(({ id }) => id));
  expect(
    storyboardWarnings(saved.campaign, facts).filter(
      (issue) => issue.kind === "scene" && issue.field === "reach",
    ),
  ).toEqual([]);
  const launch = sessionFromAdventureStart(saved, "home-play", shed.id);
  expect(launch.ok && launch.session.sceneId).toBe(campaign.startSceneId);

  const engine = await startGuidePlaytest(repo, draft.id);
  const start = engine.getSession();
  expect(start.sceneId).toBe(campaign.startSceneId);
  expect(start.encounter!.definition.title).toBe("Fyren");
  expect(start.adventure!.scenes.some((scene) => scene.id === shed.id)).toBe(true);
  expect(start.adventure!.scenes.some((scene) => scene.name === "Återföreningen")).toBe(false);
  expect(JSON.stringify(start)).not.toContain(draft.answers.authorNote);
  const [letter] = await repo.listObjects();
  expect(letter?.readableContent).toContain("tjäran");
  expect(start.encounter!.state.actors.player!.inventory).toContain(letter?.id);
  expect(adventureOptions(start)).toEqual([]);
  expect(() => travel(engine, shedLink.id)).toThrow("not available");
  expect(engine.getSession()).toEqual(start);
  expect(() => act(engine, "Tyd ledtråden")).toThrow("conditions");

  act(engine, "Läs brevet");
  expect(knownThings(engine.getSession())[0]?.text).toContain("tredje brädan");
  expect(adventureOptions(engine.getSession())).toEqual([]);
  act(engine, "Tyd ledtråden");
  expect(adventureOptions(engine.getSession()).map((link) => link.label)).toEqual([
    "Gå till sjöboden",
  ]);
  travel(engine, shedLink.id);
  expect(engine.getSession().encounter!.definition.description).toContain("en reservnyckel");
  expect(engine.getSession().storyFlags).not.toContain(`${draft.id}:followed`);

  const authorTest = sessionFromCampaignScene({ ...saved, scene: shed }, "author-test");
  expect(authorTest.ok && authorTest.session.sceneId).toBe(shed.id);
  const legacy = structuredClone(saved);
  delete legacy.campaign.startSceneId;
  expect(reachableFromStart(legacy.campaign).scenes).toEqual(new Set([shed.id]));
  const legacyStart = sessionFromAdventureStart(legacy, "older-adventure", shed.id);
  expect(legacyStart.ok && legacyStart.session.sceneId).toBe(shed.id);
  saved.campaign.scenes = saved.campaign.scenes.filter(
    (scene) => scene.id !== campaign.startSceneId,
  );
  expect(sessionFromAdventureStart(saved, "missing-start", shed.id)).toMatchObject({ ok: false });
  saved.campaign.startSceneId = null;
  expect(sessionFromAdventureStart(saved, "pending-start", shed.id)).toMatchObject({ ok: false });
  expect(reachableFromStart(saved.campaign).scenes.size).toBe(0);
});

it.each([
  ["Förhandla om lokalen", "Gå in i konsertlokalen", "en timme på scen", false],
  ["Spela på torget", "Gå till torget", "förbipasserande", true],
] as const)(
  "builds and plays the musician's choice %s from plan data",
  async (choice, way, arrival, street) => {
    const repo = new IndexedDBRepository(new IDBFactory(), "musician");
    const draft = newAdventureGuideDraft(musicianExample.plan, musicianExample.answers);
    const preview = buildGuideAdventure(draft);
    await repo.createGuideDraft(draft);
    const campaign = await repo.approveGuideDraft(draft.id, draft.revision);
    expect(campaign).toMatchObject({ id: preview.campaign.id, name: "Kvällens konsert" });
    expect(campaign.scenes.map(({ name }) => name)).toEqual(["Foajén", "Konsertlokalen", "Torget"]);
    expect(await repo.listObjects()).toEqual([]);

    const engine = await startGuidePlaytest(repo, draft.id);
    expect(engine.getSession().encounter?.state.actors.player?.name).toBe("Musikern");
    expect(adventureOptions(engine.getSession())).toEqual([]);
    act(engine, choice);
    const ways = adventureOptions(engine.getSession());
    expect(ways.map(({ label }) => label)).toEqual([way]);
    travel(engine, ways[0]!.id);
    expect(engine.getSession().encounter?.definition.description).toContain(arrival);
    expect(engine.getSession().storyFlags.includes(`${draft.id}:street-concert`)).toBe(street);
  },
);

it("opens only the harbor after taking that branch and records that someone follows", async () => {
  const { repo, draft } = await approvedPlan();
  const engine = await startGuidePlaytest(repo, draft.id);
  act(engine, "Läs brevet");
  act(engine, "Fråga i hamnen");
  expect(() => act(engine, "Tyd ledtråden")).toThrow("conditions");
  const ways = adventureOptions(engine.getSession());
  expect(ways.map((link) => link.label)).toEqual(["Gå till hamnen"]);
  travel(engine, ways[0]!.id);
  expect(engine.getSession().encounter!.definition.description).toContain("främling följer efter");
  expect(engine.getSession().storyFlags).toContain(`${draft.id}:followed`);
});

it("retains the guide answers and saves no adventure when the previewed map node disappears", async () => {
  const factory = new IDBFactory();
  const repo = new IndexedDBRepository(factory, "removed-node");
  const otherTab = new IndexedDBRepository(factory, "removed-node");
  const existing = buildGuideAdventure(newLighthouseGuideDraft());
  const realm = existing.realm!;
  const map = realm.worldMap!;
  await repo.saveRealm(realm);
  for (const place of existing.places) await repo.savePlace(place);
  const [lighthouse, shed, harbor] = map.nodes.map((node) => ({
    nodeId: node.id,
    placeId: node.placeId!,
    placeCardId: node.placeId!,
  }));
  const selected: AdventureGuideDraft["map"] = {
    kind: "existing",
    realmId: realm.id,
    sites: { lighthouse: lighthouse!, shed: shed!, harbor: harbor! },
  };
  const draft = newLighthouseGuideDraft(selected);
  await repo.createGuideDraft(draft);
  const preview = buildGuideAdventure(draft, { realm, places: existing.places });
  expect(preview.campaign.scenes.find((scene) => scene.name === "Sjöboden")?.mapNodeId).toBe(
    shed!.nodeId,
  );

  await otherTab.saveRealm({
    ...realm,
    worldMap: {
      ...map,
      nodes: map.nodes.filter((node) => node.id !== shed!.nodeId),
      routes: map.routes.filter(
        (route) => route.from !== shed!.nodeId && route.to !== shed!.nodeId,
      ),
    },
  });
  await expect(repo.approveGuideDraft(draft.id, draft.revision)).rejects.toMatchObject({
    name: "GuideMapChoiceError",
    site: "shed",
    referenceId: shed!.nodeId,
    message: "Välj kartplats för Sjöboden på nytt.",
  });
  const reloaded = new IndexedDBRepository(factory, "removed-node");
  expect(await reloaded.loadGuideDraft(draft.id)).toEqual(draft);
  expect(await reloaded.listCampaigns()).toEqual([]);
  expect(await reloaded.listObjects()).toEqual([]);
  expect(await reloaded.listPlaces()).toHaveLength(existing.places.length);
  expect(await reloaded.loadPlace(shed!.placeId)).toBeDefined();
  expect(await reloaded.listRealms()).toHaveLength(1);
  await otherTab.saveRealm(realm);
  const approved = await reloaded.approveGuideDraft(draft.id, draft.revision);
  expect(approved.mapWorldId).toBe(realm.id);
  expect(await reloaded.listPlaces()).toHaveLength(existing.places.length);
  expect(await reloaded.listRealms()).toHaveLength(1);
  expect(await reloaded.listObjects()).toHaveLength(1);
});

it("rolls back a write failure and permits a retry, including concurrent approvals of the same revision", async () => {
  const factory = new IDBFactory();
  const repo = new IndexedDBRepository(factory, "approval-retry");
  const draft = newLighthouseGuideDraft();
  await repo.createGuideDraft(draft);
  const [letter] = buildGuideAdventure(draft).objects;
  await repo.saveObject(letter!);
  await expect(repo.approveGuideDraft(draft.id, draft.revision)).rejects.toThrow();
  expect(await repo.listRealms()).toEqual([]);
  expect(await repo.listPlaces()).toEqual([]);
  expect(await repo.listCampaigns()).toEqual([]);
  expect(await repo.loadGuideDraft(draft.id)).toEqual(draft);
  await repo.deleteObject(letter!.id);
  const otherTab = new IndexedDBRepository(factory, "approval-retry");
  const [first, second] = await Promise.all([
    repo.approveGuideDraft(draft.id, draft.revision),
    otherTab.approveGuideDraft(draft.id, draft.revision),
  ]);
  expect(first.id).toBe(second.id);
  expect(await repo.listCampaigns()).toHaveLength(1);
  expect(await repo.listObjects()).toHaveLength(1);
  expect(await repo.listPlaces()).toHaveLength(3);
  expect(await repo.listRealms()).toHaveLength(1);
});
