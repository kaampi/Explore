import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { adventureOptions } from "../../src/game/AdventureEngine";
import { arrivalBetween, notableEvents } from "../../src/ui/play/notableEvents";
import { storyRows } from "../../src/ui/play/storyRows";
import { innVisitExample } from "../../src/scenarios/innVisit";
import type { EncounterAction } from "../../src/game/EncounterSchema";
import type { Session } from "../../src/state/StateSchema";

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
