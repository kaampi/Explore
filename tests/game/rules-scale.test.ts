import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { chanceFromValue, encounterRules, percentileRules } from "../../src/game/rules";
import { checkTarget } from "../../src/checks/CheckEngine";
import { attackTarget, validateEncounter } from "../../src/game/EncounterEngine";
import { loadingBayGame } from "../../src/scenarios/loadingBay";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import type { EncounterGame } from "../../src/game/EncounterSchema";

describe("chanceFromValue", () => {
  it("gives 50 in the middle and 0 and 100 at the ends", () => {
    expect(chanceFromValue(9.5, 1, 18)).toBe(50);
    expect(chanceFromValue(1, 1, 18)).toBe(0);
    expect(chanceFromValue(18, 1, 18)).toBe(100);
    expect(chanceFromValue(14, 1, 18)).toBe(76);
  });

  it("counts a value outside the scale as its nearest end", () => {
    expect(chanceFromValue(-5, 1, 18)).toBe(0);
    expect(chanceFromValue(40, 1, 18)).toBe(100);
  });

  it("gives 50 for a scale that is not a range or a value that is not a number", () => {
    expect(chanceFromValue(5, 10, 10)).toBe(50);
    expect(chanceFromValue(5, 10, 3)).toBe(50);
    expect(chanceFromValue(Number.NaN, 1, 18)).toBe(50);
    expect(chanceFromValue(5, Number.NaN, 18)).toBe(50);
  });
});

describe("the chat's checks and the engine", () => {
  it("give the same chance for the same value and scale at normal difficulty", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: 1, max: 60 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (min, span, position) => {
          const max = min + span;
          const value = Math.round((min + span * position) * 100) / 100;
          const game = loadingBayGame();
          const actor = { ...game.state.actors.courier!, stats: { strength: value } };
          const d = {
            ...game.definition,
            rules: {
              ...game.definition.rules,
              attributes: [{ id: "strength", name: "Strength", min, max }],
            },
          };

          const engine = encounterRules(d).skillTarget(actor, "strength", 0, d);
          const chat = checkTarget(value, min, max, "normal");

          expect(engine).toBe(chat);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("a scene with no scales", () => {
  it("reads a skill as a value out of 100, as it always has", () => {
    const game = loadingBayGame();
    const courier = game.state.actors.courier!;

    expect(percentileRules.skillTarget(courier, "Negotiation", 0, game.definition)).toBe(60);
    expect(percentileRules.skillTarget(courier, "Negotiation", 20, game.definition)).toBe(80);
    expect(percentileRules.skillTarget(courier, "Unknown", 0, game.definition)).toBe(0);
  });
});

describe("a value on a scale", () => {
  function withScale(game: EncounterGame, skill: string, value: number): EncounterGame {
    const copy = structuredClone(game);
    copy.definition.rules.attributes = [{ id: skill, name: skill, min: 1, max: 18 }];
    copy.state.actors.courier!.stats[skill] = value;
    return copy;
  }

  it("gives 76 for 14 out of 1–18 in an action", () => {
    const game = withScale(loadingBayGame(), "Negotiation", 14);

    expect(
      percentileRules.skillTarget(game.state.actors.courier!, "Negotiation", 0, game.definition),
    ).toBe(76);
    expect(
      percentileRules.skillTarget(game.state.actors.courier!, "Negotiation", -20, game.definition),
    ).toBe(56);
  });

  it("gives the same attack chance as the same value out of 100, before cover and defence", () => {
    const plain = loadingBayGame();
    plain.state.actors.courier!.stats["Close combat"] = 76;
    const scaled = withScale(loadingBayGame(), "Close combat", 14);
    const target = Object.values(plain.state.actors).find(
      (actor) => actor.id !== "courier" && actor.position === plain.state.actors.courier!.position,
    );
    const targetId = target?.id ?? Object.keys(plain.state.actors).find((id) => id !== "courier")!;

    const a = attackTarget(plain.definition, plain.state, "courier", targetId, "shock-baton");
    const b = attackTarget(scaled.definition, scaled.state, "courier", targetId, "shock-baton");

    expect(b).toBe(a);
  });

  it("uses the middle of the scale for a value the person lacks", () => {
    const game = withScale(loadingBayGame(), "Negotiation", 14);
    delete game.state.actors.courier!.stats.Negotiation;

    expect(
      percentileRules.skillTarget(game.state.actors.courier!, "Negotiation", 0, game.definition),
    ).toBe(50);
  });
});

describe("scales in a scene", () => {
  it("must have different ids and a top above the bottom", () => {
    const game = loadingBayGame();
    const twice = structuredClone(game);
    twice.definition.rules.attributes = [
      { id: "a", name: "A", min: 0, max: 10 },
      { id: "a", name: "Again", min: 0, max: 10 },
    ];
    const flat = structuredClone(game);
    flat.definition.rules.attributes = [{ id: "a", name: "A", min: 5, max: 5 }];

    expect(() => validateEncounter(twice)).toThrow(/unique/);
    expect(() => validateEncounter(flat)).toThrow(/highest value is above the lowest/);
  });

  it("must be the same in every scene of an adventure", () => {
    const built = connectedAdventureExample();
    const campaign = structuredClone(built.campaign);
    campaign.scenes[1]!.encounter!.definition.rules.attributes = [
      { id: "x", name: "X", min: 1, max: 18 },
    ];

    expect(() =>
      startPlayableCampaign(campaign, campaign.scenes[0]!, built.places, "scales", [built.realm]),
    ).toThrow(/same attributes/);
  });

  it("start with no scale and no player health, so older scenes are unchanged", () => {
    const game = loadingBayGame();

    expect(game.definition.rules.attributes).toEqual([]);
    expect(game.definition.rules.playerHealth).toBeUndefined();
  });
});
