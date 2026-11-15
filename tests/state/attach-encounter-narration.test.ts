import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { loadingBayScenario } from "../../src/ui/home/encounterScenario";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { StateEngine } from "../../src/state/StateEngine";
import { parseSession } from "../../src/state/StateSchema";
import { EventLog } from "../../src/events/EventLog";
import type { EncounterAction } from "../../src/game/EncounterSchema";

function messengerEngine() {
  const built = connectedAdventureExample();
  const session = startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "attach-test",
    [built.realm],
    { characters: built.characters },
  );
  return new StateEngine(session, new EventLog());
}

function act(engine: StateEngine, action: EncounterAction) {
  const session = engine.getSession();
  engine.executeEncounterAction({
    id: crypto.randomUUID(),
    expectedRevision: session.encounter!.state.revision,
    expectedSceneId: session.sceneId!,
    action,
  });
  const entry = engine.getSession().encounter!.history.at(-1)!;
  return { entry, sceneId: engine.getSession().encounter!.definition.id };
}

function settledState(engine: StateEngine) {
  const session = engine.getSession();
  return structuredClone({
    stateVersion: session.stateVersion,
    encounter: session.encounter,
    storyFlags: session.storyFlags,
    events: session.events,
    adventure: session.adventure,
  });
}

function narratorTurn(engine: StateEngine, actionId: string) {
  return engine
    .getSession()
    .conversation.find(
      (turn) =>
        (turn as { actionId?: string; toldBy?: string }).actionId === actionId &&
        (turn as { toldBy?: string }).toldBy === "narrator",
    ) as Record<string, unknown>;
}

describe("attachEncounterNarration", () => {
  it("replaces the words on one turn and touches nothing the engine settled", () => {
    const engine = messengerEngine();
    const edda = Object.keys(engine.getSession().encounter!.state.actors).find((id) =>
      id.startsWith("npc:"),
    )!;
    const { entry, sceneId } = act(engine, { kind: "say", text: "Lovely weather today." });
    const before = settledState(engine);

    const attached = engine.attachEncounterNarration({
      actionId: entry.id,
      sceneId,
      text: "Edda shrugs. “It will rain by dusk.”",
      kind: "free-reply",
      speakerId: edda,
      model: "mock",
    });

    expect(attached).toBe(true);
    expect(settledState(engine)).toEqual(before);
    const turn = narratorTurn(engine, entry.id);
    expect(turn.content).toBe("Edda shrugs. “It will rain by dusk.”");
    expect(turn.engineText).toBe(entry.text);
    expect(turn.speakerId).toBe(edda);
    expect(turn.speakerName).toBe("Edda");
    expect(turn.ai).toMatchObject({ kind: "free-reply", model: "mock" });
  });

  it("does nothing a second time for the same turn", () => {
    const engine = messengerEngine();
    const edda = Object.keys(engine.getSession().encounter!.state.actors).find((id) =>
      id.startsWith("npc:"),
    )!;
    const { entry, sceneId } = act(engine, { kind: "say", text: "Lovely weather today." });
    const input = {
      actionId: entry.id,
      sceneId,
      kind: "free-reply" as const,
      speakerId: edda,
      model: "mock",
    };
    engine.attachEncounterNarration({ ...input, text: "First." });

    const again = engine.attachEncounterNarration({ ...input, text: "Second." });

    expect(again).toBe(false);
    expect(narratorTurn(engine, entry.id).content).toBe("First.");
  });

  it("does nothing when the turn is gone", () => {
    const engine = messengerEngine();

    expect(
      engine.attachEncounterNarration({
        actionId: "missing",
        sceneId: "missing",
        text: "Hello.",
        kind: "free-reply",
        speakerId: "x",
        model: "mock",
      }),
    ).toBe(false);
  });

  it("refuses a free reply on a conversation the author prepared", () => {
    const engine = messengerEngine();
    const session = engine.getSession();
    const ask = session.encounter!.definition.interactions[0]!;
    const { entry, sceneId } = act(engine, { kind: "interaction", interactionId: ask.id });

    expect(() =>
      engine.attachEncounterNarration({
        actionId: entry.id,
        sceneId,
        text: "Edda says the gate is open.",
        kind: "free-reply",
        speakerId: ask.counterpartyId!,
        model: "mock",
      }),
    ).toThrow(/no prepared answer/i);
    expect(narratorTurn(engine, entry.id).ai).toBeUndefined();
  });

  it("refuses a speaker who is not in the scene", () => {
    const engine = messengerEngine();
    const { entry, sceneId } = act(engine, { kind: "say", text: "Lovely weather today." });

    expect(() =>
      engine.attachEncounterNarration({
        actionId: entry.id,
        sceneId,
        text: "A stranger speaks.",
        kind: "free-reply",
        speakerId: "npc:nobody",
        model: "mock",
      }),
    ).toThrow(/not part of this scene/i);
  });

  it("refuses to re-word what looking around shows", () => {
    const engine = messengerEngine();
    const { entry, sceneId } = act(engine, { kind: "look" });

    expect(() =>
      engine.attachEncounterNarration({
        actionId: entry.id,
        sceneId,
        text: "Everything is on fire.",
        kind: "narrated-outcome",
        model: "mock",
      }),
    ).toThrow(/engine's own words/i);
  });

  it("lets plain movement be re-worded, keeping the engine text as the record", () => {
    const engine = new StateEngine(loadingBayScenario("attach-bay", "mock"), new EventLog());
    const encounter = engine.getSession().encounter!;
    const here = encounter.state.actors[encounter.definition.playerId]!.position;
    const target = encounter.definition.places.find((p) => p.id !== here)!;
    const { entry, sceneId } = act(engine, { kind: "move", to: target.id });
    const before = settledState(engine);

    const attached = engine.attachEncounterNarration({
      actionId: entry.id,
      sceneId,
      text: "You cross the room.",
      kind: "narrated-outcome",
      model: "mock",
    });

    expect(attached).toBe(true);
    expect(settledState(engine)).toEqual(before);
    expect(narratorTurn(engine, entry.id).engineText).toBe(entry.text);
  });

  it("survives a reload with the same conversation", () => {
    const engine = messengerEngine();
    const edda = Object.keys(engine.getSession().encounter!.state.actors).find((id) =>
      id.startsWith("npc:"),
    )!;
    const { entry, sceneId } = act(engine, { kind: "say", text: "Lovely weather today." });
    engine.attachEncounterNarration({
      actionId: entry.id,
      sceneId,
      text: "Edda shrugs.",
      kind: "free-reply",
      speakerId: edda,
      model: "mock",
    });

    const reloaded = parseSession(JSON.parse(JSON.stringify(engine.getSession())));

    expect(reloaded.conversation).toEqual(engine.getSession().conversation);
  });
});
