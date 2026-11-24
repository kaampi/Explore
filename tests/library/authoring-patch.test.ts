import { describe, expect, it } from "vitest";
import { applyPatch, type AuthoringPatch } from "../../src/library/authoringPatch";
import {
  newCampaignTemplate,
  type CampaignTemplate,
  type ObjectTemplate,
} from "../../src/library/LibrarySchema";
import { checkMentions, checkPatch } from "../../src/game/authoringChecks";

const emptyLibrary: { objects: ObjectTemplate[] } = { objects: [] };

/** The sketch: a watchtower, a guildhall, and a crypt that needs the seal. */
export const sketch: AuthoringPatch = {
  ops: [
    {
      op: "addScene",
      tempId: "new:tower",
      name: "Watchtower",
      arrival: "Wind sings in the arrows.",
    },
    { op: "addScene", tempId: "new:hall", name: "Guildhall", arrival: "Long tables, cold hearth." },
    { op: "addScene", tempId: "new:crypt", name: "Crypt", arrival: "Dust and old stone." },
    {
      op: "addItem",
      tempId: "new:seal",
      name: "Seal",
      description: "A wax seal.",
      inSceneId: "new:hall",
    },
    {
      op: "addAction",
      sceneId: "new:hall",
      label: "Take the seal",
      outcome: "You pocket the seal.",
      gives: [{ itemTempId: "new:seal" }],
    },
    { op: "addLink", from: "new:tower", to: "new:hall", label: "Down the stairs" },
    {
      op: "addLink",
      from: "new:hall",
      to: "new:crypt",
      label: "Down to the crypt",
      requires: [{ kind: "item", itemId: "new:seal" }],
    },
    { op: "addLink", from: "new:crypt", to: "new:hall", label: "Back up" },
  ],
};

export function sketchAdventure() {
  const base = newCampaignTemplate({ id: "adv", name: "Sketch" });
  const built = applyPatch(base, emptyLibrary, sketch);
  const [tower, hall, crypt] = built.newSceneIds as [string, string, string];
  const campaign: CampaignTemplate = { ...built.campaign, startSceneId: tower };
  return { campaign, library: built.library, tower, hall, crypt };
}

describe("applyPatch", () => {
  it("adds every kind of change in the right place", () => {
    const { campaign, library, tower, hall, crypt } = sketchAdventure();
    expect(campaign.scenes.map((scene) => scene.name)).toEqual([
      "Watchtower",
      "Guildhall",
      "Crypt",
    ]);
    expect(campaign.scenes[1]!.encounter!.definition.description).toBe("Long tables, cold hearth.");
    expect(library.objects.map((object) => object.name)).toEqual(["Seal"]);
    expect(campaign.objectIds).toContain(library.objects[0]!.id);
    const hallGame = campaign.scenes.find((scene) => scene.id === hall)!.encounter!;
    expect(hallGame.definition.interactions.map((action) => action.label)).toEqual([
      "Take the seal",
    ]);
    expect(hallGame.definition.interactions[0]!.success.effects).toEqual([
      { kind: "take-item", itemId: library.objects[0]!.id },
    ]);
    expect(campaign.sceneLinks.map((link) => [link.fromSceneId, link.toSceneId])).toEqual([
      [tower, hall],
      [hall, crypt],
      [crypt, hall],
    ]);
    // A thing a route asks for becomes a locked door with that thing as its key.
    const locked = campaign.sceneLinks[1]!;
    const doorId = locked.requiresOpenBarriers![0]!;
    expect(hallGame.state.barriers[doorId]).toMatchObject({
      locked: true,
      keyId: library.objects[0]!.id,
    });
  });

  it("turns a discovery into the fields the engine already reads", () => {
    const { campaign, library, hall, tower } = sketchAdventure();
    const result = applyPatch(campaign, library, {
      ops: [
        {
          op: "addAction",
          sceneId: hall,
          label: "Read the plaque",
          outcome: "It names the founder.",
          gives: [{ fact: "founder-known" }],
        },
        {
          op: "addAction",
          sceneId: tower,
          label: "Name the founder",
          outcome: "The guard nods.",
          requires: [{ kind: "fact", fact: "founder-known" }],
        },
        {
          op: "addLink",
          from: tower,
          to: hall,
          label: "Secret door",
          requires: [{ kind: "fact", fact: "founder-known" }],
        },
      ],
    });
    const actions = result.campaign.scenes.find((scene) => scene.id === tower)!.encounter!
      .definition.interactions;
    expect(actions[0]!.requiresFlags).toEqual(["founder-known"]);
    expect(result.campaign.sceneLinks.at(-1)!.requiresFlags).toEqual(["founder-known"]);
    const plaque = result.campaign.scenes
      .find((scene) => scene.id === hall)!
      .encounter!.definition.interactions.at(-1)!;
    expect(plaque.success.effects).toEqual([{ kind: "flag", flag: "founder-known" }]);
  });

  it("replaces a text without touching anything else", () => {
    const { campaign, library, hall } = sketchAdventure();
    const action = campaign.scenes.find((s) => s.id === hall)!.encounter!.definition
      .interactions[0]!;
    const result = applyPatch(campaign, library, {
      ops: [
        { op: "setText", target: { sceneId: hall, field: "arrival" }, text: "A new arrival." },
        {
          op: "setText",
          target: { sceneId: hall, actionId: action.id, field: "outcome" },
          text: "Better.",
        },
        {
          op: "setText",
          target: { sceneId: hall, actionId: action.id, field: "label" },
          text: "Grab the seal",
        },
      ],
    });
    const game = result.campaign.scenes.find((s) => s.id === hall)!.encounter!;
    expect(game.definition.description).toBe("A new arrival.");
    expect(game.definition.interactions[0]).toMatchObject({
      label: "Grab the seal",
      success: { text: "Better." },
    });
    expect(result.newSceneIds).toEqual([]);
  });

  it("keeps fields it does not know, and never removes anything", () => {
    const { campaign, library, hall } = sketchAdventure();
    const marked = {
      ...campaign,
      futureField: { a: 1 },
      scenes: campaign.scenes.map((scene) => ({ ...scene, futureScene: scene.id })),
      sceneLinks: campaign.sceneLinks.map((link) => ({ ...link, futureLink: 7 })),
    } as CampaignTemplate;
    const before = structuredClone(marked);
    const result = applyPatch(marked, library, {
      ops: [
        { op: "addScene", tempId: "new:attic", name: "Attic", arrival: "Cobwebs." },
        { op: "addLink", from: hall, to: "new:attic", label: "Ladder" },
        { op: "addAction", sceneId: hall, label: "Look up", outcome: "A hatch." },
        { op: "setText", target: { sceneId: hall, field: "arrival" }, text: "Changed." },
      ],
    });
    // The input is untouched.
    expect(marked).toEqual(before);
    expect((result.campaign as unknown as { futureField: unknown }).futureField).toEqual({ a: 1 });
    for (const scene of before.scenes) {
      const now = result.campaign.scenes.find((item) => item.id === scene.id)! as unknown as Record<
        string,
        unknown
      >;
      expect(now.futureScene).toBe(scene.id);
    }
    for (const link of before.sceneLinks)
      expect(result.campaign.sceneLinks.find((item) => item.id === link.id)).toMatchObject({
        futureLink: 7,
      });
    // Nothing is gone.
    expect(result.campaign.scenes.length).toBe(before.scenes.length + 1);
    expect(result.campaign.sceneLinks.length).toBe(before.sceneLinks.length + 1);
    for (const scene of before.scenes) {
      const now = result.campaign.scenes.find((item) => item.id === scene.id)!;
      expect(now.encounter!.definition.interactions.length).toBeGreaterThanOrEqual(
        scene.encounter!.definition.interactions.length,
      );
      expect(now.encounter!.definition.items.length).toBeGreaterThanOrEqual(
        scene.encounter!.definition.items.length,
      );
    }
    expect(result.library.objects.length).toBeGreaterThanOrEqual(library.objects.length);
  });

  it("refuses a patch that names something that does not exist, and changes nothing", () => {
    const { campaign, library } = sketchAdventure();
    expect(() =>
      applyPatch(campaign, library, {
        ops: [{ op: "addLink", from: "nope", to: "new:x", label: "x" }],
      }),
    ).toThrow();
    expect(() =>
      applyPatch(campaign, library, {
        ops: [
          { op: "addScene", tempId: "new:a", name: "A", arrival: "." },
          { op: "addScene", tempId: "new:a", name: "A again", arrival: "." },
        ],
      }),
    ).toThrow();
  });
});

describe("checkPatch", () => {
  it("finds the shortcut past the lock, and offers to put the lock on it", () => {
    const { campaign, library, tower, crypt } = sketchAdventure();
    const hatch: AuthoringPatch = {
      ops: [{ op: "addLink", from: tower, to: crypt, label: "The hatch" }],
    };
    const findings = checkPatch(campaign, library, hatch);
    expect(findings.map((finding) => finding.kind)).toEqual(["bypassesLock"]);
    expect(findings[0]!.message).toBe("This route goes past the lock “Needs the Seal”.");
    expect(findings[0]!.fixes.map((fix) => fix.label)).toEqual([
      "Make this route need “Needs the Seal” too",
      "Shortcut on purpose",
    ]);
    // Taking the first fix clears the finding; the second leaves the patch as it is.
    const fixed = findings[0]!.fixes[0]!.patch!;
    expect(checkPatch(campaign, library, fixed)).toEqual([]);
    expect(findings[0]!.fixes[1]!.patch).toBeUndefined();
  });

  it("is quiet about a route that keeps the lock", () => {
    const { campaign, library, tower, crypt } = sketchAdventure();
    const seal = library.objects[0]!.id;
    const findings = checkPatch(campaign, library, {
      ops: [
        {
          op: "addLink",
          from: tower,
          to: crypt,
          label: "The hatch",
          requires: [{ kind: "item", itemId: seal }],
        },
      ],
    });
    expect(findings.filter((finding) => finding.kind === "bypassesLock")).toEqual([]);
  });

  it("finds a scene that asks for something nobody can get", () => {
    const { campaign, library, hall } = sketchAdventure();
    const findings = checkPatch(campaign, library, {
      ops: [
        { op: "addScene", tempId: "new:vault", name: "Vault", arrival: "Gold." },
        {
          op: "addLink",
          from: hall,
          to: "new:vault",
          label: "Vault door",
          requires: [{ kind: "fact", fact: "knows-the-word" }],
        },
        { op: "addLink", from: "new:vault", to: hall, label: "Out" },
      ],
    });
    const unreachable = findings.filter((finding) => finding.kind === "unreachable");
    expect(unreachable).toHaveLength(1);
    expect(unreachable[0]!.message).toContain("“Vault” cannot be reached from the start");
    expect(unreachable[0]!.message).toContain("“knows-the-word” cannot be had anywhere");
  });

  it("finds an action that needs a discovery nobody makes", () => {
    const { campaign, library, hall } = sketchAdventure();
    const findings = checkPatch(campaign, library, {
      ops: [
        {
          op: "addAction",
          sceneId: hall,
          label: "Say the word",
          outcome: "Nothing.",
          requires: [{ kind: "fact", fact: "knows-the-word" }],
        },
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "unreachable" });
  });

  it("finds a new scene with no way on, unless it is an ending", () => {
    const { campaign, library, hall } = sketchAdventure();
    const room: AuthoringPatch = {
      ops: [
        { op: "addScene", tempId: "new:cell", name: "Cell", arrival: "Bars." },
        { op: "addLink", from: hall, to: "new:cell", label: "To the cell" },
      ],
    };
    const findings = checkPatch(campaign, library, room);
    expect(findings.map((finding) => finding.kind)).toEqual(["deadEnd"]);
    expect(findings[0]!.fixes.map((fix) => fix.label)).toEqual(["It is an ending"]);
    // An action that sets the goal makes it an ending.
    const withGoal = { ...campaign, goal: { title: "Escape", requiresFlags: ["escaped"] } };
    const ending: AuthoringPatch = {
      ops: [
        ...room.ops,
        {
          op: "addAction",
          sceneId: "new:cell",
          label: "Slip out",
          outcome: "Free.",
          gives: [{ fact: "escaped" }],
        },
      ],
    };
    expect(checkPatch(withGoal, library, ending)).toEqual([]);
  });

  it("notes a discovery that nothing uses, and not one that something does", () => {
    const { campaign, library, hall, tower } = sketchAdventure();
    const lone = checkPatch(campaign, library, {
      ops: [
        {
          op: "addAction",
          sceneId: hall,
          label: "Sniff",
          outcome: "Smoke.",
          gives: [{ fact: "smelled-smoke" }],
        },
      ],
    });
    expect(lone).toMatchObject([{ kind: "unusedFact", severity: "note" }]);
    const used = checkPatch(campaign, library, {
      ops: [
        {
          op: "addAction",
          sceneId: hall,
          label: "Sniff",
          outcome: "Smoke.",
          gives: [{ fact: "smelled-smoke" }],
        },
        {
          op: "addAction",
          sceneId: tower,
          label: "Warn",
          outcome: "They run.",
          requires: [{ kind: "fact", fact: "smelled-smoke" }],
        },
      ],
    });
    expect(used).toEqual([]);
  });

  it("finds nothing wrong with the sketch itself", () => {
    const base = newCampaignTemplate({ id: "adv", name: "Sketch" });
    expect(checkPatch(base, emptyLibrary, sketch).map((finding) => finding.kind)).toEqual([]);
  });
});

describe("checkMentions", () => {
  it("finds a thing the text mentions that the scene does not have", () => {
    const { campaign, library, hall } = sketchAdventure();
    const findings = checkMentions(campaign, library, hall, "The guildmaster holds a lantern.", [
      "lantern",
      "Seal",
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "missingThing", sceneId: hall });
    expect(findings[0]!.message).toContain("“lantern”");
    expect(findings[0]!.fixes[0]!.patch!.ops[0]).toMatchObject({ op: "addItem", name: "lantern" });
  });

  it("copes with an empty list, which is what no model gives", () => {
    const { campaign, library, hall } = sketchAdventure();
    expect(checkMentions(campaign, library, hall, "Anything at all.", [])).toEqual([]);
    expect(checkMentions(campaign, library, "no-such-scene", "x", ["y"])).toEqual([]);
  });
});
