import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";
import { EventLog } from "../events/EventLog";
import { IndexedDBRepository } from "../persistence/IndexedDBRepository";
import { installExampleOnce } from "../scenarios/exampleLibrary";
import { startPlayableCampaign } from "../session/adventureStart";
import { StateEngine } from "../state/StateEngine";
import { pendingCutscene } from "../game/cutscenes";
import { CUTSCENE_EXAMPLE, cutsceneExample } from "./example";
import { placementWarnings } from "./placementWarnings";

it("installs the bundled films once and plays the introduction, facts, way and epilogue", async () => {
  const repo = new IndexedDBRepository(new IDBFactory(), "before-bells", 15);
  try {
    const built = await installExampleOnce(repo, CUTSCENE_EXAMPLE, cutsceneExample);
    const films = await repo.listCutsceneFilms();
    expect(films).toHaveLength(4);
    const first = films.find(({ title }) => title === "Morning in Brookmere")!;
    expect(first.images[0]!.dataUrl).toMatch(/^data:image/);
    expect(first.beats[0]?.sound).toMatchObject({ caption: "[A low hum]" });
    expect(first.beats[0]?.sound.trackId).toBeUndefined();
    await repo.saveCutsceneFilm({ ...first, title: "My introduction" });
    const again = await installExampleOnce(repo, CUTSCENE_EXAMPLE, cutsceneExample);
    expect(again.campaign.id).toBe(built.campaign.id);
    expect(await repo.listCutsceneFilms()).toHaveLength(4);
    expect((await repo.loadCutsceneFilm(first.id)).title).toBe("My introduction");
    const { campaign } = again;
    const seed = startPlayableCampaign(
      campaign,
      campaign.scenes[0]!,
      again.places,
      "film-demo",
      [again.realm],
      { characters: again.characters },
    );
    const engine = new StateEngine(seed, new EventLog());
    const finish = () => {
      const session = engine.getSession();
      const queued = pendingCutscene(session)!;
      const title = session.adventure!.cutsceneFilms.find(({ id }) => id === queued.filmId)!.title;
      engine.finishCutscene(queued.id);
      return title;
    };
    const act = (index: number) => {
      const session = engine.getSession();
      engine.executeEncounterAction({
        id: crypto.randomUUID(),
        expectedSceneId: session.adventure!.currentSceneId,
        expectedRevision: session.encounter!.state.revision,
        action: {
          kind: "interaction",
          interactionId: session.encounter!.definition.interactions[index]!.id,
        },
      });
    };
    const go = (index: number) =>
      engine.transitionAdventure({
        id: crypto.randomUUID(),
        linkId: campaign.sceneLinks[index]!.id,
        expectedStateVersion: engine.getSession().stateVersion,
      });
    expect(finish()).toBe("My introduction");
    act(0);
    expect(finish()).toBe("Warning bells");
    go(0);
    expect(finish()).toBe("The north path");
    act(0);
    go(1);
    act(1);
    expect(finish()).toBe("The messenger returns");
  } finally {
    await repo.close();
  }
});

it("reports missing placement targets, impossible facts, and broken film media", () => {
  const { campaign } = cutsceneExample();
  const [intro, road, bells] = campaign.cutscenes;
  const films = campaign.cutsceneFilms!;
  const ringing = films.find(({ id }) => id === bells!.filmId)!;
  ringing.beats[0]!.sound.trackId = "missing";
  ringing.beats[0]!.image.source = { kind: "set", imageId: "missing" };
  campaign.cutscenes = [
    { ...intro!, trigger: { kind: "scene", sceneId: "missing", every: false } },
    { ...road!, trigger: { kind: "link", linkId: "missing" }, filmId: "missing" },
    { ...bells!, trigger: { kind: "facts", flags: ["impossible"] } },
    { ...intro!, id: "empty-test", filmId: "empty-film" },
  ];
  const warnings = placementWarnings(
    campaign,
    new Set(),
    [...films, { ...ringing, id: "empty-film", beats: [] }],
    new Set(),
  );
  expect(warnings.map(({ reason }) => reason)).toEqual([
    "Scene",
    "Film",
    "Link",
    "Fact",
    "Image",
    "Sound",
    "Steps",
  ]);
});
