import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { startWorldExploration } from "../../src/session/worldStart";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { parseSession } from "../../src/state/StateSchema";
import { emptyCampaignPlayer } from "../../src/library/LibrarySchema";
import { AdventureRunSchema } from "../../src/game/AdventureSchema";
import { publicCommands } from "../../src/game/catalog";
import { buildFreeReplyMessages } from "../../src/session/encounterPrompt";
import {
  buildResidentMessages,
  emptyPlaceHere,
  parseResidents,
  populatePlace,
} from "../../src/session/residents";
import type { Provider } from "../../src/session/encounterAI";
import type { CompletionRequest, StreamChunk } from "../../src/llm/types";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";

const person = (name: string, extra: Record<string, string> = {}) => ({
  name,
  personality: "Calm and curious.",
  speech: "Slowly, with long pauses.",
  mood: "content",
  appearance: "Grey at the temples.",
  ...extra,
});
const answer = (...people: ReturnType<typeof person>[]) => JSON.stringify({ residents: people });

function provider(text: string) {
  const requests: CompletionRequest[] = [];
  const p: Provider = {
    async *streamCompletion(request: CompletionRequest): AsyncGenerator<StreamChunk> {
      requests.push(request);
      yield { type: "text_delta", text };
      yield { type: "done", finishReason: "stop" };
    },
  };
  return { provider: p, requests };
}

function world(on: boolean, population = "A few regulars and the innkeeper.") {
  const inn = innVisitExample();
  const realm = structuredClone(inn.realm);
  if (on) realm.openWorld = { generateResidents: true };
  const common = realm.worldMap!.nodes.find((n) => n.name === "Common room")!;
  common.population = population;
  const { session } = startWorldExploration(
    realm,
    { characters: [], objects: [], places: [], rulesets: [] },
    { player: { ...emptyCampaignPlayer(), name: "Traveller" }, startNodeId: common.id },
    "residents",
  );
  return { engine: new StateEngine(session, new EventLog()), realm };
}

const others = (engine: StateEngine) =>
  Object.values(engine.getSession().encounter!.state.actors).filter((a) => a.id !== "player");

describe("residents invented for an empty place", () => {
  it("are off unless the world turns them on, and then nothing is asked of the AI", async () => {
    const { engine } = world(false);
    const { provider: p, requests } = provider(answer(person("Mira")));

    expect(engine.getSession().adventure!.openWorld).toBeUndefined();
    expect(emptyPlaceHere(engine.getSession())).toBeUndefined();
    expect(await populatePlace({ engine, provider: p })).toBe("skipped");
    expect(requests).toHaveLength(0);
    expect(others(engine)).toEqual([]);
    expect(() =>
      engine.settlePlace({ sceneId: engine.getSession().adventure!.currentSceneId, residents: [] }),
    ).toThrow(/does not invent/);
  });

  it("make a person who can be spoken to and nothing more: neutral, normal health, no things, no weapons, no actions, middle skills", async () => {
    const { engine } = world(true);
    const { provider: p } = provider(answer(person("Mira", { pronoun: "she/her" })));

    expect(await populatePlace({ engine, provider: p })).toBe("populated");

    const [mira] = others(engine);
    const game = engine.getSession().encounter!;
    expect(mira).toMatchObject({
      name: "Mira",
      team: "residents",
      control: "npc",
      inventory: [],
      weapons: [],
      toughness: "normal",
      disposition: "active",
    });
    expect(mira!.hp).toBe(12);
    expect(game.definition.interactions.some((i) => i.counterpartyId === mira!.id)).toBe(false);
    expect(game.definition.hostilities.flat()).not.toContain("residents");
    expect(
      publicCommands(game).some(
        (c) => c.action.kind === "attack" && c.action.targetId === mira!.id,
      ),
    ).toBe(false);
    expect(Object.keys(game.state.itemLocations).length).toBe(0);
    expect(engine.getSession().adventure!.cast[mira!.id]).toMatchObject({
      name: "Mira",
      pronoun: "she/her",
    });
  });

  it("are at most two, and a longer list is no answer", async () => {
    const { engine } = world(true);
    const { provider: p } = provider(answer(person("Mira"), person("Tomas"), person("Ilse")));

    expect(await populatePlace({ engine, provider: p })).toBe("empty");
    expect(others(engine)).toEqual([]);
    expect(parseResidents(answer(person("A"), person("B"), person("C")), [])).toBeNull();
    expect(() =>
      world(true).engine.settlePlace({
        sceneId: world(true).engine.getSession().adventure!.currentSceneId,
        residents: [person("A"), person("B"), person("C")],
      }),
    ).toThrow();
  });

  it("are settled once for a place, however it went, and never again", async () => {
    const { engine } = world(true);
    const first = provider(answer(person("Mira")));
    expect(await populatePlace({ engine, provider: first.provider })).toBe("populated");
    const run = engine.getSession().adventure!;
    expect(run.settled).toEqual([run.currentSceneId]);

    const second = provider(answer(person("Tomas")));
    expect(await populatePlace({ engine, provider: second.provider })).toBe("skipped");

    expect(second.requests).toHaveLength(0);
    expect(others(engine).map((a) => a.name)).toEqual(["Mira"]);
    expect(() => engine.settlePlace({ sceneId: run.currentSceneId, residents: [] })).toThrow(
      /already settled/,
    );
  });

  it.each([
    ["not JSON", "Sure! Here are two people."],
    ["extra keys", JSON.stringify({ residents: [person("Mira")], items: ["sword"] })],
    [
      "a person with extra keys",
      JSON.stringify({ residents: [{ ...person("Mira"), weapon: "axe" }] }),
    ],
    ["a person with no name", answer(person(""))],
    ["too long a field", answer(person("Mira", { personality: "x".repeat(601) }))],
    ["the same name twice", answer(person("Mira"), person("mira"))],
    ["a name the traveller has", answer(person("Traveller"))],
    ["an empty list", JSON.stringify({ residents: [] })],
  ])("settle the place empty when the answer is %s", async (_label, text) => {
    const { engine } = world(true);
    const { provider: p } = provider(text);

    expect(await populatePlace({ engine, provider: p })).toBe("empty");

    expect(others(engine)).toEqual([]);
    expect(engine.getSession().adventure!.settled).toHaveLength(1);
  });

  it("settle the place empty when the AI fails, and make no call and no mark without a model", async () => {
    const failing: Provider = {
      async *streamCompletion(): AsyncGenerator<StreamChunk> {
        yield { type: "error", message: "down" } as StreamChunk;
      },
    };
    const { engine } = world(true);
    expect(await populatePlace({ engine, provider: failing })).toBe("empty");
    expect(engine.getSession().adventure!.settled).toHaveLength(1);

    const none = world(true);
    expect(await populatePlace({ engine: none.engine, provider: undefined })).toBe("skipped");
    expect(none.engine.getSession().adventure!.settled).toEqual([]);
  });

  it("only come to a place the map says people live in, and with no people named for it", () => {
    expect(emptyPlaceHere(world(true).engine.getSession())).toBeDefined();
    expect(emptyPlaceHere(world(true, "").engine.getSession())).toBeUndefined();
  });

  it("are thrown away if the player has left before the answer comes", async () => {
    const { engine } = world(true);
    const slow: Provider = {
      async *streamCompletion(): AsyncGenerator<StreamChunk> {
        const s = engine.getSession();
        const door = Object.values(s.encounter!.state.barriers).find(
          (b) => b.name === "Kitchen door",
        )!;
        engine.executeEncounterAction(
          {
            id: crypto.randomUUID(),
            expectedRevision: s.encounter!.state.revision,
            expectedSceneId: s.sceneId!,
            action: { kind: "interact", operation: "open", barrierId: door.id },
          },
          () => 0,
        );
        const link = (await import("../../src/game/AdventureEngine"))
          .adventureOptions(engine.getSession())
          .find((l) => l.label === "Go to Kitchen")!;
        engine.transitionAdventure({
          id: crypto.randomUUID(),
          linkId: link.id,
          expectedStateVersion: engine.getSession().stateVersion,
        });
        yield { type: "text_delta", text: answer(person("Mira")) };
        yield { type: "done", finishReason: "stop" };
      },
    };

    expect(await populatePlace({ engine, provider: slow })).toBe("stale");

    expect(engine.getSession().adventure!.settled).toEqual([]);
  });

  it("are told to the story AI like any person, and the place text goes in as untrusted data", async () => {
    const { engine } = world(true);
    const { provider: p, requests } = provider(answer(person("Mira")));
    await populatePlace({ engine, provider: p });

    const place = emptyPlaceHere(world(true).engine.getSession())!;
    const text = requests[0]!.messages.map((m) => m.content).join("\n");
    expect(text).toContain("UNTRUSTED");
    expect(text).toContain(place.name);
    expect(requests[0]!.messages[0]!.content).toContain("Do not give them items");
    const [mira] = others(engine);
    const prompt = buildFreeReplyMessages(engine.getSession(), mira!.id, "Hello", [])
      .map((m) => m.content)
      .join("\n");
    expect(prompt).toContain("Character: Mira");
    expect(buildResidentMessages(place)).toHaveLength(2);
  });

  it("survive saving and loading, and another game in the same world is not touched", async () => {
    const { engine } = world(true);
    await populatePlace({ engine, provider: provider(answer(person("Mira"))).provider });
    const repo = new IndexedDBRepository(new IDBFactory(), "residents");
    await repo.saveSession(engine.getSession());

    const loaded = parseSession(await repo.loadSession(engine.getSession().id));

    expect(Object.values(loaded.encounter!.state.actors).map((a) => a.name)).toContain("Mira");
    expect(loaded.adventure!.settled).toHaveLength(1);
    expect(others(world(true).engine)).toEqual([]);
  });

  it("do not exist in an older run, which opens as before", () => {
    const run = JSON.parse(JSON.stringify(world(true).engine.getSession().adventure));
    delete run.settled;
    delete run.openWorld;

    const parsed = AdventureRunSchema.parse(run);

    expect(parsed.settled).toEqual([]);
    expect(parsed.openWorld).toBeUndefined();
  });
});
