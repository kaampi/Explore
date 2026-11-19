import { describe, expect, it } from "vitest";
import { connectedAdventureExample, newOpportunity } from "../../src/library/playableCampaign";
import { newCharacterTemplate } from "../../src/library/LibrarySchema";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { INITIAL_GAME_MINUTES } from "../../src/state/gameClock";
import {
  adventureOptions,
  knownThings,
  peopleMet,
  sceneWays,
} from "../../src/game/AdventureEngine";
import { publicCommands, suggestedCommands } from "../../src/game/catalog";
import { speechAddressee } from "../../src/game/dialogue";
import { PersonaSchema } from "../../src/game/AdventureSchema";
import { InteractionSchema } from "../../src/game/EncounterSchema";
import { planSay, type Provider } from "../../src/session/encounterAI";
import { buildFreeReplyMessages } from "../../src/session/encounterPrompt";
import type { CompletionRequest, StreamChunk } from "../../src/llm/types";

function messenger(options: { portrait?: string } = {}) {
  const built = connectedAdventureExample();
  if (options.portrait) built.characters[0]!.portraitDataUrl = options.portrait;
  const session = startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "play-view-data",
    [built.realm],
    { characters: built.characters },
  );
  const eddaId = `npc:${built.characters[0]!.id}`;
  return { built, session, eddaId };
}

/** Edda's scene with a second person, Hob, who is here too. */
function withHob(session: ReturnType<typeof messenger>["session"], eddaId: string) {
  const game = session.encounter!;
  game.state.actors["npc:hob"] = {
    ...structuredClone(game.state.actors[eddaId]!),
    id: "npc:hob",
    name: "Hob",
  };
  const hobAsks = InteractionSchema.parse({
    ...newOpportunity("Ask Hob about the road", "Hob nods slowly. “It floods in spring.”"),
    counterpartyId: "npc:hob",
  });
  game.definition.interactions.push(hobAsks);
  return hobAsks;
}

const labels = (list: { label: string }[]) => list.map((entry) => entry.label);

describe("suggestedCommands", () => {
  it("gives at most three, starting with what can be done with the person chosen", () => {
    const { session, eddaId } = messenger();
    const game = session.encounter!;
    game.definition.interactions.push(newOpportunity("Study the well", "It is deep."));
    game.definition.interactions.push(newOpportunity("Count the stones", "Forty."));
    game.definition.interactions.push(newOpportunity("Feel the wind", "Cold."));

    const suggested = suggestedCommands(game, eddaId);

    expect(suggested).toHaveLength(3);
    expect(suggested[0]!.label).toBe("Ask Edda about the messenger");
    expect(labels(suggested.slice(1))).toEqual(["Study the well", "Count the stones"]);
    expect(suggestedCommands(game, eddaId, 5).length).toBeLessThanOrEqual(5);
  });

  it("starts from the person chosen, not the first in the list", () => {
    const { session, eddaId } = messenger();
    const hobAsks = withHob(session, eddaId);
    const game = session.encounter!;

    expect(suggestedCommands(game, "npc:hob")[0]!.label).toBe(hobAsks.label);
    expect(suggestedCommands(game, eddaId)[0]!.label).toBe("Ask Edda about the messenger");
    // Nobody chosen: nothing is put first because of a person.
    expect(suggestedCommands(game)[0]!.label).not.toBeUndefined();
  });

  it("orders what is left: other things to do here, then doors, then looking around", () => {
    const { session, eddaId } = messenger();
    const game = session.encounter!;
    game.definition.interactions.push(newOpportunity("Study the well", "It is deep."));
    game.state.barriers.gate = {
      id: "gate",
      name: "Gate",
      open: false,
      locked: false,
      blocked: false,
      position: game.state.actors.player!.position,
    };
    game.state.attempts.push(game.definition.interactions[0]!.id);

    const suggested = suggestedCommands(game, eddaId, 10);

    expect(labels(suggested)).toEqual(["Study the well", "Open · Gate", "Look around"]);
  });

  it("never suggests a blocked action, though the full list still shows it with its reason", () => {
    const { session, eddaId } = messenger();
    const game = session.encounter!;
    const needsKey = newOpportunity("Pick the chest lock", "It clicks open.");
    needsKey.requiresItems = ["lockpick"];
    game.definition.interactions.push(needsKey);
    game.state.barriers.gate = {
      id: "gate",
      name: "Gate",
      open: false,
      locked: true,
      blocked: false,
      keyId: "gate-key",
      position: game.state.actors.player!.position,
    };

    const suggested = suggestedCommands(game, eddaId, 10);
    const full = publicCommands(game);

    expect(labels(suggested)).not.toContain("Pick the chest lock");
    expect(labels(suggested)).not.toContain("Unlock · Gate");
    expect(full.find((c) => c.label === "Pick the chest lock")?.blocked).toMatch(/need/i);
    for (const command of suggested) expect(command.blocked).toBeUndefined();

    // With the key in hand the door can be unlocked, and is then suggested.
    game.state.actors.player!.inventory.push("gate-key");
    game.definition.items.push({ id: "gate-key", name: "Gate key", requiresFlags: [] });
    expect(labels(suggestedCommands(game, eddaId, 10))).toContain("Unlock · Gate");
  });

  it("leaves out what is done, what is secret, and doors that are open or cannot be used", () => {
    const { session, eddaId } = messenger();
    const game = session.encounter!;
    const secret = newOpportunity("Ask about the secret", "The secret.");
    secret.requiresFlags = ["knows-secret"];
    game.definition.interactions.push(secret);
    game.state.attempts.push(game.definition.interactions[0]!.id);
    game.state.barriers.gate = {
      id: "gate",
      name: "Gate",
      open: true,
      locked: false,
      blocked: false,
      position: game.state.actors.player!.position,
    };

    const suggested = labels(suggestedCommands(game, eddaId, 10));

    expect(suggested).toEqual(["Look around"]);
  });

  it("suggests nothing in a fight, where there is a different list", () => {
    const { session, eddaId } = messenger();
    const game = session.encounter!;
    game.state.phase = "combat";

    expect(suggestedCommands(game, eddaId)).toEqual([]);
  });
});

describe("sceneWays", () => {
  function way(session: ReturnType<typeof messenger>["session"]) {
    return session.adventure!.links[0]!;
  }

  it("leaves out a way that needs something the player has not found out yet", () => {
    const { session } = messenger();

    expect(sceneWays(session)).toEqual([]);
    // The same list of ways the engine lets the player take: nothing the engine hides is shown.
    expect(adventureOptions(session)).toEqual([]);
  });

  it("shows a way once the discovery is made, with its label and travel time", () => {
    const { session } = messenger();
    way(session).minutes = 20;
    session.encounter!.state.flags.push(...way(session).requiresFlags);

    expect(sceneWays(session)).toEqual([
      {
        id: way(session).id,
        label: "Follow the lead to the watchtower",
        toSceneId: way(session).toSceneId,
        minutes: 20,
        status: "available",
      },
    ]);
    expect(adventureOptions(session).map((o) => o.id)).toEqual(sceneWays(session).map((w) => w.id));
  });

  it("shows a way held shut by a door as locked, and as open when the door is open", () => {
    const { session } = messenger();
    session.encounter!.state.flags.push(...way(session).requiresFlags);
    way(session).requiresOpenBarriers = ["gate"];
    session.encounter!.state.barriers.gate = {
      id: "gate",
      name: "Town gate",
      open: false,
      locked: true,
      blocked: false,
      keyId: "gate-key",
    };

    const locked = sceneWays(session);
    expect(locked).toHaveLength(1);
    expect(locked[0]).toMatchObject({ status: "locked", blockedBy: "Town gate" });
    expect(adventureOptions(session)).toEqual([]);

    session.encounter!.state.barriers.gate!.locked = false;
    expect(sceneWays(session)[0]!.status).toBe("locked");
    session.encounter!.state.barriers.gate!.open = true;
    expect(sceneWays(session)[0]).toMatchObject({ status: "available" });
    expect(sceneWays(session)[0]).not.toHaveProperty("blockedBy");
  });

  it("leaves out a locked way too when the discovery that leads to it is missing", () => {
    const { session } = messenger();
    way(session).requiresOpenBarriers = ["gate"];
    session.encounter!.state.barriers.gate = {
      id: "gate",
      name: "Town gate",
      open: false,
      locked: true,
      blocked: false,
    };

    expect(sceneWays(session)).toEqual([]);
  });

  it("is empty outside an adventure", () => {
    const { session } = messenger();
    delete session.adventure;

    expect(sceneWays(session)).toEqual([]);
  });
});

describe("knownThings", () => {
  function play(session: ReturnType<typeof messenger>["session"]) {
    const engine = new StateEngine(structuredClone(session), new EventLog());
    const run = (index: number) => {
      const s = engine.getSession();
      engine.executeEncounterAction(
        {
          id: `action-${s.stateVersion}`,
          expectedRevision: s.encounter!.state.revision,
          expectedSceneId: s.encounter!.definition.id,
          action: {
            kind: "interaction",
            interactionId: s.encounter!.definition.interactions[index]!.id,
          },
        },
        () => 0.34,
      );
    };
    const travel = () => {
      const s = engine.getSession();
      engine.transitionAdventure({
        id: `path-${s.stateVersion}`,
        linkId: adventureOptions(s)[0]!.id,
        expectedStateVersion: s.stateVersion,
      });
    };
    return { engine, run, travel };
  }

  it("knows nothing before anything has been found out", () => {
    const { session } = messenger();

    expect(knownThings(session)).toEqual([]);
  });

  it("shows the first sentence of an outcome that sets a discovery, with the place and the time", () => {
    const { session } = messenger();
    const { engine, run } = play(session);

    run(0);

    expect(knownThings(engine.getSession())).toEqual([
      {
        text: "Edda points to the north path.",
        sceneId: session.adventure!.currentSceneId,
        place: "A missing messenger",
        minutes: INITIAL_GAME_MINUTES,
      },
    ]);
  });

  it("shows the sentence the author wrote for it when there is one, and never a flag name", () => {
    const { session } = messenger();
    session.encounter!.definition.interactions[0]!.success.learned =
      "The messenger was going to the old watchtower.";
    const { engine, run } = play(session);

    run(0);
    const known = knownThings(engine.getSession());

    expect(known.map((thing) => thing.text)).toEqual([
      "The messenger was going to the old watchtower.",
    ]);
    expect(JSON.stringify(known)).not.toMatch(/done:|failed:/);
  });

  it("tidies the author's spaces where it shows what the player learned", () => {
    const { session } = messenger();
    session.encounter!.definition.interactions[0]!.success.learned =
      "  The messenger   was going\n to the watchtower. ";
    const { engine, run } = play(session);

    run(0);

    expect(knownThings(engine.getSession()).map((thing) => thing.text)).toEqual([
      "The messenger was going to the watchtower.",
    ]);
  });

  it("leaves out an outcome that sets no discovery, and an attempt that did not work", () => {
    const { session } = messenger();
    const plain = InteractionSchema.parse({
      id: "wave",
      label: "Wave to the guard",
      description: "",
      success: { text: "The guard waves back.", effects: [] },
      failure: { text: "The guard ignores you.", effects: [] },
    });
    session.encounter!.definition.interactions.push(plain);
    const failing = newOpportunity("Try the stiff latch", "It opens.");
    failing.check = { stat: "strength", modifier: 0 };
    session.encounter!.definition.interactions.push(failing);
    session.encounter!.state.actors.player!.stats.strength = 1;
    const { engine, run } = play(session);

    run(2); // wave
    run(3); // a check that fails, whose failure only says it did not work

    expect(knownThings(engine.getSession())).toEqual([]);
  });

  it("lists the newest first and takes the time from when the player came to each place", () => {
    const { session } = messenger();
    session.adventure!.links[0]!.minutes = 20;
    const { engine, run, travel } = play(session);

    run(0);
    travel();
    run(0);
    const known = knownThings(engine.getSession());

    expect(known.map((thing) => thing.place)).toEqual([
      "A note at the watchtower",
      "A missing messenger",
    ]);
    expect(known.map((thing) => thing.minutes)).toEqual([
      INITIAL_GAME_MINUTES + 20,
      INITIAL_GAME_MINUTES,
    ]);
    expect(known[1]!.text).toBe("Edda points to the north path.");
  });
});

describe("peopleMet", () => {
  it("lists the people in the scenes the player has been in, in the order they were met", () => {
    const { session, eddaId } = messenger({ portrait: "data:image/png;base64,AAAA" });
    // Someone waits in the next scene, where the player has not been yet.
    const next = session.adventure!.scenes[1]!.game;
    next.state.actors["npc:warden"] = {
      ...structuredClone(session.encounter!.state.actors[eddaId]!),
      id: "npc:warden",
      name: "The warden",
      position: next.state.actors.player!.position,
    };
    expect(peopleMet(session).map((person) => person.name)).toEqual(["Edda"]);

    const engine = new StateEngine(structuredClone(session), new EventLog());
    engine.executeEncounterAction(
      {
        id: "ask",
        expectedRevision: engine.getSession().encounter!.state.revision,
        expectedSceneId: engine.getSession().encounter!.definition.id,
        action: {
          kind: "interaction",
          interactionId: engine.getSession().encounter!.definition.interactions[0]!.id,
        },
      },
      () => 0.34,
    );
    engine.transitionAdventure({
      id: "go",
      linkId: adventureOptions(engine.getSession())[0]!.id,
      expectedStateVersion: engine.getSession().stateVersion,
    });

    const met = peopleMet(engine.getSession());
    expect(met.map((person) => person.name)).toEqual(["Edda", "The warden"]);
    expect(met[0]).toMatchObject({
      place: "A missing messenger",
      portraitDataUrl: "data:image/png;base64,AAAA",
    });
    expect(met[1]).toMatchObject({ place: "A note at the watchtower" });
    expect(met[1]).not.toHaveProperty("portraitDataUrl");
  });

  it("is empty outside an adventure", () => {
    const { session } = messenger();
    delete session.adventure;

    expect(peopleMet(session)).toEqual([]);
  });
});

describe("the portrait on a person", () => {
  const PORTRAIT = "data:image/png;base64,PORTRAIT-OF-EDDA";

  it("is copied from the character card when the game starts", () => {
    const { session, eddaId } = messenger({ portrait: PORTRAIT });

    expect(session.adventure!.cast[eddaId]!.portraitDataUrl).toBe(PORTRAIT);
  });

  it("is missing when the card has none, and an old saved person without it still opens", () => {
    const { session, eddaId } = messenger();

    expect(session.adventure!.cast[eddaId]).not.toHaveProperty("portraitDataUrl");
    const old = PersonaSchema.parse({ name: "Edda", personality: "Calm." });
    expect(old.portraitDataUrl).toBeUndefined();
    const card = newCharacterTemplate({ name: "Bare" });
    expect(card.portraitDataUrl).toBeUndefined();
  });

  it("is never put into what the story AI is sent", () => {
    const { session, eddaId } = messenger({ portrait: PORTRAIT });
    const engine = new StateEngine(structuredClone(session), new EventLog());
    const s = engine.getSession();
    engine.executeEncounterAction(
      {
        id: "say",
        expectedRevision: s.encounter!.state.revision,
        expectedSceneId: s.encounter!.definition.id,
        action: { kind: "say", text: "Lovely weather today." },
      },
      () => 0.5,
    );
    const messages = buildFreeReplyMessages(
      engine.getSession(),
      eddaId,
      "Lovely weather today.",
      [],
    );

    expect(JSON.stringify(messages)).not.toContain("PORTRAIT-OF-EDDA");
    expect(JSON.stringify(messages)).not.toContain("data:image");
  });
});

describe("what the player says goes to the person chosen", () => {
  it("is the chosen person even when the line names someone else", () => {
    const { session, eddaId } = messenger();
    withHob(session, eddaId);
    const { definition: d, state: s } = session.encounter!;

    expect(speechAddressee(d, s, "Hob, what do you think?")!.id).toBe("npc:hob");
    expect(speechAddressee(d, s, "Hob, what do you think?", undefined, eddaId)!.id).toBe(eddaId);
    expect(speechAddressee(d, s, "Good day.", undefined, "npc:hob")!.id).toBe("npc:hob");
  });

  it("falls back on the usual guess when the person chosen is not here", () => {
    const { session, eddaId } = messenger();
    withHob(session, eddaId);
    const { definition: d, state: s } = session.encounter!;
    s.actors["npc:hob"]!.position = "far-away";

    expect(speechAddressee(d, s, "Good day.", undefined, "npc:hob")!.id).toBe(eddaId);
    expect(speechAddressee(d, s, "Good day.", undefined, "npc:nobody")!.id).toBe(eddaId);
  });

  it("sends a line to the chosen person through planSay, as a free reply", async () => {
    const { session, eddaId } = messenger();
    withHob(session, eddaId);
    const requests: CompletionRequest[] = [];
    const provider: Provider = {
      async *streamCompletion(request: CompletionRequest): AsyncGenerator<StreamChunk> {
        requests.push(request);
        yield { type: "text_delta", text: '{"action":null}' };
        yield { type: "done", finishReason: "stop" };
      },
    };

    const guessed = await planSay(session, "Hob, how are you today?", provider);
    const chosen = await planSay(session, "Hob, how are you today?", provider, {
      addresseeId: eddaId,
    });

    expect(guessed).toEqual({ kind: "free", addresseeId: "npc:hob" });
    expect(chosen).toEqual({ kind: "free", addresseeId: eddaId });
  });
});

describe("what an outcome can teach", () => {
  it("accepts a sentence of at most 200 characters, and old scenes without one still open", () => {
    const base = {
      id: "x",
      label: "Ask",
      description: "",
      success: { text: "Yes.", effects: [] },
      failure: { text: "No.", effects: [] },
    };

    expect(InteractionSchema.parse(base).success.learned).toBeUndefined();
    expect(
      InteractionSchema.parse({ ...base, success: { ...base.success, learned: "A".repeat(200) } })
        .success.learned,
    ).toHaveLength(200);
    expect(() =>
      InteractionSchema.parse({ ...base, success: { ...base.success, learned: "A".repeat(201) } }),
    ).toThrow();
  });
});

describe("commandKind and groupedCommands", () => {
  it("tells talking, things, looking, doors and moving apart, and sorts every choice into a group", async () => {
    const { commandKind, groupedCommands } = await import("../../src/game/catalog");
    const { session } = messenger();
    const game = session.encounter!;
    const take = newOpportunity("Take the lantern", "You take it.");
    take.requiresItems = ["lantern"];
    game.definition.interactions.push(take, newOpportunity("Study the well", "It is deep."));
    game.state.barriers.gate = {
      id: "gate",
      name: "Gate",
      open: false,
      locked: false,
      blocked: false,
      position: game.state.actors.player!.position,
    };

    const kind = (label: string) => {
      const command = publicCommands(game).find((c) => c.label === label)!;
      return commandKind(game, command);
    };
    expect(kind("Ask Edda about the messenger")).toBe("talk");
    expect(kind("Take the lantern")).toBe("item");
    expect(kind("Study the well")).toBe("look");
    expect(kind("Look around")).toBe("look");
    expect(kind("Open · Gate")).toBe("door");

    const groups = groupedCommands(game);
    expect(groups.map((g) => g.group)).toEqual(["people", "things", "places"]);
    expect(labels(groups[0]!.commands)).toEqual(["Ask Edda about the messenger"]);
    expect(labels(groups[1]!.commands)).toEqual(["Take the lantern", "Study the well"]);
    expect(labels(groups[2]!.commands)).toContain("Look around");
    // Nothing is lost, and nothing is in two groups.
    expect(groups.flatMap((g) => g.commands)).toHaveLength(publicCommands(game).length);
  });

  it("keeps a blocked choice in its group with the reason, and leaves out empty groups", async () => {
    const { groupedCommands } = await import("../../src/game/catalog");
    const { session } = messenger();
    const game = session.encounter!;
    game.state.attempts.push(game.definition.interactions[0]!.id);

    const people = groupedCommands(game).find((g) => g.group === "people")!;

    expect(people.commands[0]!.blocked).toMatch(/already resolved/i);
    expect(groupedCommands(game).map((g) => g.group)).not.toContain("fight");
  });
});
