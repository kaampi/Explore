import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { actorIdFor, setAttitude } from "../../src/library/sceneParts";
import {
  greetingTarget,
  present,
  speechAddressee,
  spokenInteraction,
} from "../../src/game/dialogue";
import { resolveEncounterAction } from "../../src/game/EncounterEngine";
import { planSay, type Provider } from "../../src/session/encounterAI";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import type { EncounterGame } from "../../src/game/EncounterSchema";

function hostileEdda() {
  const built = connectedAdventureExample();
  const edda = built.characters[0]!;
  const scene = setAttitude(structuredClone(built.campaign.scenes[0]!), edda.id, "hostile");
  const game: EncounterGame = scene.encounter!;
  return { built, game, id: actorIdFor(edda.id), edda };
}

const ASK = "What do you know about the messenger?";

describe("talking to someone hostile before a fight", () => {
  it("is possible: their prepared answers, greetings and name are found", () => {
    const { game } = hostileEdda();
    const { definition: d, state: s } = game;

    expect(spokenInteraction(d, s, ASK)?.label).toBe("Ask Edda about the messenger");
    expect(greetingTarget(d, s, "Hello Edda")?.name).toBe("Edda");
    expect(speechAddressee(d, s, "Edda, a word")?.name).toBe("Edda");
  });

  it("runs their prepared conversation without starting a fight", () => {
    const { game } = hostileEdda();

    const next = resolveEncounterAction(game, {
      id: "ask",
      expectedRevision: game.state.revision,
      expectedSceneId: game.definition.id,
      action: { kind: "say", text: ASK },
    });

    expect(next.state.phase).toBe("exploration");
    expect(next.history.at(-1)!.events.map((event) => event.kind)).toEqual(["interaction"]);
  });

  it("is not possible with someone who is fighting", () => {
    const { game, id } = hostileEdda();
    game.state.phase = "combat";

    expect(present(game.definition, game.state, game.state.actors[id]!)).toBe(false);
    expect(spokenInteraction(game.definition, game.state, ASK)).toBeUndefined();
    expect(speechAddressee(game.definition, game.state, "Edda, a word")).toBeUndefined();
    expect(greetingTarget(game.definition, game.state, "Hello Edda")).toBeUndefined();
  });

  it("is possible again with a hostile person who has surrendered", () => {
    const { game, id } = hostileEdda();
    game.state.phase = "combat";
    game.state.actors[id]!.disposition = "surrendered";

    expect(present(game.definition, game.state, game.state.actors[id]!)).toBe(true);
  });

  it("is not possible with someone who has fled or is down", () => {
    const { game, id } = hostileEdda();
    game.state.actors[id]!.disposition = "fled";
    expect(present(game.definition, game.state, game.state.actors[id]!)).toBe(false);
    game.state.actors[id]!.disposition = "active";
    game.state.actors[id]!.hp = 0;
    expect(present(game.definition, game.state, game.state.actors[id]!)).toBe(false);
  });

  it("is unchanged for someone neutral", () => {
    const built = connectedAdventureExample();
    const { definition: d, state: s } = built.campaign.scenes[0]!.encounter!;

    expect(spokenInteraction(d, s, ASK)?.label).toBe("Ask Edda about the messenger");
    s.phase = "combat";
    expect(spokenInteraction(d, s, ASK)?.label).toBe("Ask Edda about the messenger");
  });
});

describe("free replies from someone hostile", () => {
  function providerAnswering(text: string) {
    const calls: number[] = [];
    const provider: Provider = {
      async *streamCompletion(request) {
        calls.push(request.temperature ?? -1);
        yield { type: "text_delta", text };
        yield { type: "done", finishReason: "stop" };
      },
    };
    return { provider, calls };
  }

  function session() {
    const { built, game } = hostileEdda();
    const scene = { ...built.campaign.scenes[0]!, encounter: game };
    const campaign = { ...built.campaign, scenes: [scene, ...built.campaign.scenes.slice(1)] };
    return startPlayableCampaign(campaign, scene, built.places, "hostile-talk", [built.realm], {
      characters: built.characters,
    });
  }

  it("is offered before a fight", async () => {
    const { provider } = providerAnswering('{"action":null}');

    const plan = await planSay(session(), "Lovely weather today.", provider);

    expect(plan.kind).toBe("free");
  });

  it("makes no model call once the fight has started", async () => {
    const live = session();
    live.encounter!.state.phase = "combat";
    const { provider, calls } = providerAnswering('{"action":null}');

    const plan = await planSay(live, "Lovely weather today.", provider);

    expect(plan.kind).toBe("plain");
    expect(calls).toEqual([]);
  });
});
