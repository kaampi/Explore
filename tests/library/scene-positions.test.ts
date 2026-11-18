import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import {
  COVER_LEVELS,
  POSITION_DISTANCES,
  addDoor,
  addPosition,
  attachDoorToConnection,
  connectPositions,
  disconnectPositions,
  placeItem,
  reachablePositions,
  removePosition,
  renamePosition,
  setPersonPosition,
  setPositionDetail,
  setSight,
} from "../../src/library/sceneParts";
import { distance } from "../../src/game/geometry";
import { storyboardWarnings } from "../../src/ui/studio/storyboardReadiness";
import { adventureFacts } from "../../src/library/playableCampaign";
import { validateEncounter, resolveEncounterAction } from "../../src/game/EncounterEngine";

function setup() {
  const built = connectedAdventureExample();
  return { built, scene: structuredClone(built.campaign.scenes[0]!), key: built.objects[0]! };
}

describe("adding a position", () => {
  it("joins it to the one it is next to, by way and by sight", () => {
    const { scene } = setup();

    const { scene: next, positionId } = addPosition(scene, {
      name: "Porch",
      from: "here",
      distance: "away",
    });

    const game = next.encounter!;
    expect(game.definition.places.map((p) => p.name)).toContain("Porch");
    expect(game.definition.connections).toContainEqual({ from: "here", to: positionId });
    expect(game.definition.sightLines).toContainEqual({ from: "here", to: positionId });
  });

  it("puts it the chosen distance away", () => {
    const { scene } = setup();
    for (const [key, metres] of Object.entries(POSITION_DISTANCES)) {
      const { scene: next, positionId } = addPosition(
        scene,
        { name: `P-${key}`, from: "here", distance: key as keyof typeof POSITION_DISTANCES },
        `id-${key}`,
      );
      expect(distance(next.encounter!.definition, "here", positionId)).toBeCloseTo(metres, 0);
    }
  });

  it("does not stack new positions on top of each other", () => {
    let { scene } = setup();
    for (const name of ["A", "B", "C"]) {
      scene = addPosition(scene, { name, from: "here", distance: "close" }).scene;
    }

    const spots = scene.encounter!.definition.places.map((p) => `${p.x},${p.y}`);
    expect(new Set(spots).size).toBe(spots.length);
  });

  it("needs a name that is not already used, and a position to be next to", () => {
    const { scene } = setup();
    const once = addPosition(scene, { name: "Porch", from: "here", distance: "close" }).scene;

    expect(() => addPosition(once, { name: " ", from: "here", distance: "close" })).toThrow(/Name/);
    expect(() => addPosition(once, { name: "porch", from: "here", distance: "close" })).toThrow(
      /already a position/,
    );
    expect(() => addPosition(once, { name: "Hall", from: "nowhere", distance: "close" })).toThrow(
      /not in this scene/,
    );
  });
});

describe("changing positions", () => {
  function withPorch() {
    const { scene, key, built } = setup();
    const added = addPosition(scene, { name: "Porch", from: "here", distance: "close" });
    return { scene: added.scene, porch: added.positionId, key, built };
  }

  it("renames a position, but not to a name already in use", () => {
    const { scene, porch } = withPorch();

    expect(
      renamePosition(scene, porch, "Veranda").encounter!.definition.places.some(
        (p) => p.name === "Veranda",
      ),
    ).toBe(true);
    expect(() => renamePosition(scene, porch, scene.encounter!.definition.places[0]!.name)).toThrow(
      /already a position/,
    );
  });

  it("sets cover and height", () => {
    const { scene, porch } = withPorch();

    const next = setPositionDetail(scene, porch, { cover: "good", elevation: 3 });

    const place = next.encounter!.definition.places.find((p) => p.id === porch)!;
    expect(place).toMatchObject({ cover: COVER_LEVELS.good, elevation: 3 });
    expect(() => setPositionDetail(scene, porch, { elevation: Number.NaN })).toThrow(/metres/);
  });

  it("removes a position with nothing on it and its ways", () => {
    const { scene, porch } = withPorch();

    const next = removePosition(scene, porch);

    expect(next.encounter!.definition.places.map((p) => p.id)).not.toContain(porch);
    expect(next.encounter!.definition.connections).toEqual([]);
    expect(next.encounter!.definition.sightLines).toEqual([]);
  });

  it("refuses to remove a position something is at, and says what", () => {
    const { scene, porch, key } = withPorch();
    const withThing = placeItem(scene, key, { position: porch });

    const withPorchHere = scene;
    expect(() => removePosition(withThing, porch)).toThrow(/lies there/);
    expect(() => removePosition(withPorchHere, "here")).toThrow(/is there/);
  });

  it("refuses to remove a position a door or an action is tied to", () => {
    const { scene, porch } = withPorch();
    const door = addDoor(scene, { name: "Porch door", position: porch, locked: false });
    expect(() => removePosition(door.scene, porch)).toThrow(/Porch door/);
    const acting = structuredClone(scene);
    acting.encounter!.definition.interactions[0]!.position = porch;
    expect(() => removePosition(acting, porch)).toThrow(/happens there/);
  });

  it("will not remove the only position", () => {
    const { scene } = setup();

    expect(() => removePosition(scene, "here")).toThrow(/at least one position/);
  });

  it("connects and disconnects, with the view across", () => {
    const { scene, porch } = withPorch();
    const hall = addPosition(scene, { name: "Hall", from: "here", distance: "close" });
    const joined = connectPositions(hall.scene, porch, hall.positionId);

    expect(joined.encounter!.definition.connections).toContainEqual({
      from: porch,
      to: hall.positionId,
    });
    expect(() => connectPositions(joined, hall.positionId, porch)).toThrow(/already connected/);
    expect(() => connectPositions(joined, porch, porch)).toThrow(/two different/);
    const apart = disconnectPositions(joined, porch, hall.positionId);
    expect(
      apart.encounter!.definition.sightLines.some(
        (s) => s.from === porch && s.to === hall.positionId,
      ),
    ).toBe(false);
    expect(() => disconnectPositions(apart, porch, hall.positionId)).toThrow(/not connected/);
  });

  it("lets the player see across without a way, and refuses to hide a view that has a way", () => {
    const { scene, porch } = withPorch();
    const wall = addPosition(scene, { name: "Wall", from: "here", distance: "close" });
    const seen = setSight(wall.scene, porch, wall.positionId, true);

    expect(
      seen.encounter!.definition.sightLines.some(
        (s) => s.from === porch && s.to === wall.positionId,
      ),
    ).toBe(true);
    expect(
      seen.encounter!.definition.connections.some(
        (c) => c.from === porch && c.to === wall.positionId,
      ),
    ).toBe(false);
    expect(() => setSight(seen, "here", porch, false)).toThrow(/connected/);
    expect(
      setSight(seen, porch, wall.positionId, false).encounter!.definition.sightLines.some(
        (s) => s.from === porch && s.to === wall.positionId,
      ),
    ).toBe(false);
  });

  it("lets the player walk between positions in the engine", () => {
    const { scene, porch } = withPorch();
    const game = scene.encounter!;

    const next = resolveEncounterAction(game, {
      id: "walk",
      expectedRevision: game.state.revision,
      expectedSceneId: game.definition.id,
      action: { kind: "move", to: porch },
    });

    expect(next.state.actors.player!.position).toBe(porch);
  });

  it("lets a door on a connection decide whether the player can walk", () => {
    const { scene, porch } = withPorch();
    const door = addDoor(scene, { name: "Porch door", position: "here", locked: false });
    const attached = attachDoorToConnection(door.scene, door.doorId, "here", porch);
    const game = attached.encounter!;

    expect(() =>
      resolveEncounterAction(game, {
        id: "walk",
        expectedRevision: 0,
        expectedSceneId: game.definition.id,
        action: { kind: "move", to: porch },
      }),
    ).toThrow(/no open route/i);
  });
});

describe("reaching every position", () => {
  it("lists the positions the player can walk to", () => {
    const { scene } = setup();
    const a = addPosition(scene, { name: "A", from: "here", distance: "close" });
    const b = addPosition(a.scene, { name: "B", from: a.positionId, distance: "close" });

    expect([...reachablePositions(b.scene)].sort()).toEqual(
      ["here", a.positionId, b.positionId].sort(),
    );
  });

  it("warns about a position nothing leads to", () => {
    const { built, scene } = setup();
    const a = addPosition(scene, { name: "A", from: "here", distance: "close" });
    const lonely = disconnectPositions(a.scene, "here", a.positionId);
    const campaign = { ...built.campaign, scenes: [lonely, ...built.campaign.scenes.slice(1)] };

    const warnings = storyboardWarnings(
      campaign,
      new Set(adventureFacts(campaign).map((fact) => fact.id)),
    );

    expect(
      warnings.some((w) => w.message.includes("“A”") && w.message.includes("cannot be reached")),
    ).toBe(true);
  });
});

describe("any sequence of position changes", () => {
  it("either gives a valid scene or throws and changes nothing", () => {
    const { scene: start } = setup();
    const operation = fc.oneof(
      fc.record({
        kind: fc.constant("add" as const),
        name: fc.constantFrom("A", "B", "C", "a"),
        at: fc.nat(4),
      }),
      fc.record({ kind: fc.constant("remove" as const), at: fc.nat(4) }),
      fc.record({ kind: fc.constant("connect" as const), a: fc.nat(4), b: fc.nat(4) }),
      fc.record({ kind: fc.constant("disconnect" as const), a: fc.nat(4), b: fc.nat(4) }),
      fc.record({
        kind: fc.constant("sight" as const),
        a: fc.nat(4),
        b: fc.nat(4),
        on: fc.boolean(),
      }),
    );
    fc.assert(
      fc.property(fc.array(operation, { maxLength: 14 }), (steps) => {
        let scene = start;
        for (const step of steps) {
          const before = structuredClone(scene);
          const ids = scene.encounter!.definition.places.map((p) => p.id);
          const pick = (i: number) => ids[i % ids.length]!;
          try {
            if (step.kind === "add")
              scene = addPosition(scene, {
                name: step.name,
                from: pick(step.at),
                distance: "close",
              }).scene;
            else if (step.kind === "remove") scene = removePosition(scene, pick(step.at));
            else if (step.kind === "connect")
              scene = connectPositions(scene, pick(step.a), pick(step.b));
            else if (step.kind === "disconnect")
              scene = disconnectPositions(scene, pick(step.a), pick(step.b));
            else scene = setSight(scene, pick(step.a), pick(step.b), step.on);
          } catch {
            expect(scene).toEqual(before);
          }
          expect(() => validateEncounter(scene.encounter!)).not.toThrow();
        }
      }),
      { numRuns: 60 },
    );
  });
});

describe("where a person stands", () => {
  it("can be set to any position in the scene", () => {
    const { scene } = setup();
    const added = addPosition(scene, { name: "Porch", from: "here", distance: "close" });
    const edda = Object.values(added.scene.encounter!.state.actors).find((a) => a.name === "Edda")!;

    const next = setPersonPosition(added.scene, edda.id.slice(4), added.positionId);

    expect(next.encounter!.state.actors[edda.id]!.position).toBe(added.positionId);
    expect(() => setPersonPosition(added.scene, edda.id.slice(4), "nowhere")).toThrow(
      /not in this scene/,
    );
    expect(() => setPersonPosition(added.scene, "nobody", "here")).toThrow(/not in this scene/);
  });
});
