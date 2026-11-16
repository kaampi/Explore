import { describe, expect, it } from "vitest";
import { gatehouseExample } from "../../src/scenarios/gatehouse";
import { storyboardIssues } from "../../src/ui/studio/storyboardReadiness";
import { adventureFacts } from "../../src/library/playableCampaign";
import { syncAdventure } from "../../src/library/sceneSync";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import {
  adventureCompleted,
  adventureOptions,
  validateAdventure,
} from "../../src/game/AdventureEngine";
import { actionBlock } from "../../src/game/EncounterEngine";
import type { EncounterAction } from "../../src/game/EncounterSchema";

function fixture() {
  const built = gatehouseExample();
  const seed = startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    crypto.randomUUID(),
    [built.realm],
    { characters: built.characters },
  );
  return { built, engine: new StateEngine(seed, new EventLog()) };
}

const act = (engine: StateEngine, action: EncounterAction, dice = 0) => {
  const s = engine.getSession();
  engine.executeEncounterAction(
    {
      id: crypto.randomUUID(),
      expectedRevision: s.encounter!.state.revision,
      expectedSceneId: s.sceneId!,
      action,
    },
    () => dice,
  );
};
const interaction = (id: string) => ({ kind: "interaction" as const, interactionId: id });
const doorOf = (engine: StateEngine) =>
  Object.values(engine.getSession().encounter!.state.barriers)[0]!;
const openDoor = (engine: StateEngine) =>
  act(engine, { kind: "interact", operation: "open", barrierId: doorOf(engine).id });
function walkThrough(engine: StateEngine, label: string) {
  const s = engine.getSession();
  const link = adventureOptions(s).find((l) => l.label === label);
  expect(link, label).toBeDefined();
  engine.transitionAdventure({
    id: crypto.randomUUID(),
    linkId: link!.id,
    expectedStateVersion: s.stateVersion,
  });
}

describe("the city gate on the common engine", () => {
  it("has no blocking problems, is a valid adventure and is not changed by syncing", () => {
    const { built, engine } = fixture();
    const facts = new Set(adventureFacts(built.campaign).map((f) => f.id));
    const library = {
      characters: built.characters,
      objects: built.objects,
      places: built.places,
      rulesets: [built.rules],
    };

    expect(
      storyboardIssues(built.campaign, built.places, facts, undefined, {
        objects: built.objects,
        rulesets: [built.rules],
      }),
    ).toEqual([]);
    expect(() => validateAdventure(engine.getSession().adventure!)).not.toThrow();
    expect(syncAdventure(built.campaign, library)).toEqual(built.campaign);
    expect(built.campaign.goal?.requiresFlags).toEqual(["gatehouse:inside"]);
  });

  it("lets the player in by persuading Mona", () => {
    const { engine } = fixture();
    act(engine, interaction("persuade-mona"), 0);
    expect(doorOf(engine).locked).toBe(false);
    expect(engine.getSession().encounter!.state.flags).toContain("admitted");

    openDoor(engine);
    walkThrough(engine, "Go through the gate");

    expect(adventureCompleted(engine.getSession())).toBe(true);
  });

  it("closes the talk for good after a refusal", () => {
    const { engine } = fixture();

    act(engine, interaction("persuade-mona"), 0.99);

    expect(doorOf(engine).locked).toBe(true);
    expect(engine.getSession().encounter!.state.flags).toContain("refused");
    expect(() => act(engine, interaction("persuade-mona"), 0)).toThrow();
  });

  it("lets the player pick the lock, because they carry a lockpick", () => {
    const { engine } = fixture();
    act(engine, interaction("pick-lock"), 0);
    expect(doorOf(engine).locked).toBe(false);

    openDoor(engine);
    walkThrough(engine, "Go through the gate");

    expect(adventureCompleted(engine.getSession())).toBe(true);
  });

  it("lets the player break the gate, and a failure starts a fight", () => {
    const won = fixture();
    act(won.engine, interaction("break-gate"), 0);
    expect(doorOf(won.engine)).toMatchObject({ locked: false, open: true });
    walkThrough(won.engine, "Go through the gate");
    expect(adventureCompleted(won.engine.getSession())).toBe(true);

    const lost = fixture();
    act(lost.engine, interaction("break-gate"), 0.99);
    expect(lost.engine.getSession().encounter!.state.phase).toBe("combat");
  });

  it("shows the side gate only after the ivy has been inspected", () => {
    const { engine } = fixture();
    expect(adventureOptions(engine.getSession()).map((l) => l.label)).not.toContain(
      "Slip in by the side gate",
    );

    act(engine, { kind: "move", to: "wall-foot" });
    act(engine, interaction("inspect-ivy"));
    walkThrough(engine, "Slip in by the side gate");

    expect(adventureCompleted(engine.getSession())).toBe(true);
  });

  it("keeps the gate shut for a player who does nothing", () => {
    const { engine } = fixture();

    expect(adventureOptions(engine.getSession()).map((l) => l.label)).toEqual([]);
  });

  it("puts the archer out of reach of the sword but in sight of the road", () => {
    const { engine } = fixture();
    const game = engine.getSession().encounter!;
    const archerId = Object.keys(game.state.actors).find(
      (id) => id.startsWith("npc:") && game.state.actors[id]!.position === "wall",
    )!;
    const swordId = game.state.actors.player!.weapons[0]!;

    expect(
      actionBlock(game.definition, game.state, {
        kind: "attack",
        targetId: archerId,
        weaponId: swordId,
      }),
    ).toBeTruthy();
    const bow = game.definition.weapons.find((w) => w.name === "Bow")!;
    expect(bow.kind).toBe("ranged");
    expect(
      game.definition.sightLines.some(
        (l) => [l.from, l.to].includes("wall") && [l.from, l.to].includes("here"),
      ),
    ).toBe(true);
  });
});
