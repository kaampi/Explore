import { describe, expect, it } from "vitest";
import { connectedAdventureExample, newOpportunity } from "../../src/library/playableCampaign";
import { newCharacterTemplate, newObjectTemplate } from "../../src/library/LibrarySchema";
import { EffectSchema } from "../../src/game/EncounterSchema";
import {
  actorIdFor,
  addPerson,
  fightBreaksOut,
  placeItem,
  setAttitude,
  setFightBreaksOut,
  setToughness,
} from "../../src/library/sceneParts";
import { syncScene } from "../../src/library/sceneSync";
import { resolveEncounterAction, validateEncounter } from "../../src/game/EncounterEngine";
import { storyboardIssues } from "../../src/ui/studio/storyboardReadiness";
import { adventureFacts } from "../../src/library/playableCampaign";
import type { EncounterGame } from "../../src/game/EncounterSchema";

function setup() {
  const built = connectedAdventureExample();
  const orla = newCharacterTemplate({ name: "Orla" });
  const sword = newObjectTemplate({
    name: "Short sword",
    note: "",
    source: "player",
    tags: [],
    weapon: { skill: "Melee", kind: "melee", damage: 4, usesAmmunition: false },
  });
  const club = newObjectTemplate({
    name: "Club",
    note: "",
    source: "player",
    tags: [],
    weapon: { skill: "Melee", kind: "melee", damage: 2, usesAmmunition: false },
  });
  const id = actorIdFor(orla.id);
  const library = {
    characters: [...built.characters, orla],
    objects: [...built.objects, sword, club],
    places: built.places,
  };
  let scene = addPerson(structuredClone(built.campaign.scenes[0]!), orla);
  scene = placeItem(placeItem(scene, sword, { heldBy: "player" }), club, { heldBy: id });
  scene = setToughness(setAttitude(scene, orla.id, "hostile"), orla.id, "weak");
  return { built, orla, sword, club, id, library, scene };
}

/** A scene with a fight-starting action that anyone can use right away. */
function withStarter(options: { check?: boolean; aboutOrla?: boolean } = {}) {
  const base = setup();
  const action = newOpportunity("Insult Orla", "Orla draws her club.");
  if (options.aboutOrla !== false) action.counterpartyId = base.id;
  action.once = true;
  if (options.check) action.check = { stat: "Persuasion", modifier: 0 };
  const scene = structuredClone(base.scene);
  scene.encounter!.definition.interactions.push(action);
  return { ...base, scene, action };
}

const resolve = (game: EncounterGame, id: string, action: never, rng: () => number = () => 0.5) =>
  resolveEncounterAction(
    game,
    {
      id,
      expectedRevision: game.state.revision,
      expectedSceneId: game.definition.id,
      action,
    },
    rng,
  );

describe("the start-combat effect", () => {
  it("is a valid effect and takes nothing else", () => {
    expect(EffectSchema.safeParse({ kind: "start-combat" }).success).toBe(true);
    expect(EffectSchema.safeParse({ kind: "start-combat", extra: 1 }).success).toBe(false);
  });

  it("is refused in a scene where no one is hostile", () => {
    const { scene, orla } = withStarter();
    const peaceful = setAttitude(scene, orla.id, "neutral");
    peaceful
      .encounter!.definition.interactions.at(-1)!
      .success.effects.push({ kind: "start-combat" });

    expect(() => validateEncounter(peaceful.encounter!)).toThrow(/someone is hostile/);
  });
});

describe("when the action ends", () => {
  it("starts the fight after the action's own result, with the author's text kept", () => {
    const { scene, action, id } = withStarter();
    const armed = setFightBreaksOut(scene, action.id, "success", true);
    const game = armed.encounter!;

    const next = resolve(game, "insult", {
      kind: "interaction",
      interactionId: action.id,
    } as never);

    expect(next.state.phase).toBe("combat");
    const entry = next.history.at(-1)!;
    expect(entry.events.map((event) => event.kind).slice(0, 2)).toEqual([
      "interaction",
      "initiative",
    ]);
    expect(entry.text).toContain("Orla draws her club.");
    expect(next.state.attempts).toContain(action.id);
    expect(next.state.initiative!.order).toEqual(expect.arrayContaining(["player", id]));
  });

  it("rolls dice only for who goes first, not when testing the action", () => {
    const { scene, action } = withStarter();
    const game = setFightBreaksOut(scene, action.id, "success", true).encounter!;
    let calls = 0;

    resolve(game, "insult", { kind: "interaction", interactionId: action.id } as never, () => {
      calls++;
      return 0.5;
    });

    expect(calls).toBe(2);
  });

  it("does nothing when no hostile person is left to fight", () => {
    const { scene, action, id } = withStarter({ aboutOrla: false });
    const game = setFightBreaksOut(scene, action.id, "success", true).encounter!;
    game.state.actors[id]!.hp = 0;

    const next = resolve(game, "insult", {
      kind: "interaction",
      interactionId: action.id,
    } as never);

    expect(next.state.phase).toBe("exploration");
    expect(next.history.at(-1)!.events.map((event) => event.kind)).toEqual(["interaction"]);
  });

  it("does not start again when a fight is already going", () => {
    const { scene, action, id } = withStarter({ aboutOrla: false });
    const game = setFightBreaksOut(scene, action.id, "success", true).encounter!;
    game.state.phase = "combat";
    game.state.round = 1;
    game.state.initiative = { rolls: { player: 90, [id]: 10 }, order: ["player", id] };
    const before = structuredClone(game.state.initiative);

    const next = resolve(game, "insult", {
      kind: "interaction",
      interactionId: action.id,
    } as never);

    expect(next.state.initiative).toEqual(before);
    expect(next.history.at(-1)!.events.some((event) => event.kind === "initiative")).toBe(false);
  });

  it("starts a fight on a failed roll when that is what the failure does", () => {
    const { scene, action } = withStarter({ check: true });
    const game = setFightBreaksOut(scene, action.id, "failure", true).encounter!;

    const failed = resolve(
      game,
      "f",
      { kind: "interaction", interactionId: action.id } as never,
      () => 0.99,
    );
    const worked = resolve(
      game,
      "w",
      { kind: "interaction", interactionId: action.id } as never,
      () => 0.01,
    );

    expect(failed.state.phase).toBe("combat");
    expect(worked.state.phase).toBe("exploration");
  });
});

describe("setting it in the editor", () => {
  it("turns it on and off for success, and says so", () => {
    const { scene, action } = withStarter();

    const on = setFightBreaksOut(scene, action.id, "success", true);
    expect(fightBreaksOut(on, action.id, "success")).toBe(true);
    expect(
      fightBreaksOut(setFightBreaksOut(on, action.id, "success", false), action.id, "success"),
    ).toBe(false);
  });

  it("does not double it", () => {
    const { scene, action } = withStarter();
    const twice = setFightBreaksOut(
      setFightBreaksOut(scene, action.id, "success", true),
      action.id,
      "success",
      true,
    );

    expect(
      twice
        .encounter!.definition.interactions.at(-1)!
        .success.effects.filter((e) => e.kind === "start-combat"),
    ).toHaveLength(1);
  });

  it("refuses failure for an action that does not roll", () => {
    const { scene, action } = withStarter();

    expect(() => setFightBreaksOut(scene, action.id, "failure", true)).toThrow(
      /only an action that rolls/i,
    );
  });

  it("refuses a fight where no one is hostile, and keeps people hostile that a fight needs", () => {
    const { scene, action, orla } = withStarter();
    const neutral = setAttitude(scene, orla.id, "neutral");
    expect(() => setFightBreaksOut(neutral, action.id, "success", true)).toThrow(
      /someone is hostile/,
    );

    const armed = setFightBreaksOut(scene, action.id, "success", true);
    expect(() => setAttitude(armed, orla.id, "neutral")).toThrow(/someone is hostile/);
  });
});

describe("a scene that starts a fight with no one hostile", () => {
  it("blocks testing", () => {
    const { built, scene, action, orla } = withStarter();
    const broken = setAttitude(scene, orla.id, "neutral");
    broken
      .encounter!.definition.interactions.find((item) => item.id === action.id)!
      .success.effects.push({
        kind: "start-combat",
      });
    const campaign = { ...built.campaign, scenes: [broken, ...built.campaign.scenes.slice(1)] };

    const issues = storyboardIssues(
      campaign,
      built.places,
      new Set(adventureFacts(campaign).map((fact) => fact.id)),
    );

    expect(issues.some((issue) => issue.message.includes("starts a fight"))).toBe(true);
  });
});

describe("talking, then fighting", () => {
  it("lets the player talk to someone hostile, the talk starts the fight, and the player can win it", () => {
    const { built, scene, library, id, orla, sword } = withStarter();
    const toll = newOpportunity("Ask Orla about the toll", "“Pay or fight,” Orla growls.");
    toll.counterpartyId = id;
    toll.dialogueTopics = ["toll"];
    scene.encounter!.definition.interactions.push(toll);
    const ready = syncScene(
      built.campaign,
      setFightBreaksOut(scene, toll.id, "success", true),
      library,
    );
    let game = ready.encounter!;

    game = resolve(game, "talk", { kind: "say", text: "What about the toll?" } as never);
    expect(game.state.phase).toBe("combat");
    expect(game.history.at(-1)!.text).toContain("Pay or fight");

    // The player acts when it is their turn; otherwise the opponent has already struck.
    for (let step = 0; step < 6 && game.state.actors[id]!.hp > 0; step++) {
      const turn = game.state.initiative!.order[game.state.cursor];
      if (turn !== "player") break;
      game = resolve(
        game,
        `hit-${step}`,
        { kind: "attack", targetId: id, weaponId: sword.id } as never,
        () => 0.01,
      );
    }

    expect(game.state.actors[id]!.hp).toBe(0);
    expect(orla.id).toBeTruthy();
  });
});
