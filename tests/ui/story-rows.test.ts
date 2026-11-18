import { describe, expect, it } from "vitest";
import { connectedAdventureExample, newOpportunity } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { INITIAL_GAME_MINUTES } from "../../src/state/gameClock";
import { adventureOptions, storySegments } from "../../src/game/AdventureEngine";
import { storyRows } from "../../src/ui/play/storyRows";
import type { EncounterAction } from "../../src/game/EncounterSchema";

function game() {
  const built = connectedAdventureExample();
  const session = startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "story-rows",
    [built.realm],
    { characters: built.characters },
  );
  const eddaId = `npc:${built.characters[0]!.id}`;
  return { session, eddaId };
}

function play(session: ReturnType<typeof game>["session"]) {
  const engine = new StateEngine(structuredClone(session), new EventLog());
  const act = (action: EncounterAction, rng: () => number = () => 0.2) => {
    const s = engine.getSession();
    const id = `action-${s.stateVersion}`;
    engine.executeEncounterAction(
      {
        id,
        expectedRevision: s.encounter!.state.revision,
        expectedSceneId: s.encounter!.definition.id,
        action,
      },
      rng,
    );
    return id;
  };
  const travel = () => {
    const s = engine.getSession();
    engine.transitionAdventure({
      id: `path-${s.stateVersion}`,
      linkId: adventureOptions(s)[0]!.id,
      expectedStateVersion: s.stateVersion,
    });
  };
  return { engine, act, travel };
}
const kinds = (rows: { kind: string }[]) => rows.map((row) => row.kind);

describe("storySegments", () => {
  it("is one place with the game's first time before the player has gone anywhere", () => {
    const { session } = game();

    expect(storySegments(session)).toEqual([
      {
        sceneId: session.adventure!.currentSceneId,
        place: "A missing messenger",
        minutes: INITIAL_GAME_MINUTES,
        from: 0,
        to: 1,
      },
    ]);
  });

  it("cuts the conversation at each arrival, with the time the player came to each place", () => {
    const { session } = game();
    session.adventure!.links[0]!.minutes = 20;
    const { engine, act, travel } = play(session);
    act({ kind: "interaction", interactionId: session.encounter!.definition.interactions[0]!.id });
    travel();

    const segments = storySegments(engine.getSession());

    expect(segments.map((s) => [s.place, s.minutes, s.from, s.to])).toEqual([
      ["A missing messenger", INITIAL_GAME_MINUTES, 0, 3],
      ["A note at the watchtower", INITIAL_GAME_MINUTES + 20, 3, 4],
    ]);
  });
});

describe("storyRows", () => {
  it("starts with a divider for the place, and the scene's opening as running prose", () => {
    const { session } = game();

    const rows = storyRows(session);

    expect(kinds(rows)).toEqual(["divider", "narrator"]);
    expect(rows[0]).toMatchObject({ place: "A missing messenger", minutes: INITIAL_GAME_MINUTES });
    expect(rows[1]).toMatchObject({ text: expect.stringContaining("Edda waits") });
  });

  it("tells an action by its name and a conversation's outcome as the person's line, with no roll when none was made", () => {
    const { session } = game();
    const { engine, act } = play(session);
    act({ kind: "interaction", interactionId: session.encounter!.definition.interactions[0]!.id });

    const rows = storyRows(engine.getSession());

    expect(kinds(rows)).toEqual(["divider", "narrator", "do", "person"]);
    expect(rows[2]).toMatchObject({ label: "Ask Edda about the messenger" });
    expect(rows[3]).toMatchObject({
      name: "Edda",
      improvised: false,
      text: expect.stringContaining("Edda points"),
    });
  });

  it("tells a roll in one row between the action and its outcome, with the skill by name", () => {
    const { session } = game();
    const hard = newOpportunity("Force the stiff gate", "It gives way.");
    hard.check = { stat: "strength", modifier: 0 };
    session.encounter!.definition.interactions.push(hard);
    session.encounter!.state.actors.player!.stats.strength = 60;
    session.encounter!.definition.rules.attributes = [
      { id: "strength", name: "Strength", min: 0, max: 100 },
    ];
    const { engine, act } = play(session);
    act({ kind: "interaction", interactionId: hard.id }, () => 0.33);

    const rows = storyRows(engine.getSession());
    const check = rows.find((row) => row.kind === "check")!;

    expect(kinds(rows)).toEqual(["divider", "narrator", "do", "check", "narrator"]);
    expect(check).toMatchObject({
      actor: "Traveller",
      skill: "Strength",
      roll: 34,
      target: 60,
      degree: "success",
    });
  });

  it("tells what the player typed as speech, and a prepared answer to it as the person's line", () => {
    const { session } = game();
    const { engine, act } = play(session);
    act({ kind: "say", text: "Hello Edda" });

    const rows = storyRows(engine.getSession());

    expect(kinds(rows)).toEqual(["divider", "narrator", "say", "person"]);
    expect(rows[2]).toMatchObject({ text: "Hello Edda" });
    expect(rows[3]).toMatchObject({ name: "Edda", improvised: false });
  });

  it("tells a spoken line the engine matched to a conversation as speech, not as the action's name", () => {
    const { session } = game();
    const { engine, act } = play(session);
    act({ kind: "say", text: "Where is the messenger?" });

    const rows = storyRows(engine.getSession());

    expect(rows.find((row) => row.kind === "say")).toMatchObject({
      text: "Where is the messenger?",
    });
    expect(kinds(rows)).not.toContain("do");
  });

  it("marks a line the AI wrote for a line nobody prepared an answer to as improvised", () => {
    const { session, eddaId } = game();
    const { engine, act } = play(session);
    const actionId = act({ kind: "say", text: "Lovely weather today." });
    engine.attachEncounterNarration({
      actionId,
      sceneId: session.encounter!.definition.id,
      text: "Edda squints at the sky. “It will not last.”",
      kind: "free-reply",
      speakerId: eddaId,
      model: "mock",
    });

    const rows = storyRows(engine.getSession());
    const reply = rows.find((row) => row.kind === "person")!;

    expect(reply).toMatchObject({ name: "Edda", improvised: true });
  });

  it("shows only the place the player is in, and every place under a divider when asked", () => {
    const { session } = game();
    session.adventure!.links[0]!.minutes = 20;
    const { engine, act, travel } = play(session);
    act({ kind: "interaction", interactionId: session.encounter!.definition.interactions[0]!.id });
    travel();

    const now = storyRows(engine.getSession());
    const all = storyRows(engine.getSession(), { earlier: true });

    expect(now.filter((row) => row.kind === "divider")).toEqual([
      expect.objectContaining({ place: "A note at the watchtower", current: true }),
    ]);
    expect(all.filter((row) => row.kind === "divider")).toEqual([
      expect.objectContaining({
        place: "A missing messenger",
        minutes: INITIAL_GAME_MINUTES,
        current: false,
      }),
      expect.objectContaining({
        place: "A note at the watchtower",
        minutes: INITIAL_GAME_MINUTES + 20,
        current: true,
      }),
    ]);
    expect(all.length).toBeGreaterThan(now.length);
  });

  it("gives every row a key of its own, and never shows a flag name or an id", () => {
    const { session } = game();
    const { engine, act } = play(session);
    act({ kind: "interaction", interactionId: session.encounter!.definition.interactions[0]!.id });
    act({ kind: "say", text: "Hello Edda" });

    const rows = storyRows(engine.getSession(), { earlier: true });

    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
    expect(JSON.stringify(rows)).not.toMatch(/done:|failed:|npc:/);
  });
});
