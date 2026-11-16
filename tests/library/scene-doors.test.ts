import { describe, expect, it } from "vitest";
import { adventureFacts, connectedAdventureExample } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { adventureOptions } from "../../src/game/AdventureEngine";
import { StateEngine } from "../../src/state/StateEngine";
import { EventLog } from "../../src/events/EventLog";
import { resolveEncounterAction } from "../../src/game/EncounterEngine";
import type { EncounterGame } from "../../src/game/EncounterSchema";
import {
  addDoor,
  addPickUp,
  attachDoorToConnection,
  attachDoorToRoute,
  doorsHere,
  placeItem,
  removeDoor,
  removeItem,
} from "../../src/library/sceneParts";
import { storyboardIssues, storyboardWarnings } from "../../src/ui/studio/storyboardReadiness";

function setup() {
  const built = connectedAdventureExample();
  const campaign = structuredClone(built.campaign);
  const key = built.objects[0]!;
  return { built, campaign, key, first: campaign.scenes[0]!, second: campaign.scenes[1]! };
}

/** A scene with a second position, joined to the first. */
function twoPositions(scene: ReturnType<typeof setup>["first"]) {
  const next = structuredClone(scene);
  const game = next.encounter!;
  game.definition.places.push({ id: "porch", name: "Porch", x: 4, y: 0, elevation: 0, cover: 0 });
  game.definition.connections.push({ from: "here", to: "porch" });
  game.definition.sightLines.push({ from: "here", to: "porch" });
  return next;
}

const play = (game: EncounterGame, action: EncounterGame["history"][number] | never, id: string) =>
  resolveEncounterAction(
    game,
    {
      id,
      expectedRevision: game.state.revision,
      expectedSceneId: game.definition.id,
      action: action as never,
    },
    () => {
      throw new Error("A door needs no dice.");
    },
  );

describe("adding a door", () => {
  it("adds an unlocked door at a position", () => {
    const { first } = setup();

    const { scene, doorId } = addDoor(first, {
      name: "Garden gate",
      position: "here",
      locked: false,
    });

    expect(doorsHere(scene).find((door) => door.id === doorId)).toMatchObject({
      name: "Garden gate",
      locked: false,
      open: false,
      position: "here",
    });
  });

  it("makes a locked door that knows its key", () => {
    const { first, key } = setup();

    const { scene, doorId } = addDoor(first, {
      name: "Cellar door",
      position: "here",
      locked: true,
      keyId: key.id,
    });

    expect(scene.encounter!.state.barriers[doorId]).toMatchObject({ locked: true, keyId: key.id });
  });

  it("refuses a locked door with no key, so it could never be opened", () => {
    const { first } = setup();

    expect(() => addDoor(first, { name: "Cellar door", position: "here", locked: true })).toThrow(
      /needs a thing that opens it/,
    );
  });

  it("refuses a door with no name or at an unknown position, changing nothing", () => {
    const { first } = setup();
    const before = structuredClone(first);

    expect(() => addDoor(first, { name: " ", position: "here", locked: false })).toThrow(/Name/);
    expect(() => addDoor(first, { name: "Gate", position: "nowhere", locked: false })).toThrow(
      /not in this scene/,
    );
    expect(first).toEqual(before);
  });
});

describe("a door between two positions", () => {
  it("shuts the way until the player unlocks and opens it with the key", () => {
    const { first, key } = setup();
    let scene = twoPositions(first);
    const added = addDoor(scene, {
      name: "Cellar door",
      position: "here",
      locked: true,
      keyId: key.id,
    });
    scene = attachDoorToConnection(added.scene, added.doorId, "here", "porch");
    scene = placeItem(scene, key, { heldBy: "player" });
    let game = scene.encounter!;

    expect(() => play(game, { kind: "move", to: "porch" } as never, "m0")).toThrow(
      /no open route/i,
    );
    game = play(
      game,
      { kind: "interact", barrierId: added.doorId, operation: "unlock" } as never,
      "u1",
    );
    game = play(
      game,
      { kind: "interact", barrierId: added.doorId, operation: "open" } as never,
      "o1",
    );
    game = play(game, { kind: "move", to: "porch" } as never, "m1");

    expect(game.state.actors.player!.position).toBe("porch");
  });

  it("will not unlock without the key", () => {
    const { first, key } = setup();
    let scene = twoPositions(first);
    const added = addDoor(scene, {
      name: "Cellar door",
      position: "here",
      locked: true,
      keyId: key.id,
    });
    scene = attachDoorToConnection(added.scene, added.doorId, "here", "porch");
    scene = placeItem(scene, key, { position: "porch" });

    expect(() =>
      play(
        scene.encounter!,
        { kind: "interact", barrierId: added.doorId, operation: "unlock" } as never,
        "u1",
      ),
    ).toThrow(/matching key/);
  });

  it("refuses positions that are not connected and a second door on one way", () => {
    const { first } = setup();
    const scene = twoPositions(first);
    const one = addDoor(scene, { name: "One", position: "here", locked: false });
    const two = addDoor(one.scene, { name: "Two", position: "here", locked: false });
    const attached = attachDoorToConnection(two.scene, one.doorId, "here", "porch");

    expect(() => attachDoorToConnection(attached, one.doorId, "here", "nowhere")).toThrow(
      /not connected/,
    );
    expect(() => attachDoorToConnection(attached, two.doorId, "porch", "here")).toThrow(
      /already a door/,
    );
  });
});

describe("a door on a route to another scene", () => {
  function routed() {
    const { built, campaign, key, first, second } = setup();
    campaign.sceneLinks[0]!.requiresFlags = [];
    const added = addDoor(first, {
      name: "Village gate",
      position: "here",
      locked: true,
      keyId: key.id,
    });
    campaign.scenes[0] = added.scene;
    const next = attachDoorToRoute(campaign, first.id, added.doorId, campaign.sceneLinks[0]!.id);
    return { built, next, doorId: added.doorId, key, first, second };
  }

  it("shares the door with the other scene and makes the route need it open", () => {
    const { next, doorId, key, second } = routed();

    expect(next.sceneLinks[0]!.requiresOpenBarriers).toEqual([doorId]);
    for (const scene of next.scenes.slice(0, 2)) {
      expect(scene.encounter!.state.barriers[doorId]).toMatchObject({
        shared: true,
        keyId: key.id,
      });
    }
    expect(second.id).toBe(next.scenes[1]!.id);
  });

  it("is valid for the whole adventure and keeps the route shut until the door is open", () => {
    const { next, doorId, key, built } = routed();
    const withKey = {
      ...next,
      scenes: [placeItem(next.scenes[0]!, key, { heldBy: "player" }), ...next.scenes.slice(1)],
    };
    const session = startPlayableCampaign(withKey, withKey.scenes[0]!, built.places, "door-run", [
      built.realm,
    ]);
    const engine = new StateEngine(session, new EventLog());
    expect(adventureOptions(engine.getSession())).toEqual([]);

    for (const operation of ["unlock", "open"] as const) {
      const live = engine.getSession();
      engine.executeEncounterAction({
        id: `door-${operation}`,
        expectedRevision: live.encounter!.state.revision,
        expectedSceneId: live.sceneId!,
        action: { kind: "interact", barrierId: doorId, operation },
      });
    }

    expect(adventureOptions(engine.getSession()).map((option) => option.id)).toContain(
      withKey.sceneLinks[0]!.id,
    );
  });

  it("refuses a route that does not start in the scene, or a next scene that is not playable", () => {
    const { campaign, key, first } = setup();
    const added = addDoor(first, { name: "Gate", position: "here", locked: true, keyId: key.id });
    campaign.scenes[0] = added.scene;
    const back = campaign.sceneLinks.find((link) => link.fromSceneId !== first.id)!;

    expect(() => attachDoorToRoute(campaign, first.id, added.doorId, back.id)).toThrow(
      /does not start here/,
    );
    const blank = {
      ...campaign,
      scenes: [campaign.scenes[0]!, { ...campaign.scenes[1]!, encounter: undefined }],
    };
    expect(() => attachDoorToRoute(blank, first.id, added.doorId, blank.sceneLinks[0]!.id)).toThrow(
      /playable/,
    );
  });
});

describe("removing a door", () => {
  it("removes it from the way between positions and from the route and the other scene", () => {
    const { next, doorId, first } = (() => {
      const { campaign, key, first } = setup();
      const added = addDoor(first, { name: "Gate", position: "here", locked: true, keyId: key.id });
      campaign.scenes[0] = added.scene;
      return {
        next: attachDoorToRoute(campaign, first.id, added.doorId, campaign.sceneLinks[0]!.id),
        doorId: added.doorId,
        first,
      };
    })();

    const removed = removeDoor(next, first.id, doorId);

    expect(removed.sceneLinks[0]!.requiresOpenBarriers).toEqual([]);
    for (const scene of removed.scenes)
      expect(scene.encounter!.state.barriers[doorId]).toBeUndefined();
  });

  it("clears a door from a connection", () => {
    const { campaign, first } = setup();
    const scene = twoPositions(first);
    const added = addDoor(scene, { name: "Door", position: "here", locked: false });
    campaign.scenes[0] = attachDoorToConnection(added.scene, added.doorId, "here", "porch");

    const removed = removeDoor(campaign, first.id, added.doorId);

    expect(removed.scenes[0]!.encounter!.definition.connections[0]!.barrierId).toBeUndefined();
    expect(removed.scenes[0]!.encounter!.definition.sightLines[0]!.barrierId).toBeUndefined();
  });

  it("stops a thing that is a door's key from being removed", () => {
    const { first, key } = setup();
    const withKey = placeItem(first, key, { heldBy: "player" });
    const added = addDoor(withKey, { name: "Door", position: "here", locked: true, keyId: key.id });

    expect(() => removeItem(added.scene, key.id)).toThrow(/key to “Door”/);
  });
});

describe("checks for doors and keys", () => {
  const facts = (campaign: ReturnType<typeof setup>["campaign"]) =>
    new Set(adventureFacts(campaign).map((fact) => fact.id));

  it("blocks testing a locked door that nothing opens", () => {
    const { built, campaign, first } = setup();
    first.encounter!.state.barriers.stuck = {
      id: "stuck",
      name: "Stuck door",
      open: false,
      locked: true,
      blocked: false,
      position: "here",
    };
    campaign.scenes[0] = first;

    const issues = storyboardIssues(campaign, built.places, facts(campaign));

    expect(
      issues.some(
        (issue) =>
          issue.message.includes("Stuck door") && issue.message.includes("nothing opens it"),
      ),
    ).toBe(true);
  });

  it("warns when the key to a door is not in the adventure", () => {
    const { campaign, first } = setup();
    const added = addDoor(first, {
      name: "Cellar",
      position: "here",
      locked: true,
      keyId: "missing-key",
    });
    campaign.scenes[0] = added.scene;

    const warnings = storyboardWarnings(campaign, facts(campaign));

    expect(
      warnings.some(
        (w) => w.message.includes("key to “Cellar”") && w.message.includes("not in this adventure"),
      ),
    ).toBe(true);
  });

  it("warns that a route is shut when the key lies where no action can take it", () => {
    const { campaign, key, first } = setup();
    campaign.sceneLinks[0]!.requiresFlags = [];
    const placed = placeItem(first, key, { position: "here" });
    const added = addDoor(placed, { name: "Gate", position: "here", locked: true, keyId: key.id });
    campaign.scenes[0] = added.scene;
    const shut = attachDoorToRoute(campaign, first.id, added.doorId, campaign.sceneLinks[0]!.id);

    const warnings = storyboardWarnings(shut, facts(shut));

    expect(warnings.some((w) => w.message.includes("cannot get the key"))).toBe(true);
    expect(warnings.some((w) => w.message.includes("cannot reach"))).toBe(true);
  });

  it("accepts the same route once the key can be picked up", () => {
    const { campaign, key, first } = setup();
    campaign.sceneLinks[0]!.requiresFlags = [];
    const placed = addPickUp(placeItem(first, key, { position: "here" }), key.id);
    const added = addDoor(placed, { name: "Gate", position: "here", locked: true, keyId: key.id });
    campaign.scenes[0] = added.scene;
    const open = attachDoorToRoute(campaign, first.id, added.doorId, campaign.sceneLinks[0]!.id);

    const warnings = storyboardWarnings(open, facts(open));

    expect(warnings.some((w) => w.message.includes("cannot get the key"))).toBe(false);
    expect(warnings.some((w) => w.message.includes("cannot reach"))).toBe(false);
  });

  it("accepts a key the player carries from the start", () => {
    const { campaign, key, first } = setup();
    campaign.sceneLinks[0]!.requiresFlags = [];
    const carried = placeItem(first, key, { heldBy: "player" });
    const added = addDoor(carried, { name: "Gate", position: "here", locked: true, keyId: key.id });
    campaign.scenes[0] = added.scene;
    const open = attachDoorToRoute(campaign, first.id, added.doorId, campaign.sceneLinks[0]!.id);

    expect(storyboardWarnings(open, facts(open)).some((w) => w.message.includes("key"))).toBe(
      false,
    );
  });
});
