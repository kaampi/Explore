import { cutsceneAdventure } from "../fixtures/cutscenes";
import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { adventureOptions, knownThings } from "../../src/game/AdventureEngine";
import { arrivalBetween, notableEvents } from "../../src/ui/play/notableEvents";
import { storyRows } from "../../src/ui/play/storyRows";
import { innVisitExample } from "../../src/scenarios/innVisit";
import type { EncounterAction } from "../../src/game/EncounterSchema";
import { parseSession, type Session } from "../../src/state/StateSchema";

function start(): Session {
  const built = connectedAdventureExample();
  return startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "notable",
    [built.realm],
    { characters: built.characters },
  );
}

/** The game after the first action, which tells the player where to look. */
function asked(session: Session): Session {
  const engine = new StateEngine(structuredClone(session), new EventLog());
  const s = engine.getSession();
  engine.executeEncounterAction(
    {
      id: "ask",
      expectedRevision: s.encounter!.state.revision,
      expectedSceneId: s.encounter!.definition.id,
      action: { kind: "interaction", interactionId: s.encounter!.definition.interactions[0]!.id },
    },
    () => 0.34,
  );
  return engine.getSession();
}

describe("notableEvents", () => {
  it("marks a new discovery, once", () => {
    const before = start();
    const after = asked(before);

    expect(notableEvents(before, after)).toEqual([
      { kind: "learned", text: "Edda points to the north path." },
    ]);
    // The same moment again is nothing new.
    expect(notableEvents(after, after)).toEqual([]);
  });

  it("marks a thing that comes into the pack and a door that gets unlocked, each once", () => {
    const built = innVisitExample();
    const first = startPlayableCampaign(
      built.campaign,
      built.campaign.scenes[0]!,
      built.places,
      "inn-notable",
      [built.realm],
    );
    const engine = new StateEngine(structuredClone(first), new EventLog());
    const enter = engine.getSession();
    engine.transitionAdventure({
      id: "enter",
      linkId: adventureOptions(enter).find((o) => o.label === "Enter the inn")!.id,
      expectedStateVersion: enter.stateVersion,
    });
    const act = (action: EncounterAction) => {
      const s = engine.getSession();
      engine.executeEncounterAction({
        id: crypto.randomUUID(),
        expectedSceneId: s.sceneId!,
        expectedRevision: s.encounter!.state.revision,
        action,
      });
    };
    const room = engine.getSession();

    act({ kind: "interaction", interactionId: "take-key" });
    const withKey = engine.getSession();
    expect(notableEvents(room, withKey).filter((n) => n.kind === "item")).toEqual([
      { kind: "item", text: "Brass key" },
    ]);
    expect(notableEvents(withKey, withKey)).toEqual([]);

    act({ kind: "interact", barrierId: built.storeDoorId, operation: "unlock" });
    const unlocked = engine.getSession();
    expect(notableEvents(withKey, unlocked)).toEqual([
      { kind: "unlocked", text: "Store room door" },
    ]);
    // Opening a door that is already unlocked is not an unlocking.
    act({ kind: "interact", barrierId: built.storeDoorId, operation: "open" });
    expect(notableEvents(unlocked, engine.getSession())).toEqual([]);
  });

  it("marks the goal when it is reached, and only then", () => {
    const before = start();
    const after = structuredClone(before);
    after.storyFlags = [...after.storyFlags, ...before.adventure!.goal!.requiresFlags];

    const marks = notableEvents(before, after);
    expect(marks.filter((n) => n.kind === "goal")).toEqual([
      { kind: "goal", text: before.adventure!.goal!.title },
    ]);
    expect(notableEvents(after, after)).toEqual([]);
  });

  it("compares nothing across two different games", () => {
    const one = start();
    const other = { ...asked(one), id: "another-game" };
    expect(notableEvents(one, other)).toEqual([]);
    expect(arrivalBetween(one, other)).toBeNull();
  });
});

describe("arrivalBetween", () => {
  it("names the place come to and the time the way took, and is nothing without a move", () => {
    const before = asked(start());
    expect(arrivalBetween(before, before)).toBeNull();

    const engine = new StateEngine(structuredClone(before), new EventLog());
    const way = adventureOptions(before)[0]!;
    engine.transitionAdventure({
      id: "go",
      linkId: way.id,
      expectedStateVersion: before.stateVersion,
    });
    const after = engine.getSession();
    const link = after.adventure!.links.find((l) => l.id === way.id)!;

    expect(arrivalBetween(before, after)).toEqual({
      place: after.adventure!.scenes.find((s) => s.id === link.toSceneId)!.name,
      minutes: link.minutes ?? 0,
    });
  });
});

describe("an outcome that gives a thing", () => {
  function innPlay(learned?: string) {
    const built = innVisitExample();
    if (learned)
      for (const scene of built.campaign.scenes)
        for (const action of scene.encounter?.definition.interactions ?? [])
          if (action.id === "take-key") action.success.learned = learned;
    const first = startPlayableCampaign(
      built.campaign,
      built.campaign.scenes[0]!,
      built.places,
      "inn-gives",
      [built.realm],
    );
    const engine = new StateEngine(structuredClone(first), new EventLog());
    const enter = engine.getSession();
    engine.transitionAdventure({
      id: "enter",
      linkId: adventureOptions(enter).find((o) => o.label === "Enter the inn")!.id,
      expectedStateVersion: enter.stateVersion,
    });
    const room = engine.getSession();
    const s = engine.getSession();
    engine.executeEncounterAction({
      id: "key",
      expectedSceneId: s.sceneId!,
      expectedRevision: s.encounter!.state.revision,
      action: { kind: "interaction", interactionId: "take-key" },
    });
    return { before: room, after: engine.getSession() };
  }

  it("is told by the pack, not as a discovery, unless the author wrote what is learned", () => {
    const plain = innPlay();
    expect(knownThings(plain.after)).toEqual([]);
    expect(notableEvents(plain.before, plain.after)).toEqual([{ kind: "item", text: "Brass key" }]);

    const written = innPlay("The key to the store room was on the counter.");
    expect(knownThings(written.after).map((thing) => thing.text)).toEqual([
      "The key to the store room was on the counter.",
    ]);
    expect(notableEvents(written.before, written.after).map((n) => n.kind)).toEqual([
      "learned",
      "item",
    ]);
  });
});

describe("rolls and answers held back until the dice have landed", () => {
  it("leaves out the roll, and what was told in answer, after the turn it is held at", () => {
    const first = start();
    const after = asked(first);
    const lastTurn = Math.max(...after.conversation.map((t) => (t as { turn: number }).turn));
    const all = storyRows(after);
    const held = storyRows(after, { heldAfterTurn: lastTurn - 2 });

    // Everything is there when nothing is held back.
    expect(all.some((row) => row.kind === "narrator" && row.text.includes("Edda points"))).toBe(
      true,
    );
    // What the player did stays; the answer waits.
    expect(held.some((row) => row.kind === "do")).toBe(true);
    expect(held.some((row) => row.kind === "narrator" && row.text.includes("Edda points"))).toBe(
      false,
    );
    expect(storyRows(after, { heldAfterTurn: lastTurn }).length).toBe(all.length);
  });

  it("holds a roll's row with its turn, and the goal line when it was reached later", () => {
    const after = asked(start());
    const lastTurn = Math.max(...after.conversation.map((t) => (t as { turn: number }).turn));
    const done = structuredClone(after);
    done.storyFlags = [...done.storyFlags, ...done.adventure!.goal!.requiresFlags];
    done.adventure!.goalReachedTurn = lastTurn;

    expect(storyRows(done).some((row) => row.kind === "goal")).toBe(true);
    expect(
      storyRows(done, { heldAfterTurn: lastTurn - 1 }).some((row) => row.kind === "goal"),
    ).toBe(false);
    expect(storyRows(done, { heldAfterTurn: lastTurn }).some((row) => row.kind === "goal")).toBe(
      true,
    );
  });
});

describe("the goal in the story", () => {
  it("has a line at the end of the story once the goal is reached, and none before", () => {
    const before = start();
    expect(storyRows(before).some((row) => row.kind === "goal")).toBe(false);

    const after = structuredClone(before);
    after.storyFlags = [...after.storyFlags, ...before.adventure!.goal!.requiresFlags];
    const rows = storyRows(after);
    expect(rows.at(-1)).toEqual({
      kind: "goal",
      key: "goal",
      title: before.adventure!.goal!.title,
    });
  });
});

it("reconstructs a held arrival when a travel cut-scene is resumed from a saved game", () => {
  const { campaign, start, out, lead } = cutsceneAdventure();
  campaign.storyFlags.push(lead);
  const engine = new StateEngine(start(), new EventLog());
  engine.finishCutscene("intro");
  engine.transitionAdventure({
    id: "travel",
    linkId: out.id,
    expectedStateVersion: engine.getSession().stateVersion,
  });
  engine.finishCutscene("road");
  const before = parseSession(JSON.parse(JSON.stringify(engine.getSession())));
  const resumed = new StateEngine(structuredClone(before), new EventLog());
  resumed.finishCutscene("bells");
  resumed.finishCutscene("arrival");
  expect(arrivalBetween(before, resumed.getSession())).toBeNull();
  resumed.finishCutscene("wind");
  expect(arrivalBetween(before, resumed.getSession())).toEqual({
    place: "A note at the watchtower",
    minutes: 35,
  });
});
