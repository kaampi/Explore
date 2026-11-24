import { describe, expect, expectTypeOf, it } from "vitest";
import {
  checkMentions,
  checkPatch,
  type Finding,
  type FindingParams,
  type Fix,
} from "../../src/game/authoringChecks";
import { applyPatch, type AuthoringPatch } from "../../src/library/authoringPatch";
import { placeNewScenes, type PlacedCard } from "../../src/ui/studio/storyboardArrange";
import { goBy, sketchAdventure, startRun, where } from "../fixtures/authoring-sketch";

describe("one discovery per action (8)", () => {
  it("is refused when an action gives two discoveries with a sentence each", () => {
    const { campaign, library, hall } = sketchAdventure();
    const patch: AuthoringPatch = {
      ops: [
        {
          op: "addAction",
          sceneId: hall,
          label: "Read the plaque",
          outcome: "It says much.",
          gives: [
            { fact: "founder", learned: "The founder was a smith." },
            { fact: "date", learned: "It was built in spring." },
          ],
        },
      ],
    };
    expect(() => applyPatch(campaign, library, patch)).toThrow(/only one discovery/);
    expect(checkPatch(campaign, library, patch)).toMatchObject([
      { kind: "oneDiscoveryPerAction", params: { action: "Read the plaque" }, opIndex: 0 },
    ]);
    // Two discoveries are fine when only one has a sentence, and two actions are fine.
    const ok: AuthoringPatch = {
      ops: [
        {
          op: "addAction",
          sceneId: hall,
          label: "Read the plaque",
          outcome: "It says much.",
          gives: [{ fact: "founder", learned: "The founder was a smith." }, { fact: "date" }],
        },
      ],
    };
    expect(() => applyPatch(campaign, library, ok)).not.toThrow();
    const split: AuthoringPatch = {
      ops: [
        {
          op: "addAction",
          sceneId: hall,
          label: "Read the name",
          outcome: "A smith.",
          gives: [{ fact: "founder", learned: "The founder was a smith." }],
        },
        {
          op: "addAction",
          sceneId: hall,
          label: "Read the date",
          outcome: "Spring.",
          gives: [{ fact: "date", learned: "It was built in spring." }],
        },
      ],
    };
    expect(checkPatch(campaign, library, split).map((finding) => finding.kind)).toEqual([
      "unusedFact",
      "unusedFact",
    ]);
  });
});

describe("typed findings and fixes (9, 10)", () => {
  it("gives each kind its own parameters, and fixes that say what they do", () => {
    const { campaign, library, tower, crypt } = sketchAdventure();
    const [finding] = checkPatch(campaign, library, {
      ops: [{ op: "addLink", from: tower, to: crypt, label: "The hatch" }],
    });
    if (finding?.kind !== "bypassesLock") throw new Error("expected a shortcut");
    expectTypeOf(finding.params).toEqualTypeOf<FindingParams["bypassesLock"]>();
    expectTypeOf(finding.params.locks).toEqualTypeOf<string[]>();
    const [replace, none] = finding.fixes;
    expect(replace).toMatchObject({ key: "requireLockToo", apply: "replace" });
    expect(none).toMatchObject({ key: "shortcutOnPurpose", apply: "none" });
    expect(none).not.toHaveProperty("patch");
    // A fix that adds operations says so.
    const [mention] = checkMentions(campaign, library, tower, "A key.", [
      { name: "Key", kind: "item" },
    ]);
    const add = mention!.fixes[0] as Fix;
    expect(add).toMatchObject({ key: "addAsItem", apply: "append" });
    if (add.key === "addAsItem") expectTypeOf(add.ops).toBeArray();
  });

  it("holds only words the author knows: names, labels and discovery texts, no ids", () => {
    const { campaign, library, tower, hall, crypt } = sketchAdventure();
    const findings: Finding[] = [
      ...checkPatch(campaign, library, {
        ops: [{ op: "addLink", from: tower, to: crypt, label: "The hatch" }],
      }),
      ...checkPatch(campaign, library, {
        ops: [
          { op: "addScene", tempId: "new:vault", name: "Vault", placeId: "p-cellar", arrival: "." },
          {
            op: "addLink",
            from: hall,
            to: "new:vault",
            label: "Vault door",
            requires: [{ kind: "fact", fact: "knows-the-word" }],
          },
          {
            op: "addAction",
            sceneId: tower,
            label: "Ask",
            outcome: ".",
            requires: [
              { kind: "item", itemId: library.objects[0]!.id },
              { kind: "fact", fact: "knows-the-word" },
            ],
            gives: [{ fact: "asked", learned: "You asked the guard." }],
          },
        ],
      }),
      ...checkMentions(campaign, library, hall, ".", [
        { name: "Lantern", kind: "item" },
        { name: "Watchtower", kind: "place" },
      ]),
    ];
    expect(findings.length).toBeGreaterThan(3);
    const words = (value: unknown): string[] =>
      typeof value === "string"
        ? [value]
        : Array.isArray(value)
          ? value.flatMap(words)
          : value && typeof value === "object"
            ? Object.values(value).flatMap(words)
            : [];
    for (const finding of findings)
      for (const text of [
        ...words(finding.params),
        ...finding.fixes.flatMap((fix) => words(fix.params)),
      ]) {
        expect(text).not.toMatch(
          /adv:|:link:|:scene:|:item:|:action:|new:|p-(tower|hall|crypt|cellar)/,
        );
      }
  });
});

describe("what counts as a lock and as a way round it (11, 12)", () => {
  /** The sketch with a vault the tower reaches only while the alarm has not gone. */
  function withVault() {
    const base = sketchAdventure();
    const patch: AuthoringPatch = {
      ops: [
        {
          op: "addScene",
          tempId: "new:vault",
          name: "Vault",
          placeId: "p-cellar",
          arrival: "Gold.",
        },
        {
          op: "addAction",
          sceneId: base.tower,
          label: "Ring the alarm",
          outcome: "Bells.",
          gives: [{ fact: "alarm", learned: "The alarm has gone." }],
        },
        {
          op: "addLink",
          from: base.tower,
          to: "new:vault",
          label: "Slip in",
          requires: [{ kind: "noFact", fact: "alarm" }],
        },
        { op: "addLink", from: "new:vault", to: base.tower, label: "Slip out" },
        {
          op: "addScene",
          tempId: "new:ossuary",
          name: "Ossuary",
          placeId: "p-cellar",
          arrival: "Bones.",
        },
        { op: "addLink", from: base.crypt, to: "new:ossuary", label: "Deeper" },
        { op: "addLink", from: "new:ossuary", to: base.crypt, label: "Shallower" },
      ],
    };
    const made = applyPatch(base.campaign, base.library, patch);
    const vault = made.newSceneIds[0]!;
    const ossuary = made.newSceneIds[1]!;
    return {
      ...base,
      campaign: made.campaign,
      library: { ...base.library, objects: made.library.objects },
      vault,
      ossuary,
    };
  }

  it("counts a route past 'the alarm has not gone' as a route past a lock", () => {
    const { campaign, library, hall, vault } = withVault();
    expect(checkPatch(campaign, library, { ops: [] })).toEqual([]);
    const patch: AuthoringPatch = {
      ops: [{ op: "addLink", from: hall, to: vault, label: "Skylight" }],
    };
    const [finding] = checkPatch(campaign, library, patch);
    expect(finding).toMatchObject({
      kind: "bypassesLock",
      params: { locks: [], notYet: ["The alarm has gone."] },
    });
    expect(finding!.message).toContain("“The alarm has gone.” has not happened");
    const fix = finding!.fixes[0]!;
    if (fix.apply !== "replace") throw new Error("expected a replacement");
    expect(checkPatch(campaign, library, fix.patch)).toEqual([]);
    // The same condition kept on the new route is no way round it.
    const kept = applyPatch(campaign, library, fix.patch);
    const run = startRun(kept.campaign, library);
    goBy(run, kept.campaign, "Down the stairs");
    goBy(run, kept.campaign, "Skylight");
    expect(where(run)).toBe("Vault");
  });

  it("does not warn about a way back from a room that can only be reached through the lock", () => {
    const { campaign, library, crypt, ossuary } = withVault();
    const back: AuthoringPatch = {
      ops: [{ op: "addLink", from: ossuary, to: crypt, label: "Back door" }],
    };
    expect(checkPatch(campaign, library, back)).toEqual([]);
  });
});

describe("what counts as an ending (13)", () => {
  it("needs every discovery the goal asks for to be possible, and one of them to be set there", () => {
    const { campaign, library, hall } = sketchAdventure();
    const goal = { title: "Escape", requiresFlags: ["escaped", "alarm-silenced"] };
    const room: AuthoringPatch["ops"] = [
      { op: "addScene", tempId: "new:cell", name: "Cell", placeId: "p-cellar", arrival: "Bars." },
      { op: "addLink", from: hall, to: "new:cell", label: "To the cell" },
      {
        op: "addAction",
        sceneId: "new:cell",
        label: "Slip out",
        outcome: "Free.",
        gives: [{ fact: "escaped" }],
      },
    ];
    const withGoal = { ...campaign, goal };
    // One of two is not enough, even though it is set in the scene.
    expect(checkPatch(withGoal, library, { ops: room }).map((f) => f.kind)).toEqual(["deadEnd"]);
    // When the other can be made somewhere, the scene is an ending.
    const both: AuthoringPatch = {
      ops: [
        ...room,
        {
          op: "addAction",
          sceneId: hall,
          label: "Silence the bell",
          outcome: "Quiet.",
          gives: [{ fact: "alarm-silenced" }],
        },
      ],
    };
    expect(checkPatch(withGoal, library, both)).toEqual([]);
    // And a scene that sets neither is not one.
    const neither: AuthoringPatch = {
      ops: [
        room[0]!,
        room[1]!,
        {
          op: "addAction",
          sceneId: hall,
          label: "Silence the bell",
          outcome: "Quiet.",
          gives: [{ fact: "alarm-silenced" }],
        },
        {
          op: "addAction",
          sceneId: hall,
          label: "Wave",
          outcome: "Hello.",
          gives: [{ fact: "escaped" }],
        },
      ],
    };
    expect(checkPatch(withGoal, library, neither).map((f) => f.kind)).toEqual(["deadEnd"]);
  });
});

describe("placeNewScenes when the sides are full (14)", () => {
  const card = (id: string, x: number, y: number): PlacedCard => ({
    id,
    pos: { x, y },
    width: 200,
    height: 124,
  });

  it("goes on to a new column, and the place it finds is free", () => {
    // The anchor, and a wall of cards on both sides, taller than the search reaches.
    const cards: PlacedCard[] = [card("a", 600, 0)];
    for (let i = -210; i <= 210; i++) {
      cards.push(card(`r${i}`, 920, i * 180), card(`l${i}`, 280 - 200 + 0, i * 180));
    }
    cards.push(card("below", 600, 164));
    const placed = placeNewScenes(cards, "a", ["n1", "n2"]);
    const all = [
      ...cards,
      ...[...placed].map(([id, pos]) => ({ id, pos, width: 200, height: 124 })),
    ];
    for (const id of ["n1", "n2"]) {
      const spot = placed.get(id)!;
      expect(Math.abs(spot.x % 20)).toBe(0);
      expect(Math.abs(spot.y % 20)).toBe(0);
      const mine = all.find((c) => c.id === id)!;
      for (const other of all.filter((c) => c.id !== id))
        expect(
          mine.pos.x < other.pos.x + other.width &&
            mine.pos.x + mine.width > other.pos.x &&
            mine.pos.y < other.pos.y + other.height &&
            mine.pos.y + mine.height > other.pos.y,
        ).toBe(false);
    }
    // Beyond the last card there was.
    expect(placed.get("n1")!.x).toBeGreaterThanOrEqual(920 + 200);
  });
});
