import { describe, expect, it } from "vitest";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { startWorldExploration } from "../../src/session/worldStart";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { parseSession } from "../../src/state/StateSchema";
import { adventureOptions } from "../../src/game/AdventureEngine";
import { AdventureRunSchema } from "../../src/game/AdventureSchema";
import { emptyCampaignPlayer } from "../../src/library/LibrarySchema";
import { buildFreeReplyMessages } from "../../src/session/encounterPrompt";
import { INITIAL_GAME_MINUTES, formatGameTime, formatTravelTime } from "../../src/state/gameClock";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";

function worldGame() {
  const inn = innVisitExample();
  const world = structuredClone(inn.realm);
  const town = world.worldMap!.nodes.find((n) => n.name === "Brookmere")!;
  const lodge = world.worldMap!.nodes.find((n) => n.name === "The Copper Lantern")!;
  // Walking from the village to the inn takes twenty minutes.
  world.worldMap!.routes.push({
    ...structuredClone(world.worldMap!.routes[0]!),
    id: "road",
    from: town.id,
    to: lodge.id,
    duration: "20 minutes",
    access: "open",
    bothWays: true,
  });
  const { session } = startWorldExploration(
    world,
    { characters: [], objects: [], places: [], rulesets: [] },
    { player: { ...emptyCampaignPlayer(), name: "Traveller" }, startNodeId: town.id },
    "clock",
  );
  return { engine: new StateEngine(session, new EventLog()) };
}

function travel(engine: StateEngine, label: string) {
  const s = engine.getSession();
  const link = adventureOptions(s).find((l) => l.label.startsWith(label));
  expect(link, label).toBeDefined();
  engine.transitionAdventure({
    id: crypto.randomUUID(),
    linkId: link!.id,
    expectedStateVersion: s.stateVersion,
  });
}

describe("game time", () => {
  it("starts at the usual morning and moves forward with the travel time of each way taken", () => {
    const { engine } = worldGame();
    expect(engine.getSession().adventure!.clockMinutes).toBe(INITIAL_GAME_MINUTES);

    travel(engine, "Enter The Copper Lantern");

    expect(engine.getSession().adventure!.clockMinutes).toBe(INITIAL_GAME_MINUTES + 20);
    expect(formatGameTime(engine.getSession().adventure!.clockMinutes)).toBe("Day 1 · 08:20");
  });

  it("stands still for a way with no travel time, and moves again for the road back", () => {
    const { engine } = worldGame();
    travel(engine, "Enter The Copper Lantern");
    const arrived = engine.getSession().adventure!.clockMinutes;

    const state = engine.getSession().encounter!;
    const door = Object.values(state.state.barriers).find((b) => b.name.endsWith("entrance"))!;
    engine.executeEncounterAction(
      {
        id: crypto.randomUUID(),
        expectedRevision: state.state.revision,
        expectedSceneId: engine.getSession().sceneId!,
        action: { kind: "interact", operation: "open", barrierId: door.id },
      },
      () => 0,
    );
    travel(engine, "Enter Common room");
    expect(engine.getSession().adventure!.clockMinutes).toBe(arrived);
    travel(engine, "Leave The Copper Lantern");
    travel(engine, "Leave Brookmere");

    expect(engine.getSession().adventure!.clockMinutes).toBe(arrived + 20);
  });

  it("shows the travel time on each way in words", () => {
    expect(formatTravelTime(20)).toBe("20 min");
    expect(formatTravelTime(150)).toBe("2 h 30 min");
    expect(formatTravelTime(120)).toBe("2 h");
    expect(formatTravelTime(1440)).toBe("1 day");
    expect(formatTravelTime(4320)).toBe("3 days");
    const { engine } = worldGame();
    const option = adventureOptions(engine.getSession()).find((l) => l.label.includes("Lantern"));
    expect(option?.minutes).toBe(20);
  });

  it("tells the story AI the time of day, after a journey", () => {
    const { engine } = worldGame();
    travel(engine, "Enter The Copper Lantern");
    const session = engine.getSession();
    const who =
      Object.keys(session.encounter!.state.actors).find((id) => id !== "player") ?? "player";

    const text = buildFreeReplyMessages(session, who, "Hello", [])
      .map((m) => m.content)
      .join("\n");

    expect(text).toContain("Time: Day 1 · 08:20, morning.");
  });

  it("changes nothing for an adventure whose ways have no travel time, and older runs still open", () => {
    const built = connectedAdventureExample();
    const session = startPlayableCampaign(
      built.campaign,
      built.campaign.scenes[0]!,
      built.places,
      "plain",
      [built.realm],
      { characters: built.characters },
    );
    const text = buildFreeReplyMessages(session, `npc:${built.characters[0]!.id}`, "Hi", [])
      .map((m) => m.content)
      .join("\n");

    expect(text).not.toContain("Time:");
    const old = JSON.parse(JSON.stringify(session.adventure));
    delete old.clockMinutes;
    expect(AdventureRunSchema.parse(old).clockMinutes).toBe(INITIAL_GAME_MINUTES);
    expect(parseSession(JSON.parse(JSON.stringify(session))).adventure!.clockMinutes).toBe(
      INITIAL_GAME_MINUTES,
    );
  });
});
