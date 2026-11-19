import { describe, expect, it } from "vitest";
import { connectedAdventureExample, newOpportunity } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { AttributeDefSchema, type Session } from "../../src/state/StateSchema";
import { hasCombat, METERS_SHOWN, playerValues } from "../../src/ui/play/playerValues";
import { loadingBayScenario } from "../../src/ui/home/encounterScenario";

function start(): Session {
  const built = connectedAdventureExample();
  return startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "values",
    [built.realm],
    { characters: built.characters },
  );
}

type Attr = { id: string; name: string; maxShift?: number; display?: "meter" | "skill" | "hidden" };
/** A game whose rule-set has these values, all of them held by the player at 40 on a scale of 0–100. */
function withValues(attributes: Attr[]): Session {
  const session = start();
  session.encounter!.definition.rules.attributes = attributes.map((a) => ({
    id: a.id,
    name: a.name,
    min: 0,
    max: 100,
  }));
  const player = session.encounter!.state.actors[session.encounter!.definition.playerId]!;
  player.stats = Object.fromEntries(attributes.map((a) => [a.id, 40]));
  session.ruleset = {
    name: "Test",
    attributes: attributes.map((a) =>
      AttributeDefSchema.parse({ kind: "number", min: 0, max: 100, ...a }),
    ),
  };
  return session;
}
const names = (list: { name: string }[]) => list.map((v) => v.name);

describe("playerValues", () => {
  it("draws a value that can move as a meter and one that stays put as a skill", () => {
    const { meters, fold } = playerValues(
      withValues([
        { id: "trust", name: "Förtroende", maxShift: 10 },
        { id: "melee", name: "Melee" },
        { id: "sanity", name: "Sanity", maxShift: 5 },
      ]),
    );
    expect(names(meters)).toEqual(["Förtroende", "Sanity"]);
    expect(names(fold)).toEqual(["Melee"]);
    expect(meters[0]).toMatchObject({ value: 40, min: 0, max: 100 });
  });

  it("lets display come before the rule: a meter that stays put, a skill that moves, one left out", () => {
    const { meters, fold } = playerValues(
      withValues([
        { id: "a", name: "Still but a meter", display: "meter" },
        { id: "b", name: "Moving but a skill", maxShift: 20, display: "skill" },
        { id: "c", name: "Moving but hidden", maxShift: 20, display: "hidden" },
        { id: "d", name: "Plain skill" },
      ]),
    );
    expect(names(meters)).toEqual(["Still but a meter"]);
    expect(names(fold)).toEqual(["Moving but a skill", "Plain skill"]);
  });

  it("draws at most three meters, in the rule-set's order, and folds the rest with the skills", () => {
    const { meters, fold } = playerValues(
      withValues([
        { id: "a", name: "A", maxShift: 1 },
        { id: "s", name: "Skill" },
        { id: "b", name: "B", maxShift: 1 },
        { id: "c", name: "C", maxShift: 1 },
        { id: "d", name: "D", maxShift: 1 },
      ]),
    );
    expect(METERS_SHOWN).toBe(3);
    expect(names(meters)).toEqual(["A", "B", "C"]);
    // Folded in the rule-set's order too: the skill came before the fourth meter.
    expect(names(fold)).toEqual(["Skill", "D"]);
  });

  it("shows every value as a skill, as before, when the rule-set says nothing about moving", () => {
    const { meters, fold } = playerValues(
      withValues([
        { id: "str", name: "Styrka" },
        { id: "dex", name: "Smidighet" },
      ]),
    );
    expect(meters).toEqual([]);
    expect(names(fold)).toEqual(["Styrka", "Smidighet"]);
  });

  it("leaves out a value the player has no number for", () => {
    const session = withValues([{ id: "a", name: "A" }]);
    delete session.encounter!.state.actors[session.encounter!.definition.playerId]!.stats.a;
    expect(playerValues(session)).toEqual({ meters: [], fold: [] });
  });

  it("is empty outside an engine scene", () => {
    const session = start();
    delete session.encounter;
    expect(playerValues(session)).toEqual({ meters: [], fold: [] });
  });
});

describe("hasCombat", () => {
  it("is false in a scene with no enemy, no weapon, no fight to start and a player who is well", () => {
    expect(hasCombat(start().encounter!)).toBe(false);
  });

  it("is true with an enemy, with a weapon, with a way to start a fight, or with a hurt player", () => {
    const depot = loadingBayScenario("combat-yes", "mock").encounter!;
    expect(hasCombat(depot)).toBe(true);

    const weapon = start();
    weapon.encounter!.definition.weapons.push({
      id: "knife",
      name: "Knife",
      skill: "Melee",
      kind: "melee",
      damage: 3,
      usesAmmunition: false,
    });
    expect(hasCombat(weapon.encounter!)).toBe(true);

    const fight = start();
    const brawl = newOpportunity("Start a brawl", "Fists fly.");
    brawl.success.effects.push({ kind: "start-combat" });
    fight.encounter!.definition.interactions.push(brawl);
    expect(hasCombat(fight.encounter!)).toBe(true);

    const hurt = start();
    const you = hurt.encounter!.state.actors[hurt.encounter!.definition.playerId]!;
    you.hp = you.maxHp - 1;
    expect(hasCombat(hurt.encounter!)).toBe(true);
  });

  it("is true when someone in the scene is hostile to the player", () => {
    const session = start();
    const game = session.encounter!;
    const player = game.state.actors[game.definition.playerId]!;
    const edda = Object.values(game.state.actors).find((a) => a.id !== player.id)!;
    edda.team = "enemies";
    game.definition.hostilities.push([player.team, "enemies"]);
    expect(hasCombat(game)).toBe(true);
  });
});
