import { describe, expect, it } from "vitest";
import { connectedAdventureExample, newOpportunity } from "../../src/library/playableCampaign";
import { newCharacterTemplate, newObjectTemplate } from "../../src/library/LibrarySchema";
import { actorIdFor, addPerson, placeItem, setAttitude } from "../../src/library/sceneParts";
import {
  actionBlock,
  opponents,
  resolveEncounterAction,
  validateEncounter,
} from "../../src/game/EncounterEngine";
import { actorRevealed, visibleActors } from "../../src/game/itemVisibility";
import { describeEvents } from "../../src/game/narration";
import { speechAddressee } from "../../src/game/dialogue";
import { buildFreeReplyMessages } from "../../src/session/encounterPrompt";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { hideUntilOutcome, outcomeSetting, setOnReveal } from "../../src/library/sceneCast";
import { syncScene } from "../../src/library/sceneSync";
import type { CampaignScene } from "../../src/library/LibrarySchema";
import type { EncounterGame } from "../../src/game/EncounterSchema";

function setup(onReveal?: "attack") {
  const built = connectedAdventureExample();
  const spider = newCharacterTemplate({ name: "Jättespindeln" });
  const sword = newObjectTemplate({
    name: "Short sword",
    note: "",
    source: "player",
    tags: [],
    weapon: { skill: "Melee", kind: "melee", damage: 4, usesAmmunition: false },
  });
  const fangs = newObjectTemplate({
    name: "Fangs",
    note: "",
    source: "player",
    tags: [],
    weapon: { skill: "Melee", kind: "melee", damage: 2, usesAmmunition: false },
  });
  const id = actorIdFor(spider.id);
  let scene = addPerson(structuredClone(built.campaign.scenes[0]!), spider);
  scene = placeItem(placeItem(scene, sword, { heldBy: "player" }), fangs, { heldBy: id });
  scene = setAttitude(scene, spider.id, "hostile");
  const search = newOpportunity("Search the beams", "Something moves above you.");
  search.success.effects.push({ kind: "flag", flag: "spider-found" });
  scene.encounter!.definition.interactions.push(search);
  const game = scene.encounter!;
  game.state.actors[id]!.requiresFlags = ["spider-found"];
  if (onReveal) game.state.actors[id]!.onReveal = onReveal;
  return { built, spider, id, game, search };
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

describe("a person who stays hidden until a fact is set", () => {
  it("is valid; a person without requirements is always visible", () => {
    const { game, id } = setup();
    expect(() => validateEncounter(game)).not.toThrow();
    expect(actorRevealed(game.state, game.state.actors[id]!)).toBe(false);
    expect(actorRevealed(game.state, game.state.actors.player!)).toBe(true);
    expect(visibleActors(game.state).map((a) => a.id)).not.toContain(id);
  });

  it("cannot be attacked, is no opponent, and cannot be spoken to", () => {
    const { game, id } = setup();
    const weaponId = game.state.actors.player!.weapons[0]!;
    expect(opponents(game.definition, game.state, game.state.actors.player!)).toEqual([]);
    expect(
      actionBlock(game.definition, game.state, { kind: "attack", targetId: id, weaponId }),
    ).toBeTruthy();
    expect(
      speechAddressee(game.definition, game.state, "Hello Jättespindeln", undefined, id)?.id,
    ).not.toBe(id);
  });

  it("is not in the look-around text and not named to the story AI", () => {
    const { built, game, id } = setup();
    const looked = resolve(game, "look", { kind: "look" } as never);
    expect(looked.history.at(-1)!.text).not.toContain("Jättespindeln");
    const session = startPlayableCampaign(
      built.campaign,
      built.campaign.scenes[0]!,
      built.places,
      "hidden-people",
      [built.realm],
      { characters: built.characters },
    );
    session.encounter = game;
    const text = buildFreeReplyMessages(session, `npc:${built.characters[0]!.id}`, "Hi", [])
      .map((message) => message.content)
      .join("\n");
    expect(text).not.toContain("Jättespindeln");
    expect(id).toBeTruthy();
  });

  it("is revealed once by the success outcome, with a notice, and waits by default", () => {
    const { game, id, search } = setup();
    const next = resolve(game, "search", {
      kind: "interaction",
      interactionId: search.id,
    } as never);
    const entry = next.history.at(-1)!;
    expect(entry.events.map((e) => e.kind)).toEqual(["interaction", "revealed"]);
    expect(entry.text).toContain("Du upptäcker: Jättespindeln.");
    expect(next.state.phase).toBe("exploration");
    expect(visibleActors(next.state).map((a) => a.id)).toContain(id);
    expect(describeEvents(next.definition, next.state, entry.events)).toContain(
      "Du upptäcker: Jättespindeln.",
    );
  });

  it("with onReveal attack starts the fight in the same action", () => {
    const { game, id, search } = setup("attack");
    const next = resolve(game, "search", {
      kind: "interaction",
      interactionId: search.id,
    } as never);
    expect(next.state.phase).toBe("combat");
    expect(next.state.initiative!.order).toContain(id);
    expect(next.history.at(-1)!.events.map((e) => e.kind)).toEqual([
      "interaction",
      "revealed",
      "initiative",
    ]);
  });

  it("is not revealed again, or attacked again, when the fact was already set", () => {
    const { game, search } = setup("attack");
    game.state.flags.push("spider-found");
    const next = resolve(game, "search", {
      kind: "interaction",
      interactionId: search.id,
    } as never);
    expect(next.history.at(-1)!.events.map((e) => e.kind)).toEqual(["interaction"]);
    expect(next.state.phase).toBe("exploration");
  });

  it("stays out of a fight that starts for other reasons", () => {
    const { game, id } = setup();
    const bandit = { ...structuredClone(game.state.actors[id]!), id: "bandit", name: "Bandit" };
    delete bandit.requiresFlags;
    game.state.actors.bandit = bandit;
    const weaponId = game.state.actors.player!.weapons[0]!;
    const next = resolve(game, "hit", { kind: "attack", targetId: "bandit", weaponId } as never);
    expect(next.state.phase).toBe("combat");
    expect(next.state.initiative!.order).toContain("bandit");
    expect(next.state.initiative!.order).not.toContain(id);
  });
});

const play = (game: EncounterGame, interactionId: string, rng: () => number) =>
  resolve(game, `try-${game.state.revision}`, { kind: "interaction", interactionId } as never, rng);

describe("Undersök taket, made fresh and then chosen as what reveals the person", () => {
  function fresh(onReveal: "wait" | "attack") {
    const { built, spider, id } = setup();
    let scene = addPerson(structuredClone(built.campaign.scenes[0]!), spider);
    scene = setAttitude(scene, spider.id, "hostile");
    const look = newOpportunity("Undersök taket", "Du tittar upp.");
    const stat = Object.keys(scene.encounter!.state.actors.player!.stats)[0] ?? "Observation";
    scene.encounter!.state.actors.player!.stats[stat] ??= 50;
    look.check = { stat, modifier: 0 };
    look.once = false;
    scene.encounter!.definition.interactions.push(look);
    scene = hideUntilOutcome(scene, spider.id, look.id, "success");
    scene = setOnReveal(scene, spider.id, onReveal);
    return { game: scene.encounter!, id, look };
  }

  it("a failed attempt keeps the person hidden and silent", () => {
    const { game, id, look } = fresh("attack");
    const failed = play(game, look.id, () => 0.999);
    expect(failed.history.at(-1)!.events.map((e) => e.kind)).toEqual(["interaction"]);
    expect(failed.history.at(-1)!.text).not.toContain("Jättespindeln");
    expect(failed.state.phase).toBe("exploration");
    expect(visibleActors(failed.state).map((a) => a.id)).not.toContain(id);
  });

  it("success reveals with a notice, and then Attacks starts the fight or Waits does not", () => {
    for (const mode of ["attack", "wait"] as const) {
      const { game, id, look } = fresh(mode);
      const found = play(game, look.id, () => 0);
      expect(found.history.at(-1)!.text).toContain("Du upptäcker: Jättespindeln.");
      expect(visibleActors(found.state).map((a) => a.id)).toContain(id);
      expect(found.state.phase).toBe(mode === "attack" ? "combat" : "exploration");
    }
  });
});

describe("changing what reveals the person", () => {
  /** An action with no flags at all, as when the author has just made "Undersök taket". */
  function bare() {
    const { built, spider, id } = setup();
    let scene = addPerson(structuredClone(built.campaign.scenes[0]!), spider);
    scene = setAttitude(scene, spider.id, "hostile");
    const look = newOpportunity("Undersök taket", "Du tittar upp.");
    const stat = Object.keys(scene.encounter!.state.actors.player!.stats)[0] ?? "Observation";
    scene.encounter!.state.actors.player!.stats[stat] ??= 50;
    look.check = { stat, modifier: 0 };
    look.once = false;
    look.success.effects = [];
    look.failure.effects = [];
    scene.encounter!.definition.interactions.push(look);
    const library = {
      characters: [...built.characters, spider],
      objects: built.objects,
      places: built.places,
    };
    return { built, spider, id, scene, look, library };
  }
  type Sides = Record<"success" | "failure", { effects: { kind: string }[] }>;
  const flagsOf = (action: Sides, side: "success" | "failure") =>
    action[side].effects.flatMap((e) =>
      e.kind === "flag" ? [(e as unknown as { flag: string }).flag] : [],
    );
  const find = (scene: CampaignScene, id: string) =>
    scene.encounter!.definition.interactions.find((a) => a.id === id)!;

  it("moves the binding: only the last chosen outcome reveals, after saving and reopening", () => {
    const { built, spider, id, scene, look, library } = bare();
    let next = hideUntilOutcome(scene, spider.id, look.id, "success");
    next = hideUntilOutcome(next, spider.id, look.id, "failure");
    const reopened = syncScene(built.campaign, next, library);
    const fact = reopened.people.find((p) => p.characterId === spider.id)!.hidden!.revealedBy;
    expect(outcomeSetting(reopened, fact)).toEqual({ actionId: look.id, outcome: "failure" });
    expect(flagsOf(find(reopened, look.id), "success")).toEqual([]);
    expect(flagsOf(find(reopened, look.id), "failure")).toEqual([fact]);
    const won = play(reopened.encounter!, look.id, () => 0);
    expect(visibleActors(won.state).map((a) => a.id)).not.toContain(id);
    const lost = play(reopened.encounter!, look.id, () => 0.999);
    expect(visibleActors(lost.state).map((a) => a.id)).toContain(id);
    // And back to success: now only success reveals.
    const back = syncScene(
      built.campaign,
      hideUntilOutcome(reopened, spider.id, look.id, "success"),
      library,
    );
    expect(flagsOf(find(back, look.id), "failure")).toEqual([]);
    const seen = (rng: () => number) =>
      visibleActors(play(back.encounter!, look.id, rng).state).map((a) => a.id);
    expect(seen(() => 0)).toContain(id);
    expect(seen(() => 0.999)).not.toContain(id);
  });

  it("keeps the author's own facts, and reuses one an outcome already sets", () => {
    const { built, spider, scene, look, library } = bare();
    find(scene, look.id).success.effects.push({ kind: "flag", flag: "authors-own" });
    find(scene, look.id).failure.effects.push({ kind: "flag", flag: "authors-failure-flag" });
    let next = hideUntilOutcome(scene, spider.id, look.id, "success");
    expect(next.people.find((p) => p.characterId === spider.id)!.hidden!.revealedBy).toBe(
      "authors-own",
    );
    next = hideUntilOutcome(next, spider.id, look.id, "failure");
    const reopened = syncScene(built.campaign, next, library);
    expect(flagsOf(find(reopened, look.id), "success")).toEqual(["authors-own"]);
    expect(flagsOf(find(reopened, look.id), "failure")).toEqual(["authors-failure-flag"]);
  });

  it("does not let the same person's fact in another scene reveal her here", () => {
    const { built, spider } = setup();
    const one = addPerson(structuredClone(built.campaign.scenes[0]!), spider);
    const two = addPerson(structuredClone(built.campaign.scenes[1]!), spider);
    const a = newOpportunity("Look", "x");
    const b = newOpportunity("Look", "x");
    one.encounter!.definition.interactions.push(a);
    two.encounter!.definition.interactions.push(b);
    const factOne = hideUntilOutcome(one, spider.id, a.id).people.find(
      (p) => p.characterId === spider.id,
    )!.hidden!.revealedBy;
    const factTwo = hideUntilOutcome(two, spider.id, b.id).people.find(
      (p) => p.characterId === spider.id,
    )!.hidden!.revealedBy;
    expect(factOne).not.toBe(factTwo);
  });
});
