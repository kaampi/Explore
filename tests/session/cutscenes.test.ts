import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { dueCutscenes, finishCutscene, queueCutscenes } from "../../src/game/cutscenes";
import {
  planPlayback,
  playbackFrame,
  startPlayback,
  advancePlayback,
} from "../../src/cutscenes/playback";
import { CampaignTemplateSchema } from "../../src/library/LibrarySchema";
import { StateEngine } from "../../src/state/StateEngine";
import { parseSession } from "../../src/state/StateSchema";
import { INITIAL_GAME_MINUTES } from "../../src/state/gameClock";
import { EventLog } from "../../src/events/EventLog";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";
import { planDo, planSay } from "../../src/session/encounterAI";
import { SessionNotIdleError } from "../../src/session/SessionEngine";
import { cutsceneAdventure } from "../fixtures/cutscenes";

function play() {
  const fixture = cutsceneAdventure();
  const engine = new StateEngine(fixture.start(), new EventLog());
  const interact = (interactionId: string) => {
    const session = engine.getSession();
    engine.executeEncounterAction({
      id: crypto.randomUUID(),
      expectedSceneId: session.adventure!.currentSceneId,
      expectedRevision: session.encounter!.state.revision,
      action: { kind: "interaction", interactionId },
    });
  };
  const travel = (linkId: string) =>
    engine.transitionAdventure({
      id: crypto.randomUUID(),
      expectedStateVersion: engine.getSession().stateVersion,
      linkId,
    });
  return { ...fixture, engine, interact, travel };
}

describe("cut-scenes", () => {
  it("defaults old adventures and runs without cut-scenes", () => {
    const { campaign, start } = cutsceneAdventure();
    const { cutscenes: _cuts, cutsceneFilms: _films, ...oldCampaign } = campaign;
    expect(CampaignTemplateSchema.parse(oldCampaign).cutscenes).toEqual([]);
    const session = start();
    expect(
      parseSession({
        ...session,
        adventure: {
          ...session.adventure,
          cutscenes: undefined,
          cutsceneFilms: undefined,
          cutscenesSeen: undefined,
          cutscenesPending: undefined,
        },
      }).adventure,
    ).toMatchObject({ cutscenes: [], cutscenesSeen: [], cutscenesPending: [] });
  });

  it("loads a version 1 save into a film and a placement and plays the original paragraphs in order", () => {
    const { legacy, start } = cutsceneAdventure();
    const session = start();
    const run = session.adventure!;
    const migrated = parseSession(
      JSON.parse(
        JSON.stringify({
          ...session,
          adventure: { ...run, cutsceneFilms: undefined, cutscenes: legacy },
        }),
      ),
    );
    const placement = migrated.adventure!.cutscenes.find(({ id }) => id === "intro")!;
    const film = migrated.adventure!.cutsceneFilms.find(({ id }) => id === placement.filmId)!;
    expect(migrated.adventure!.cutscenesPending[0]).toBe(placement.id);
    const plan = planPlayback(film);
    const initial = startPlayback();
    expect(playbackFrame(plan, initial).text?.cell.text).toBe("The roofs are still wet.");
    const next = advancePlayback(plan, initial, { type: "continue" });
    if (next.phase === "ended") throw new Error("The first paragraph ended the film");
    expect(playbackFrame(plan, next).text?.cell.text).toBe("A light comes on by the well.");
    expect(advancePlayback(plan, next, { type: "continue" })).toEqual({
      phase: "ended",
      result: "finished",
    });
    expect(finishCutscene(migrated, placement.id).conversation.at(-1)).toMatchObject({
      content: "The roofs are still wet.\n\nA light comes on by the well.",
    });
  });

  it("copies the campaign, queues the introduction at start and only triggers on new facts", () => {
    const { campaign, start, lead } = cutsceneAdventure();
    const session = start();
    expect(session.adventure!.cutscenesPending).toEqual(["intro"]);
    campaign.cutsceneFilms![0]!.beats[0]!.text!.text = "Changed in the editor";
    expect(session.adventure!.cutsceneFilms[0]!.beats[0]!.text!.text).toBe(
      "The tower rises above the field.",
    );
    const one = { ...session, storyFlags: [lead] };
    const both = { ...one, storyFlags: [lead, "road-travelled"] };
    expect(dueCutscenes(session, one)).toEqual([]);
    expect(dueCutscenes(one, both)).toEqual(["bells"]);
    expect(dueCutscenes(both, both)).toEqual([]);
  });

  it("orders simultaneous triggers by kind and by campaign order within a kind", () => {
    const { campaign, start, lead, tower, out } = cutsceneAdventure();
    campaign.cutscenes.push({
      ...campaign.cutscenes.find((cut) => cut.id === "road")!,
      id: "road-2",
    });
    const before = { ...start(), storyFlags: [lead] };
    const after = {
      ...before,
      storyFlags: [lead, "road-travelled"],
      adventure: {
        ...before.adventure!,
        currentSceneId: tower.id,
        transitions: [
          {
            id: "transition",
            stateVersion: 1,
            linkId: out.id,
            from: out.fromSceneId,
            to: out.toSceneId,
          },
        ],
      },
    };
    expect(dueCutscenes(before, after)).toEqual(["road", "road-2", "bells", "arrival"]);
    expect(dueCutscenes(before, queueCutscenes(after, ["road", "road"]))).toEqual([
      "road-2",
      "bells",
      "arrival",
    ]);
    expect(queueCutscenes(after, ["road", "road"]).adventure!.cutscenesPending).toEqual([
      "intro",
      "road",
    ]);
  });

  it("runs ways, actions and fact chains once and repeats an every-time scene on re-entry", () => {
    const { engine, interact, travel, out, back, village, tower } = play();
    const pending = () => engine.getSession().adventure!.cutscenesPending;
    expect(engine.finishCutscene("intro")).toBe(true);
    interact(village.encounter!.definition.interactions[0]!.id);
    expect(pending()).toEqual([]);
    travel(out.id);
    expect(pending()).toEqual(["road", "bells", "arrival"]);
    expect(engine.finishCutscene("arrival")).toBe(false);
    expect(engine.finishCutscene("road")).toBe(true);
    expect(pending()).toEqual(["bells", "arrival", "wind"]);
    for (const id of ["bells", "arrival", "wind"]) expect(engine.finishCutscene(id)).toBe(true);
    expect(pending()).toEqual([]);
    interact(tower.encounter!.definition.interactions[0]!.id);
    expect(pending()).toEqual([]);
    travel(back.id);
    expect(pending()).toEqual([]);
    interact(village.encounter!.definition.interactions[1]!.id);
    expect(pending()).toEqual(["last"]);
    engine.finishCutscene("last");
    travel(out.id);
    expect(pending()).toEqual(["arrival"]);
    engine.finishCutscene("arrival");
    expect(engine.getSession().adventure!.cutscenesSeen).toEqual([
      "intro",
      "road",
      "bells",
      "arrival",
      "wind",
      "last",
      "arrival",
    ]);
  });

  it("settles effects, time and the complete story once using the same operation for reading and skipping", () => {
    const session = cutsceneAdventure().start();
    const read = finishCutscene(session, "intro");
    const skipped = finishCutscene(session, "intro");
    expect(read).toEqual(skipped);
    expect(session.adventure!.cutscenesPending).toEqual(["intro"]);
    expect(read.adventure).toMatchObject({
      cutscenesPending: [],
      cutscenesSeen: ["intro"],
      clockMinutes: INITIAL_GAME_MINUTES + 10,
    });
    expect(read.storyFlags).toContain("woke");
    expect(read.encounter!.state.flags).toContain("woke");
    expect(read.conversation.at(-1)).toMatchObject({
      cutsceneId: "intro",
      content: "The roofs are still wet.\n\nA light comes on by the well.",
    });
    expect(finishCutscene(read, "intro")).toBe(read);
  });

  it("applies the placement effects while leaving its film out of the story when requested", () => {
    const session = cutsceneAdventure().start();
    session.adventure!.cutscenes.find(({ id }) => id === "intro")!.showInStory = false;
    const result = finishCutscene(session, "intro");
    expect(result.adventure?.cutscenesSeen).toEqual(["intro"]);
    expect(result.adventure?.clockMinutes).toBe(INITIAL_GAME_MINUTES + 10);
    expect(result.storyFlags).toContain("woke");
    expect(result.conversation).toEqual(session.conversation);
  });

  it("rejects proposals, speech and ways with the existing busy error before changing anything", async () => {
    const { engine, interact, travel, village, out } = play();
    const before = engine.getSession();
    expect(() => interact(village.encounter!.definition.interactions[0]!.id)).toThrow(
      SessionNotIdleError,
    );
    expect(() => travel(out.id)).toThrow(SessionNotIdleError);
    const speak = () =>
      engine.executeEncounterAction({
        id: "say",
        expectedSceneId: before.adventure!.currentSceneId,
        expectedRevision: before.encounter!.state.revision,
        action: { kind: "say", text: "Hello." },
      });
    expect(speak).toThrow(SessionNotIdleError);
    await expect(planSay(before, "Hello", undefined)).rejects.toThrow(SessionNotIdleError);
    await expect(planDo(before, "Read the note", undefined)).rejects.toThrow(SessionNotIdleError);
    expect(engine.getSession()).toEqual(before);
  });

  it("restores the saved queue and does not rerun the introduction after finishing it and reloading", async () => {
    const { engine, interact, travel, out, village } = play();
    engine.finishCutscene("intro");
    interact(village.encounter!.definition.interactions[0]!.id);
    travel(out.id);
    engine.finishCutscene("road");
    const repo = new IndexedDBRepository(new IDBFactory(), "cutscene-game", 1);
    await repo.saveSession(engine.getSession());
    const restored = new StateEngine(
      await repo.loadSession(engine.getSession().id),
      new EventLog(),
    );
    expect(restored.getSession().adventure!.cutscenesPending).toEqual(["bells", "arrival", "wind"]);
    expect(restored.getSession().adventure!.cutscenesSeen).toEqual(["intro", "road"]);
  });
});
