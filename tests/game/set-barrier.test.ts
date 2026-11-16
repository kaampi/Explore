import { describe, expect, it } from "vitest";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { adventureOptions } from "../../src/game/AdventureEngine";
import { validateEncounter } from "../../src/game/EncounterEngine";
import { InteractionSchema, type Interaction } from "../../src/game/EncounterSchema";

type Effect = Interaction["success"]["effects"][number];

function inn(effect: (doorId: string) => Effect) {
  const built = innVisitExample();
  const campaign = structuredClone(built.campaign);
  const room = campaign.scenes.find((s) => s.encounter?.state.barriers[built.storeDoorId])!;
  const game = room.encounter!;
  game.definition.interactions.push(
    InteractionSchema.parse({
      id: "force",
      label: "Work the lock",
      description: "",
      position: game.state.barriers[built.storeDoorId]!.position,
      success: { text: "It gives.", effects: [effect(built.storeDoorId)] },
      failure: { text: "It holds.", effects: [] },
    }),
  );
  return { built, campaign, room, game };
}

function play(setup: ReturnType<typeof inn>) {
  const { campaign, built } = setup;
  const start = campaign.scenes.find((s) => s.encounter?.state.barriers[built.storeDoorId])!;
  const seed = startPlayableCampaign(campaign, start, built.places, "set-barrier", [built.realm]);
  return new StateEngine(seed, new EventLog());
}

const run = (engine: StateEngine, interactionId: string) => {
  const s = engine.getSession();
  engine.executeEncounterAction(
    {
      id: crypto.randomUUID(),
      expectedRevision: s.encounter!.state.revision,
      expectedSceneId: s.sceneId!,
      action: { kind: "interaction", interactionId },
    },
    () => {
      throw new Error("No dice needed.");
    },
  );
};

describe("set-barrier", () => {
  it("unlocks a door without a key, and leaves it shut", () => {
    const setup = inn((door) => ({ kind: "set-barrier", barrierId: door, locked: false }));
    const engine = play(setup);
    const door = setup.built.storeDoorId;
    expect(engine.getSession().encounter!.state.barriers[door]!.locked).toBe(true);

    run(engine, "force");

    expect(engine.getSession().encounter!.state.barriers[door]).toMatchObject({
      locked: false,
      open: false,
    });
  });

  it("unlocks and opens in one step, and the next scene sees the shared door", () => {
    const setup = inn((door) => ({
      kind: "set-barrier",
      barrierId: door,
      locked: false,
      open: true,
    }));
    const engine = play(setup);

    run(engine, "force");
    const s = engine.getSession();
    const link = adventureOptions(s).find((l) => l.label === "Go to store room");
    expect(link).toBeDefined();
    engine.transitionAdventure({
      id: crypto.randomUUID(),
      linkId: link!.id,
      expectedStateVersion: s.stateVersion,
    });

    expect(engine.getSession().encounter!.state.barriers[setup.built.storeDoorId]).toMatchObject({
      open: true,
      locked: false,
    });
  });

  it("is refused when the door is not in the scene", () => {
    const setup = inn(() => ({ kind: "set-barrier", barrierId: "nowhere", locked: false }));

    expect(() => validateEncounter(setup.game)).toThrow(/not in this scene/);
  });

  it("is refused when it opens and locks, or opens a locked door without unlocking it", () => {
    const both = inn((door) => ({
      kind: "set-barrier",
      barrierId: door,
      open: true,
      locked: true,
    }));
    expect(() => validateEncounter(both.game)).toThrow(/both open and lock/);

    const lazy = inn((door) => ({ kind: "set-barrier", barrierId: door, open: true }));
    expect(() => validateEncounter(lazy.game)).toThrow(/does not unlock/);
  });

  it("changes nothing for a scene without the effect", () => {
    const built = innVisitExample();

    expect(() => validateEncounter(built.campaign.scenes[1]!.encounter!)).not.toThrow();
  });
});
