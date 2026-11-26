import { describe, expect, it } from "vitest";
import { adventureCompleted, adventureOptions } from "../../src/game/AdventureEngine";
import { checkMentions, checkPatch } from "../../src/game/authoringChecks";
import { applyPatch, type AuthoringPatch } from "../../src/library/authoringPatch";
import { newObjectTemplate, type CampaignTemplate } from "../../src/library/LibrarySchema";
import { placeItem, STARTING_AMMUNITION } from "../../src/library/sceneParts";
import {
  actByLabel,
  goBy,
  mappedAdventure,
  openTheDoor,
  sketchAdventure,
  startRun,
  where,
} from "../fixtures/authoring-sketch";

/** The tower, where the player starts, carrying a bow with five arrows. */
function withBow(describedAsItem = false) {
  const base = sketchAdventure();
  const bow = newObjectTemplate({
    id: "bow",
    name: "Short bow",
    source: "player",
    tags: [],
    note: "A hunting bow.",
    weapon: { skill: "Archery", kind: "ranged", damage: 6, usesAmmunition: true },
  });
  const tower = base.campaign.scenes.find((scene) => scene.id === base.tower)!;
  const armed = placeItem(tower, bow, { heldBy: "player" });
  armed.encounter!.state.actors.player!.ammunition.bow = 5;
  // A weapon a scene starts with is a weapon record, not a loose thing: it is not in `items`.
  if (!describedAsItem)
    armed.encounter!.definition.items = armed.encounter!.definition.items.filter(
      (item) => item.id !== "bow",
    );
  const campaign: CampaignTemplate = {
    ...base.campaign,
    objectIds: [...base.campaign.objectIds, "bow"],
    scenes: base.campaign.scenes.map((scene) => (scene.id === base.tower ? armed : scene)),
  };
  return {
    ...base,
    campaign,
    library: { ...base.library, objects: [...base.library.objects, bow] },
  };
}

describe("a new condition never takes equipment away", () => {
  it("keeps the bow and its five arrows when an action asks for the bow", () => {
    const { campaign, library, tower } = withBow();
    const patch: AuthoringPatch = {
      ops: [
        {
          op: "addAction",
          sceneId: tower,
          label: "Shoot the lock",
          outcome: "The lock splinters.",
          requires: [{ kind: "item", itemId: "bow" }],
          gives: [{ fact: "lock-shot", learned: "The lock is broken." }],
        },
      ],
    };
    const before = campaign.scenes.find((scene) => scene.id === tower)!.encounter!;
    const after = applyPatch(campaign, library, patch);
    const game = after.campaign.scenes.find((scene) => scene.id === tower)!.encounter!;
    expect(game.state.actors.player).toEqual(before.state.actors.player);
    expect(game.state.actors.player!.weapons).toEqual(["bow"]);
    expect(game.state.actors.player!.ammunition.bow).toBe(5);
    expect(game.definition.weapons).toEqual(before.definition.weapons);
    expect(game.definition.items).toEqual(before.definition.items);
    expect(game.state.itemLocations).toEqual(before.state.itemLocations);
    expect(STARTING_AMMUNITION).not.toBe(5);
    expect(checkPatch(campaign, library, patch).map((f) => f.kind)).toEqual(["unusedFact"]);
    // And the action plays, with the bow still in hand.
    const run = startRun(after.campaign, library);
    actByLabel(run, "Shoot the lock");
    const player = run.getSession().encounter!.state.actors.player!;
    expect(player.weapons).toEqual(["bow"]);
    expect(player.ammunition.bow).toBe(5);
  });

  it("keeps a carried thing in the pack when a route asks for it", () => {
    const { campaign, library, tower, hall } = sketchAdventure();
    const carried = applyPatch(campaign, library, {
      ops: [
        { op: "addItem", tempId: "new:map", name: "Old map", description: ".", inSceneId: tower },
      ],
    });
    const map = carried.library.objects.find((object) => object.name === "Old map")!;
    const towerScene = carried.campaign.scenes.find((scene) => scene.id === tower)!;
    const held = placeItem(towerScene, map, { heldBy: "player" });
    const next = {
      ...carried.campaign,
      scenes: carried.campaign.scenes.map((scene) => (scene.id === tower ? held : scene)),
    };
    const patch: AuthoringPatch = {
      ops: [
        {
          op: "addLink",
          from: tower,
          to: hall,
          label: "Past the guard",
          lockName: "The guard wants the map",
          requires: [{ kind: "item", itemId: map.id }],
        },
      ],
    };
    const after = applyPatch(next, carried.library, patch);
    const player = after.campaign.scenes.find((scene) => scene.id === tower)!.encounter!.state
      .actors.player!;
    expect(player.inventory).toContain(map.id);
    const run = startRun(after.campaign, { ...library, objects: carried.library.objects });
    openTheDoor(run, "The guard wants the map");
    goBy(run, after.campaign, "Past the guard");
    expect(where(run)).toBe("Guildhall");
  });
});

describe("a gift from the wrong scene", () => {
  it("is reported with the scene it lies in, and does not stop the preview", () => {
    const { campaign, library, tower, hall, seal } = sketchAdventure();
    const patch: AuthoringPatch = {
      ops: [
        {
          op: "addAction",
          sceneId: tower,
          label: "Pluck the seal from thin air",
          outcome: "A seal.",
          gives: [{ itemId: seal }],
        },
      ],
    };
    // The tower knows nothing of the seal.
    expect(
      campaign.scenes
        .find((scene) => scene.id === tower)!
        .encounter!.definition.items.some((item) => item.id === seal),
    ).toBe(false);
    const findings = checkPatch(campaign, library, patch);
    expect(findings).toMatchObject([
      {
        kind: "cannotReceive",
        params: { thing: "Seal", why: "elsewhere", scenes: ["Guildhall"] },
        sceneId: tower,
      },
    ]);
    void hall;
  });
});

describe("what the engine would refuse", () => {
  const alarmCampaign = () => {
    const base = sketchAdventure();
    return { ...base, campaign: { ...base.campaign, storyFlags: ["alarm"] } };
  };

  it("stops an action or a route that needs the alarm not to have gone, when it has", () => {
    const { campaign, library, tower, hall } = alarmCampaign();
    const action: AuthoringPatch = {
      ops: [
        {
          op: "addAction",
          sceneId: tower,
          label: "Sneak past",
          outcome: "Quiet.",
          requires: [{ kind: "noFact", fact: "alarm" }],
        },
      ],
    };
    expect(checkPatch(campaign, library, action)).toMatchObject([
      { kind: "unreachable", params: { what: "action", why: "happened", thing: "alarm" } },
    ]);
    const route: AuthoringPatch = {
      ops: [
        {
          op: "addLink",
          from: tower,
          to: hall,
          label: "Slip through",
          requires: [{ kind: "noFact", fact: "alarm" }],
        },
      ],
    };
    expect(checkPatch(campaign, library, route)).toMatchObject([
      { kind: "unreachable", params: { what: "route", why: "happened" } },
    ]);
    // The engine agrees: the action is shut at the start.
    const run = startRun(applyPatch(campaign, library, action).campaign, library);
    expect(() => actByLabel(run, "Sneak past")).toThrow();
  });

  it("stops it also when every way in has already set the discovery", () => {
    const { campaign, library, hall } = sketchAdventure();
    const patch: AuthoringPatch = {
      ops: [
        // Down the stairs sets nothing, but this one does: the only way into the cellar.
        {
          op: "addScene",
          tempId: "new:cellar",
          name: "Cellar",
          placeId: "p-cellar",
          arrival: "Damp.",
        },
        {
          op: "addLink",
          from: hall,
          to: "new:cellar",
          label: "Break in",
          requires: [{ kind: "fact", fact: "alarm" }],
        },
        { op: "addLink", from: "new:cellar", to: hall, label: "Up" },
        {
          op: "addAction",
          sceneId: "new:cellar",
          label: "Hide",
          outcome: "Dark.",
          requires: [{ kind: "noFact", fact: "alarm" }],
        },
        {
          op: "addAction",
          sceneId: hall,
          label: "Ring it",
          outcome: "Bells.",
          gives: [{ fact: "alarm" }],
        },
      ],
    };
    const kinds = checkPatch(campaign, library, patch).map((f) =>
      f.kind === "unreachable" ? `${f.params.what}:${f.params.why}` : f.kind,
    );
    expect(kinds).toContain("action:happened");
  });

  it("does not approve two one-way endings that each give half of the goal", () => {
    const { campaign, library, hall } = sketchAdventure();
    const goal = { title: "Finish", requiresFlags: ["north-done", "south-done"] };
    const ending = (key: string, flag: string): AuthoringPatch["ops"] => [
      {
        op: "addScene",
        tempId: `new:${key}`,
        name: `${key} room`,
        placeId: "p-cellar",
        arrival: "End.",
      },
      { op: "addLink", from: hall, to: `new:${key}`, label: `Go ${key}` },
      {
        op: "addAction",
        sceneId: `new:${key}`,
        label: `Finish ${key}`,
        outcome: "Done.",
        gives: [{ fact: flag }],
      },
    ];
    const patch: AuthoringPatch = {
      ops: [...ending("north", "north-done"), ...ending("south", "south-done")],
    };
    const withGoal = { ...campaign, goal };
    expect(checkPatch(withGoal, library, patch).map((f) => f.kind)).toEqual(["deadEnd", "deadEnd"]);
    // The engine agrees: down one branch the goal is half done and there is no way out.
    const after = applyPatch(withGoal, library, patch);
    const run = startRun(after.campaign, library);
    goBy(run, after.campaign, "Down the stairs");
    goBy(run, after.campaign, "Go north");
    actByLabel(run, "Finish north");
    expect(adventureCompleted(run.getSession())).toBe(false);
    expect(adventureOptions(run.getSession())).toEqual([]);
    // A way back from the north room makes both reachable: then each is no dead end at all.
    const back: AuthoringPatch = {
      ops: [
        ...patch.ops,
        { op: "addLink", from: "new:north", to: hall, label: "Back" },
        { op: "addLink", from: "new:south", to: hall, label: "Back too" },
      ],
    };
    expect(checkPatch(withGoal, library, back)).toEqual([]);
  });

  it("does not take an equipped weapon for a key", () => {
    const { campaign, library, tower, hall } = withBow(true);
    const patch: AuthoringPatch = {
      ops: [
        {
          op: "addLink",
          from: tower,
          to: hall,
          label: "Past the bar",
          lockName: "A barred door",
          requires: [{ kind: "item", itemId: "bow" }],
        },
      ],
    };
    expect(checkPatch(campaign, library, patch)).toMatchObject([
      {
        kind: "unreachable",
        params: { what: "route", why: "unobtainable", thing: "Short bow" },
      },
    ]);
    // The engine agrees: a bow in the hand does not unlock a door.
    const run = startRun(applyPatch(campaign, library, patch).campaign, library);
    expect(() => openTheDoor(run, "A barred door")).toThrow();
  });
});

describe("a place that is only on the map", () => {
  it("is a place: a bridge on an existing map node, with no card of its own", () => {
    const { campaign, library, realm } = mappedAdventure();
    realm.worldMap!.nodes.push({
      id: "bridge-node",
      placeId: "bridge-place",
      name: "Old bridge",
      kind: "Bridge",
      x: 40,
      y: 40,
      intro: "Planks creak over the brook.",
      description: "A bridge.",
      population: "",
      characterIds: [],
    });
    const square = campaign.scenes[0]!;
    const patch: AuthoringPatch = {
      ops: [
        {
          op: "addScene",
          tempId: "new:bridge",
          name: "The bridge",
          placeId: "bridge-place",
          mapNodeId: "bridge-node",
          arrival: "Planks creak over the brook.",
        },
        { op: "addLink", from: square.id, to: "new:bridge", label: "To the bridge" },
        { op: "addLink", from: "new:bridge", to: square.id, label: "Back to the square" },
      ],
    };
    expect(library.places!.some((place) => place.id === "bridge-place")).toBe(false);
    expect(checkPatch(campaign, library, patch)).toEqual([]);
    const after = applyPatch(campaign, library, patch);
    const run = startRun(after.campaign, library, [realm]);
    goBy(run, after.campaign, "To the bridge");
    expect(where(run)).toBe("The bridge");
  });

  it("is the scene's own place when a text mentions it, also on a map", () => {
    const { campaign, library, hall } = sketchAdventure();
    expect(
      checkMentions(campaign, library, hall, "Out on Guild street.", [
        { name: "Guild street", kind: "place" },
      ]),
    ).toEqual([]);
    // Another scene's place is somewhere else.
    expect(
      checkMentions(campaign, library, hall, "Up on Watchtower hill.", [
        { name: "Watchtower hill", kind: "place" },
      ]),
    ).toMatchObject([{ params: { where: "elsewhere", scenes: ["Watchtower"] } }]);
    const mapped = mappedAdventure();
    const square = mapped.campaign.scenes[0]!;
    expect(
      checkMentions(mapped.campaign, mapped.library, square.id, "The village square.", [
        { name: mapped.square.name, kind: "place" },
        { name: "Village square", kind: "place" },
      ]),
    ).toEqual([]);
  });
});
