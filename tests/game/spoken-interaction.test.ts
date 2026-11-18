import { describe, expect, it } from "vitest";
import { connectedAdventureExample, newOpportunity } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { actionBlock, resolveEncounterAction } from "../../src/game/EncounterEngine";
import { speechAddressee } from "../../src/game/dialogue";
import type { EncounterGame } from "../../src/game/EncounterSchema";

function messengerGame(): EncounterGame {
  const built = connectedAdventureExample();
  const session = startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "spoken-test",
    [built.realm],
  );
  return structuredClone(session.encounter!);
}

function request(game: EncounterGame, text: string, interactionId?: string) {
  return {
    id: crypto.randomUUID(),
    expectedRevision: game.state.revision,
    expectedSceneId: game.definition.id,
    action: { kind: "say" as const, text, ...(interactionId ? { interactionId } : {}) },
  };
}

describe("a spoken line matched to an authored conversation", () => {
  it("runs that conversation and keeps the player's words as the label", () => {
    const game = messengerGame();
    const ask = game.definition.interactions[0]!;

    const next = resolveEncounterAction(game, request(game, "Anything strange lately?", ask.id));

    expect(next.state.attempts).toContain(ask.id);
    expect(next.history.at(-1)!.label).toBe("Anything strange lately?");
    expect(next.history.at(-1)!.events.map((e) => e.kind)).toEqual(["interaction"]);
  });

  it("rejects an id that is not in the scene", () => {
    const game = messengerGame();

    expect(actionBlock(game.definition, game.state, request(game, "Hi", "nope").action)).toMatch(
      /unknown conversation/i,
    );
    expect(() => resolveEncounterAction(game, request(game, "Hi", "nope"))).toThrow();
  });

  it("will not run a conversation that needs a roll", () => {
    const game = messengerGame();
    const risky = newOpportunity("Persuade Edda", "She agrees.");
    risky.counterpartyId = game.definition.interactions[0]!.counterpartyId!;
    risky.check = { stat: "Persuasion", modifier: 0 };
    game.definition.interactions.push(risky);

    const block = actionBlock(
      game.definition,
      game.state,
      request(game, "Please?", risky.id).action,
    );

    expect(block).toMatch(/confirmed as its own action/i);
    expect(() => resolveEncounterAction(game, request(game, "Please?", risky.id))).toThrow();
    expect(game.state.attempts).toEqual([]);
  });

  it("will not run a conversation that moves items or resources", () => {
    const game = messengerGame();
    const deal = newOpportunity("Buy the lamp", "Sold.");
    deal.counterpartyId = game.definition.interactions[0]!.counterpartyId!;
    deal.success.effects = [
      {
        kind: "transfer-resource",
        resource: "credits",
        amount: 5,
        from: "player",
        to: deal.counterpartyId,
      },
    ];
    game.definition.interactions.push(deal);

    const block = actionBlock(game.definition, game.state, request(game, "Deal", deal.id).action);

    expect(block).toMatch(/confirmed as its own action/i);
  });

  it("needs the other person to be here", () => {
    const game = messengerGame();
    const ask = game.definition.interactions[0]!;
    game.state.actors[ask.counterpartyId!]!.disposition = "fled";

    const block = actionBlock(game.definition, game.state, request(game, "Hello?", ask.id).action);

    expect(block).toMatch(/not here/i);
  });
});

describe("speechAddressee", () => {
  it("picks the one person who is here", () => {
    const game = messengerGame();

    expect(speechAddressee(game.definition, game.state, "Anything strange?")?.name).toBe("Edda");
  });

  it("picks a named person who is here", () => {
    const game = messengerGame();

    expect(speechAddressee(game.definition, game.state, "Edda, a question")?.name).toBe("Edda");
  });

  it("returns nobody when the named person is not here", () => {
    const game = messengerGame();
    game.state.actors["npc:other"] = {
      ...game.state.actors[game.definition.interactions[0]!.counterpartyId!]!,
      id: "npc:other",
      name: "Orla",
      position: "elsewhere",
    };

    expect(speechAddressee(game.definition, game.state, "Orla, are you there?")).toBeUndefined();
  });

  it("returns nobody when several are here and none is named or spoke last", () => {
    const game = messengerGame();
    const edda = game.state.actors[game.definition.interactions[0]!.counterpartyId!]!;
    game.state.actors["npc:orla"] = { ...edda, id: "npc:orla", name: "Orla" };

    expect(speechAddressee(game.definition, game.state, "Anyone?")).toBeUndefined();
    expect(speechAddressee(game.definition, game.state, "Anyone?", "npc:orla")?.name).toBe("Orla");
  });
});
