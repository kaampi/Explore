import { describe, expect, it } from "vitest";
import {
  connectedAdventureExample,
  adventureFacts,
  newOpportunity,
} from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { adventureOptions } from "../../src/game/AdventureEngine";
import { addPerson, actorIdFor } from "../../src/library/sceneParts";
import { hideUntilOutcome, setHidden, setOnReveal, setStance } from "../../src/library/sceneCast";

/** The same person in two scenes, set up differently in each, then the player walks from one to the other. */
function walk(
  first: (
    scene: ReturnType<typeof connectedAdventureExample>["campaign"]["scenes"][number],
    id: string,
  ) => typeof scene,
  second: typeof first,
) {
  const built = connectedAdventureExample();
  const edda = built.characters[0]!;
  const eddaId = actorIdFor(edda.id);
  const [one, two] = built.campaign.scenes as [
    (typeof built.campaign.scenes)[number],
    (typeof built.campaign.scenes)[number],
  ];
  built.campaign.scenes[0] = first(one, edda.id);
  built.campaign.scenes[1] = second(addPerson(structuredClone(two), edda), edda.id);
  const seed = startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "hidden-walk",
  );
  // Let the route open without setting the fact that hides her.
  for (const fact of adventureFacts(built.campaign)) seed.encounter!.state.flags.push(fact.id);
  const engine = new StateEngine(seed, new EventLog());
  const inFirst = structuredClone(engine.getSession().encounter!.state.actors[eddaId]!);
  const s = engine.getSession();
  engine.transitionAdventure({
    id: "walk",
    linkId: adventureOptions(s)[0]!.id,
    expectedStateVersion: s.stateVersion,
  });
  return { inFirst, inSecond: engine.getSession().encounter!.state.actors[eddaId]! };
}

describe("a person who is in two scenes", () => {
  it("is visible in the second scene when the author chose Visible there, and no longer attacks", () => {
    const { inFirst, inSecond } = walk(
      (scene, id) =>
        setOnReveal(setHidden(setStance(scene, id, "hostile"), id, "never-set"), id, "attack"),
      (scene) => scene,
    );
    expect(inFirst.requiresFlags).toEqual(["never-set"]);
    expect(inFirst.onReveal).toBe("attack");
    expect(inSecond.requiresFlags).toBeUndefined();
    expect(inSecond.onReveal).toBeUndefined();
  });

  it("follows the second scene's Waits when the first scene said Attacks", () => {
    const { inSecond } = walk(
      (scene, id) =>
        setOnReveal(setHidden(setStance(scene, id, "hostile"), id, "never-set"), id, "attack"),
      (scene, id) =>
        setOnReveal(setHidden(setStance(scene, id, "hostile"), id, "other-fact"), id, "wait"),
    );
    expect(inSecond.requiresFlags).toEqual(["other-fact"]);
    expect(inSecond.onReveal).toBeUndefined();
  });

  it("follows the second scene's Attacks when the first scene said Waits", () => {
    const { inSecond } = walk(
      (scene, id) => setHidden(setStance(scene, id, "hostile"), id, "never-set"),
      (scene, id) =>
        setOnReveal(setHidden(setStance(scene, id, "hostile"), id, "other-fact"), id, "attack"),
    );
    expect(inSecond.onReveal).toBe("attack");
  });
});

describe("the side a person stands on follows the entered scene", () => {
  const fight = (
    first: Parameters<typeof walk>[0],
    second: Parameters<typeof walk>[1],
    reveal: boolean,
  ) => {
    // Walk with the hiding fact unset, then discover her in the second scene.
    const built = connectedAdventureExample();
    const edda = built.characters[0]!;
    const eddaId = actorIdFor(edda.id);
    const scenes = built.campaign.scenes;
    scenes[0] = first(scenes[0]!, edda.id);
    scenes[1] = second(addPerson(structuredClone(scenes[1]!), edda), edda.id);
    const look = newOpportunity("Look up", "Something above.");
    scenes[1]!.encounter!.definition.interactions.push(look);
    if (reveal)
      scenes[1] = setOnReveal(hideUntilOutcome(scenes[1]!, edda.id, look.id), edda.id, "attack");
    const seed = startPlayableCampaign(built.campaign, scenes[0]!, built.places, "side-walk");
    for (const fact of adventureFacts(built.campaign))
      if (!look.success.effects.some((e) => e.kind === "flag" && e.flag === fact.id))
        seed.encounter!.state.flags.push(fact.id);
    const engine = new StateEngine(seed, new EventLog());
    const s = engine.getSession();
    engine.transitionAdventure({
      id: "walk",
      linkId: adventureOptions(s)[0]!.id,
      expectedStateVersion: s.stateVersion,
    });
    const now = engine.getSession();
    engine.executeEncounterAction(
      {
        id: "look",
        expectedRevision: now.encounter!.state.revision,
        expectedSceneId: now.encounter!.definition.id,
        action: { kind: "interaction", interactionId: look.id },
      },
      () => 0,
    );
    return { eddaId, game: engine.getSession().encounter! };
  };

  it("friendly in scene one, a lone hostile opponent hidden in scene two: finding her starts the fight", () => {
    const { eddaId, game } = fight(
      (scene, id) => setStance(scene, id, "friendly"),
      (scene, id) => setStance(scene, id, "hostile"),
      true,
    );
    expect(game.state.actors[eddaId]!.team).toBe("opponents");
    expect(game.history.at(-1)!.events.map((e) => e.kind)).toContain("revealed");
    expect(game.state.phase).toBe("combat");
  });

  it("hostile in scene one, friendly in scene two: she is no opponent there", () => {
    const { eddaId, game } = fight(
      (scene, id) => setStance(scene, id, "hostile"),
      (scene, id) => setStance(scene, id, "friendly"),
      false,
    );
    expect(game.state.actors[eddaId]!.team).not.toBe("opponents");
    expect(game.state.actors[eddaId]!.tactics).toBeUndefined();
    expect(game.state.phase).toBe("exploration");
  });
});
