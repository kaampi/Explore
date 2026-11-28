import { describe, expect, it } from "vitest";
import { connectedAdventureExample, adventureFacts } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { adventureOptions } from "../../src/game/AdventureEngine";
import { addPerson, actorIdFor } from "../../src/library/sceneParts";
import { setHidden, setOnReveal, setStance } from "../../src/library/sceneCast";

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
