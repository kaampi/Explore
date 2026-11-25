import { describe, expect, it } from "vitest";
import { newPlaceTemplate } from "../../src/library/LibrarySchema";
import { checkPatch, type Finding } from "../../src/game/authoringChecks";
import { applyPatch, itemPlaces, type AuthoringPatch } from "../../src/library/authoringPatch";
import {
  actByLabel,
  goBy,
  mappedAdventure,
  openTheDoor,
  sketchAdventure,
  startRun,
  where,
} from "../fixtures/authoring-sketch";

/** A proposal the author approves must be one that starts and plays: these test it with the engine. */

const replacement = (finding: Finding | undefined, key: string): AuthoringPatch => {
  const fix = finding?.fixes.find((item) => item.key === key);
  if (!fix || fix.apply !== "replace") throw new Error(`No replacing fix “${key}”.`);
  return fix.patch;
};

describe("a new scene (1–3)", () => {
  const cellar = (placeId?: string): AuthoringPatch["ops"] => [
    {
      op: "addScene",
      tempId: "new:cellar",
      name: "Cellar",
      ...(placeId ? { placeId } : {}),
      arrival: "Damp steps lead down.",
    },
  ];
  const ways = (hall: string): AuthoringPatch["ops"] => [
    { op: "addLink", from: hall, to: "new:cellar", label: "Down to the cellar" },
    { op: "addLink", from: "new:cellar", to: hall, label: "Up to the hall" },
  ];

  it("starts and plays, there and back, when it has a place", () => {
    const { campaign, library, hall } = sketchAdventure();
    const patch = { ops: [...cellar("p-cellar"), ...ways(hall)] };
    expect(checkPatch(campaign, library, patch)).toEqual([]);
    const after = applyPatch(campaign, library, patch);
    const run = startRun(after.campaign, library);
    goBy(run, after.campaign, "Down the stairs");
    goBy(run, after.campaign, "Down to the cellar");
    expect(where(run)).toBe("Cellar");
    goBy(run, after.campaign, "Up to the hall");
    expect(where(run)).toBe("Guildhall");
  });

  it("asks for a place when it has none, and offers the place of the scene it grows from", () => {
    const { campaign, library, hall } = sketchAdventure();
    const patch = { ops: [...cellar(), ...ways(hall)] };
    const findings = checkPatch(campaign, library, patch);
    expect(findings.map((finding) => finding.kind)).toEqual(["needsPlace"]);
    expect(findings[0]).toMatchObject({
      params: { name: "Cellar", map: "no" },
      fixes: [{ key: "usePlaceOf", params: { scene: "Guildhall" }, apply: "replace" }],
    });
    // applyPatch itself never makes a place up.
    expect(applyPatch(campaign, library, patch).campaign.scenes.at(-1)!.placeId).toBe("");
    const fixed = replacement(findings[0], "usePlaceOf");
    expect(checkPatch(campaign, library, fixed)).toEqual([]);
    const after = applyPatch(campaign, library, fixed);
    const run = startRun(after.campaign, library);
    goBy(run, after.campaign, "Down the stairs");
    goBy(run, after.campaign, "Down to the cellar");
    expect(where(run)).toBe("Cellar");
  });

  it("says when the adventure cannot be started, and not for what was already wrong", () => {
    const { campaign, library, hall } = sketchAdventure();
    // A place that is not in the library is a place to ask for, not a start that fails.
    const missing = checkPatch(campaign, library, {
      ops: [...cellar("no-such-place"), ...ways(hall)],
    });
    expect(missing.map((finding) => finding.kind)).toEqual(["needsPlace"]);
    // What was wrong before the patch is not blamed on it.
    const noPlaces = { ...library, places: [] };
    expect(checkPatch(campaign, noPlaces, { ops: [] })).toEqual([]);
    expect(
      checkPatch(campaign, noPlaces, { ops: [...cellar("p-cellar"), ...ways(hall)] }).map(
        (finding) => finding.kind,
      ),
    ).toEqual(["needsPlace"]);
  });

  it("asks for a place when a map adventure gets a scene at a place that is not on the map", () => {
    const { campaign, library } = mappedAdventure();
    const stray = newPlaceTemplate({ id: "stray", name: "Off the map", note: "Nowhere." });
    const square = campaign.scenes[0]!;
    const findings = checkPatch(
      campaign,
      { ...library, places: [...library.places!, stray] },
      {
        ops: [
          { op: "addScene", tempId: "new:far", name: "Far away", placeId: "stray", arrival: "." },
          { op: "addLink", from: square.id, to: "new:far", label: "Far" },
          { op: "addLink", from: "new:far", to: square.id, label: "Home" },
        ],
      },
    );
    expect(findings).toMatchObject([{ kind: "needsPlace", params: { map: "yes" } }]);
  });

  it("cannot be started when a map scene is given an empty arrival text", () => {
    const { campaign, library } = mappedAdventure();
    const findings = checkPatch(campaign, library, {
      ops: [
        { op: "setText", target: { sceneId: campaign.scenes[0]!.id, field: "arrival" }, text: "" },
      ],
    });
    expect(findings).toMatchObject([
      { kind: "cannotStart", params: { why: "noArrival", scene: campaign.scenes[0]!.name } },
    ]);
  });

  it("is bound to a map: the new scene gets the node of the scene it grows from", () => {
    const { campaign, library, realm } = mappedAdventure();
    const square = campaign.scenes[0]!;
    const patch: AuthoringPatch = {
      ops: [
        { op: "addScene", tempId: "new:cellar", name: "Cellar", arrival: "Damp steps." },
        { op: "addLink", from: square.id, to: "new:cellar", label: "Down" },
        { op: "addLink", from: "new:cellar", to: square.id, label: "Up" },
      ],
    };
    const findings = checkPatch(campaign, library, patch);
    expect(findings[0]).toMatchObject({ kind: "needsPlace", params: { map: "yes" } });
    const fixed = replacement(findings[0], "usePlaceOf");
    expect(checkPatch(campaign, library, fixed)).toEqual([]);
    const after = applyPatch(campaign, library, fixed);
    expect(after.campaign.scenes.at(-1)).toMatchObject({
      placeId: square.placeId,
      mapNodeId: square.mapNodeId,
    });
    const run = startRun(after.campaign, library, [realm]);
    goBy(run, after.campaign, "Down");
    expect(where(run)).toBe("Cellar");
    goBy(run, after.campaign, "Up");
    expect(where(run)).toBe(square.name);
  });

  it("refuses a route from a scene to itself, and keeps it out of the proposal", () => {
    const { campaign, library, hall } = sketchAdventure();
    const patch: AuthoringPatch = {
      ops: [
        ...cellar("p-cellar"),
        { op: "addLink", from: hall, to: hall, label: "Round and round" },
        ...ways(hall),
      ],
    };
    expect(() => applyPatch(campaign, library, patch)).toThrow(/itself/);
    const findings = checkPatch(campaign, library, patch);
    expect(findings).toMatchObject([
      { kind: "selfLink", params: { name: "Round and round" }, opIndex: 1 },
    ]);
  });
});

describe("things between the scenes (4)", () => {
  it("is fetched in the hall and used in the tower: it is not put in the tower", () => {
    const { campaign, library, tower, hall, crypt, seal } = sketchAdventure();
    const patch: AuthoringPatch = {
      ops: [
        { op: "addLink", from: hall, to: tower, label: "Back to the tower" },
        {
          op: "addLink",
          from: tower,
          to: crypt,
          label: "The hatch",
          lockName: "The hatch is sealed",
          requires: [{ kind: "item", itemId: seal }],
        },
      ],
    };
    expect(checkPatch(campaign, library, patch)).toEqual([]);
    const after = applyPatch(campaign, library, patch);
    expect(itemPlaces(after.campaign, seal)).toEqual({ placedIn: [hall], carried: false });
    const towerGame = after.campaign.scenes.find((scene) => scene.id === tower)!.encounter!;
    expect(towerGame.state.itemLocations[seal]).toBeUndefined();
    expect(towerGame.definition.items.some((item) => item.id === seal)).toBe(true);

    const run = startRun(after.campaign, library);
    goBy(run, after.campaign, "Down the stairs");
    actByLabel(run, "Take the seal");
    goBy(run, after.campaign, "Back to the tower");
    openTheDoor(run, "The hatch is sealed");
    goBy(run, after.campaign, "The hatch");
    expect(where(run)).toBe("Crypt");
  });

  it("is fetched in the hall and asked for by an action in the tower", () => {
    const { campaign, library, tower, hall, seal } = sketchAdventure();
    const patch: AuthoringPatch = {
      ops: [
        { op: "addLink", from: hall, to: tower, label: "Back to the tower" },
        {
          op: "addAction",
          sceneId: tower,
          label: "Show the seal to the guard",
          outcome: "The guard salutes.",
          requires: [{ kind: "item", itemId: seal }],
          gives: [{ fact: "saluted", learned: "The guard knows you." }],
        },
        {
          op: "addAction",
          sceneId: tower,
          label: "Walk in as a friend",
          outcome: "Doors open.",
          requires: [{ kind: "fact", fact: "saluted" }],
        },
      ],
    };
    expect(checkPatch(campaign, library, patch)).toEqual([]);
    const after = applyPatch(campaign, library, patch);
    expect(itemPlaces(after.campaign, seal).placedIn).toEqual([hall]);
    const run = startRun(after.campaign, library);
    goBy(run, after.campaign, "Down the stairs");
    actByLabel(run, "Take the seal");
    goBy(run, after.campaign, "Back to the tower");
    actByLabel(run, "Show the seal to the guard");
    actByLabel(run, "Walk in as a friend");
    expect(run.getSession().encounter!.state.flags).toContain("saluted");
  });

  it("is fetched in the tower and used in the hall, and cannot be given from the hall", () => {
    const { campaign, library, tower, hall } = sketchAdventure();
    const patch: AuthoringPatch = {
      ops: [
        { op: "addItem", tempId: "new:lamp", name: "Lamp", description: "Oil.", inSceneId: tower },
        {
          op: "addAction",
          sceneId: tower,
          label: "Take the lamp",
          outcome: "You take the lamp.",
          gives: [{ itemTempId: "new:lamp" }],
        },
        {
          op: "addScene",
          tempId: "new:attic",
          name: "Attic",
          placeId: "p-cellar",
          arrival: "Dark rafters.",
        },
        {
          op: "addLink",
          from: hall,
          to: "new:attic",
          label: "Up the ladder",
          lockName: "Needs a lamp",
          requires: [{ kind: "item", itemId: "new:lamp" }],
        },
        { op: "addLink", from: "new:attic", to: hall, label: "Down again" },
      ],
    };
    expect(checkPatch(campaign, library, patch)).toEqual([]);
    const after = applyPatch(campaign, library, patch);
    const lamp = after.library.objects.find((object) => object.name === "Lamp")!.id;
    expect(itemPlaces(after.campaign, lamp)).toEqual({ placedIn: [tower], carried: false });

    const run = startRun(after.campaign, library);
    actByLabel(run, "Take the lamp");
    goBy(run, after.campaign, "Down the stairs");
    openTheDoor(run, "Needs a lamp");
    goBy(run, after.campaign, "Up the ladder");
    expect(where(run)).toBe("Attic");

    // The lamp lies in the tower, so the hall cannot hand it out too.
    const again = checkPatch(
      after.campaign,
      { ...library, objects: after.library.objects },
      {
        ops: [
          {
            op: "addAction",
            sceneId: hall,
            label: "Grab the lamp",
            outcome: "You grab a lamp.",
            gives: [{ itemId: lamp }],
          },
        ],
      },
    );
    expect(again).toMatchObject([
      {
        kind: "cannotReceive",
        params: {
          action: "Grab the lamp",
          thing: "Lamp",
          why: "elsewhere",
          scenes: ["Watchtower"],
        },
      },
    ]);
  });

  it("puts a thing that lies nowhere in the scene that gives it", () => {
    const { campaign, library, tower } = sketchAdventure();
    const shelved = applyPatch(campaign, library, {
      ops: [
        { op: "addItem", tempId: "new:rope", name: "Rope", description: ".", inSceneId: tower },
      ],
    });
    // Take it off the floor, as if it were only in the library.
    const rope = shelved.library.objects.find((object) => object.name === "Rope")!.id;
    const bare = structuredClone(shelved.campaign);
    delete bare.scenes.find((scene) => scene.id === tower)!.encounter!.state.itemLocations[rope];
    expect(itemPlaces(bare, rope).placedIn).toEqual([]);
    const gives = applyPatch(bare, shelved.library, {
      ops: [
        {
          op: "addAction",
          sceneId: tower,
          label: "Find the rope",
          outcome: "A rope.",
          gives: [{ itemId: rope }],
        },
      ],
    });
    expect(itemPlaces(gives.campaign, rope).placedIn).toEqual([tower]);
    const run = startRun(gives.campaign, { ...library, objects: shelved.library.objects });
    actByLabel(run, "Find the rope");
    expect(run.getSession().encounter!.state.actors.player!.inventory).toContain(rope);
  });
});

describe("a new arrival text (5)", () => {
  it("is what the player sees the next time they play, also where the map place has an introduction", () => {
    const { campaign, library, realm, square } = mappedAdventure();
    const scene = campaign.scenes[0]!;
    expect(scene.usePlaceIntro).toBe(true);
    const before = startRun(campaign, library, [realm]);
    expect(before.getSession().encounter!.definition.description).toBe(square.note);
    const patch: AuthoringPatch = {
      ops: [
        { op: "setText", target: { sceneId: scene.id, field: "arrival" }, text: "A bell tolls." },
      ],
    };
    expect(checkPatch(campaign, library, patch)).toEqual([]);
    const after = applyPatch(campaign, library, patch);
    expect(after.campaign.scenes[0]!.usePlaceIntro).toBe(false);
    const run = startRun(after.campaign, library, [realm]);
    expect(run.getSession().encounter!.definition.description).toBe("A bell tolls.");
    // A scene that does not use the introduction is left as it is.
    const own = applyPatch(after.campaign, library, patch);
    expect(own.campaign.scenes[0]!.usePlaceIntro).toBe(false);
  });
});

describe("a locked route (6)", () => {
  it("gets a door id that is free in both scenes and among the shared doors, and keeps what is there", () => {
    const { campaign, library, hall, crypt } = sketchAdventure();
    const taken = "adv:link:rusty-gate:door-1";
    const old = {
      id: taken,
      name: "Old gate",
      open: false,
      locked: true,
      blocked: false,
      position: "here",
      shared: true,
      keyId: "old-key",
      futureField: "keep me",
    };
    const marked = structuredClone(campaign);
    const cryptGame = marked.scenes.find((scene) => scene.id === crypt)!.encounter!;
    (cryptGame.state.barriers as Record<string, unknown>)[taken] = old;
    const patch: AuthoringPatch = {
      ops: [
        {
          op: "addLink",
          from: hall,
          to: crypt,
          label: "Rusty gate",
          lockName: "Rusty gate",
          requires: [{ kind: "item", itemId: library.objects[0]!.id }],
        },
      ],
    };
    const result = applyPatch(marked, library, patch);
    const barriers = (id: string) =>
      result.campaign.scenes.find((scene) => scene.id === id)!.encounter!.state.barriers;
    expect(barriers(crypt)[taken]).toEqual(old);
    const link = result.campaign.sceneLinks.at(-1)!;
    const doorId = link.requiresOpenBarriers![0]!;
    expect(doorId).not.toBe(taken);
    expect(barriers(hall)[doorId]).toMatchObject({ name: "Rusty gate", locked: true });
    expect(barriers(crypt)[doorId]).toMatchObject({ name: "Rusty gate", shared: true });

    const run = startRun(result.campaign, library);
    goBy(run, result.campaign, "Down the stairs");
    actByLabel(run, "Take the seal");
    openTheDoor(run, "Rusty gate");
    goBy(run, result.campaign, "Rusty gate");
    expect(where(run)).toBe("Crypt");
  });
});
