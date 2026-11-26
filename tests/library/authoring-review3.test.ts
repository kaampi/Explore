import { describe, expect, it } from "vitest";
import { adventureCompleted, adventureOptions } from "../../src/game/AdventureEngine";
import { checkPatch } from "../../src/game/authoringChecks";
import { applyPatch, type AuthoringPatch } from "../../src/library/authoringPatch";
import { actByLabel, goBy, sketchAdventure, startRun, where } from "../fixtures/authoring-sketch";

describe("the goal must be possible in one playthrough (review 3, 1)", () => {
  it("refuses a shared ending that needs both branches, and the engine agrees: one play never completes it", () => {
    const base = sketchAdventure();
    const goal = { title: "Open both", requiresFlags: ["north-done", "south-done", "ended"] };
    const ops: AuthoringPatch["ops"] = [
      {
        op: "addScene",
        tempId: "new:north",
        name: "North",
        placeId: "p-cellar",
        arrival: "North.",
      },
      {
        op: "addScene",
        tempId: "new:south",
        name: "South",
        placeId: "p-cellar",
        arrival: "South.",
      },
      {
        op: "addScene",
        tempId: "new:end",
        name: "Vault",
        placeId: "p-cellar",
        arrival: "The vault.",
      },
      { op: "addLink", from: base.hall, to: "new:north", label: "Go north" },
      { op: "addLink", from: base.hall, to: "new:south", label: "Go south" },
      {
        op: "addAction",
        sceneId: "new:north",
        label: "Read the north stone",
        outcome: "North is done.",
        gives: [{ fact: "north-done" }],
      },
      {
        op: "addAction",
        sceneId: "new:south",
        label: "Read the south stone",
        outcome: "South is done.",
        gives: [{ fact: "south-done" }],
      },
      { op: "addLink", from: "new:north", to: "new:end", label: "Into the vault" },
      { op: "addLink", from: "new:south", to: "new:end", label: "Into the vault from the south" },
      {
        op: "addAction",
        sceneId: "new:end",
        label: "Open the vault",
        outcome: "It opens.",
        gives: [{ fact: "ended" }],
      },
    ];
    const patch: AuthoringPatch = { ops };
    const made = applyPatch(base.campaign, base.library, patch);
    const campaign = { ...made.campaign, goal };
    const endScene = made.newSceneIds[2]!;
    const findings = checkPatch({ ...base.campaign, goal }, base.library, patch).filter(
      (f) => f.kind === "deadEnd",
    );
    expect(findings.map((f) => f.sceneId)).toEqual([endScene]);

    // Play both branches the way the engine lets one play go, and the goal is never complete.
    const run = startRun(campaign, base.library);
    goBy(run, campaign, "Down the stairs");
    goBy(run, campaign, "Go north");
    actByLabel(run, "Read the north stone");
    goBy(run, campaign, "Into the vault");
    actByLabel(run, "Open the vault");
    expect(where(run)).toBe("Vault");
    expect(adventureCompleted(run.getSession())).toBe(false);
    expect(adventureOptions(run.getSession())).toEqual([]);
  });
});

describe("a way that cannot be taken does not count (review 3, 2)", () => {
  it("keeps an alarm that is certain on the only usable way into a room, so an action needing it not to have gone is refused", () => {
    const base = sketchAdventure();
    const ops: AuthoringPatch["ops"] = [
      { op: "addScene", tempId: "new:room", name: "Room", placeId: "p-cellar", arrival: "Quiet." },
      { op: "addScene", tempId: "new:annex", name: "Annex", placeId: "p-cellar", arrival: "Side." },
      { op: "addLink", from: base.hall, to: "new:annex", label: "To the annex" },
      {
        op: "addLink",
        from: "new:annex",
        to: "new:room",
        label: "Locked way",
        requires: [{ kind: "fact", fact: "impossible-key" }],
      },
      { op: "addLink", from: base.hall, to: "new:room", label: "Alarm way" },
      { op: "addLink", from: "new:room", to: base.hall, label: "Back" },
    ];
    const made = applyPatch(base.campaign, base.library, { ops });
    const room = made.newSceneIds[0]!;
    // The only usable way in sets the alarm.
    const campaign = {
      ...made.campaign,
      sceneLinks: made.campaign.sceneLinks.map((link) =>
        link.label === "Alarm way" ? { ...link, setsFlags: ["alarm"] } : link,
      ),
    };
    const hide: AuthoringPatch = {
      ops: [
        {
          op: "addAction",
          sceneId: room,
          label: "Hide",
          outcome: "Dark.",
          requires: [{ kind: "noFact", fact: "alarm" }],
        },
      ],
    };
    expect(checkPatch(campaign, base.library, hide)).toMatchObject([
      { kind: "unreachable", params: { why: "happened", thing: "Alarm way" } },
    ]);
  });
});

describe("an internal id never reaches the author (review 3, 3)", () => {
  it("gives a translatable fallback when a discovery has no readable name", () => {
    const { campaign, library, hall } = sketchAdventure();
    const [finding] = checkPatch(campaign, library, {
      ops: [
        {
          op: "addAction",
          sceneId: hall,
          label: "Ask",
          outcome: "No.",
          requires: [{ kind: "fact", fact: "trigger:alarm:42" }],
        },
      ],
    });
    expect(finding).toMatchObject({
      kind: "unreachable",
      params: { unnamed: true },
    });
    expect(finding!.params).not.toHaveProperty("thing", "trigger:alarm:42");
    expect(JSON.stringify(finding)).not.toContain("trigger:alarm:42");
    expect(finding!.message).toContain("a discovery");
  });
});
