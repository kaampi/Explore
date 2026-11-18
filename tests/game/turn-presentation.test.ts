import { expect, it } from "vitest";
import { loadingBayGame } from "../../src/scenarios/loadingBay";
import { resolveEncounterAction } from "../../src/game/EncounterEngine";
import { EncounterGameSchema } from "../../src/game/EncounterSchema";
it("journals distinct, detached snapshots in the actual initiative order", () => {
  const before = loadingBayGame();
  before.state.actors.courier!.position = "cargo";
  before.state.barriers.shutter!.open = true;
  before.state.barriers.shutter!.locked = false;
  const values = [0.8, 0.1, 0.9, 0.95, 0.99, 0.34];
  let i = 0;
  const game = resolveEncounterAction(
      before,
      {
        id: "attack",
        expectedRevision: 0,
        action: { kind: "attack", targetId: "drone", weaponId: "pulse-pistol" },
      },
      () => values[i++] ?? 0.99,
    ),
    beats = game.history[0]!.presentation!;
  expect(beats.map((beat) => beat.actorId)).toEqual(["officer", "courier"]);
  expect(beats.map((beat) => beat.check?.roll)).toEqual([100, 35]);
  expect(beats[0]!.actors.drone!.hp).toBe(10);
  expect(beats[1]!.actors.drone!.hp).toBeLessThan(10);
  const copy = EncounterGameSchema.parse(JSON.parse(JSON.stringify(game)));
  expect(copy.history[0]!.presentation).toEqual(beats);
  copy.state.actors.drone!.hp = 0;
  expect(copy.history[0]!.presentation![0]!.actors.drone!.hp).toBe(10);
  expect(before.state.actors.drone!.hp).toBe(10);
});
