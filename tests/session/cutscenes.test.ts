import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { dueCutscenes, finishCutscene, queueCutscenes } from "../../src/game/cutscenes";
import { CutsceneSchema } from "../../src/game/CutsceneSchema";
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
  it("defaults old adventures and runs and enforces the authored text limits", () => {
    const { campaign, start } = cutsceneAdventure();
    const { cutscenes: cuts, ...oldCampaign } = campaign;
    expect(CampaignTemplateSchema.parse(oldCampaign).cutscenes).toEqual([]);
    const session = start();
    expect(
      parseSession({
        ...session,
        adventure: {
          ...session.adventure,
          cutscenes: undefined,
          cutscenesSeen: undefined,
          cutscenesPending: undefined,
        },
      }).adventure,
    ).toMatchObject({ cutscenes: [], cutscenesSeen: [], cutscenesPending: [] });
    expect(CutsceneSchema.safeParse({ ...cuts[0], title: " " }).success).toBe(false);
    expect(CutsceneSchema.safeParse({ ...cuts[0], paragraphs: ["a".repeat(1201)] }).success).toBe(
      false,
    );
    expect(CutsceneSchema.safeParse({ ...cuts[0], paragraphs: Array(21).fill("a") }).success).toBe(
      false,
    );
  });

  it("copies the campaign, queues the introduction at start and only triggers on new facts", () => {
    const { campaign, start, lead } = cutsceneAdventure();
    const session = start();
    expect(session.adventure!.cutscenesPending).toEqual(["intro"]);
    campaign.cutscenes[0]!.paragraphs[0] = "Changed in the editor";
    expect(session.adventure!.cutscenes[0]!.paragraphs).toEqual([
      "The tower rises above the field.",
    ]);
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
