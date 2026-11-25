import { describe, expect, it } from "vitest";
import { adventureCompleted } from "../../src/game/AdventureEngine";
import { checkPatch } from "../../src/game/authoringChecks";
import { applyPatch, type AuthoringPatch } from "../../src/library/authoringPatch";
import { newObjectTemplate } from "../../src/library/LibrarySchema";
import { actByLabel, goBy, sketchAdventure, startRun, where } from "../fixtures/authoring-sketch";

/** Astra's fourth review of step 1: two cases, each checked by the checks and played by the engine. */
describe("an action is a choice, and it needs what it asks for (review 4)", () => {
  it("lets the player leave while the alarm is quiet: the bell can be left alone, and the ending counts", () => {
    const base = sketchAdventure();
    const goal = { title: "Get away", requiresFlags: ["escaped"] };
    const patch: AuthoringPatch = {
      ops: [
        {
          op: "addAction",
          sceneId: base.hall,
          label: "Ring the alarm bell",
          outcome: "The bell clangs through the hall.",
          gives: [{ fact: "alarm" }],
        },
        {
          op: "addScene",
          tempId: "new:yard",
          name: "Yard",
          placeId: "p-cellar",
          arrival: "The gate stands open.",
        },
        {
          op: "addLink",
          from: base.hall,
          to: "new:yard",
          label: "Slip out the gate",
          requires: [{ kind: "noFact", fact: "alarm" }],
        },
        {
          op: "addAction",
          sceneId: "new:yard",
          label: "Run into the night",
          outcome: "Nobody follows.",
          gives: [{ fact: "escaped" }],
        },
      ],
    };
    const findings = checkPatch({ ...base.campaign, goal }, base.library, patch);
    const made = applyPatch(base.campaign, base.library, patch);
    const yard = made.newSceneIds[0]!;
    expect(findings.filter((f) => f.sceneId === yard)).toEqual([]);

    // Played: leave the bell alone, go out, and the goal is complete.
    const campaign = { ...made.campaign, goal };
    const run = startRun(campaign, base.library);
    goBy(run, campaign, "Down the stairs");
    goBy(run, campaign, "Slip out the gate");
    actByLabel(run, "Run into the night");
    expect(where(run)).toBe("Yard");
    expect(adventureCompleted(run.getSession())).toBe(true);

    // And ringing the bell does shut the gate, so the condition is real.
    const rung = startRun(campaign, base.library);
    goBy(rung, campaign, "Down the stairs");
    actByLabel(rung, "Ring the alarm bell");
    expect(() => goBy(rung, campaign, "Slip out the gate")).toThrow();
  });

  it("does not count an action whose key can never be had, and calls the scene a dead end", () => {
    const base = sketchAdventure();
    const key = newObjectTemplate({
      id: "o-iron-key",
      name: "Iron key",
      source: "player",
      tags: [],
      note: "Lost long ago.",
    });
    const library = { ...base.library, objects: [...base.library.objects, key] };
    const goal = { title: "Open the chest", requiresFlags: ["chest-open"] };
    const patch: AuthoringPatch = {
      ops: [
        {
          op: "addScene",
          tempId: "new:vault",
          name: "Vault",
          placeId: "p-cellar",
          arrival: "An iron chest.",
        },
        { op: "addLink", from: base.hall, to: "new:vault", label: "Into the vault" },
        {
          op: "addAction",
          sceneId: "new:vault",
          label: "Unlock the chest",
          outcome: "The lid comes up.",
          requires: [{ kind: "item", itemId: key.id }],
          gives: [{ fact: "chest-open" }],
        },
      ],
    };
    const findings = checkPatch({ ...base.campaign, goal }, library, patch);
    const made = applyPatch(base.campaign, library, patch);
    const vault = made.newSceneIds[0]!;
    expect(findings.some((f) => f.kind === "deadEnd" && f.sceneId === vault)).toBe(true);

    // Played: the vault is reached, the chest cannot be opened, and the goal is never complete.
    const campaign = { ...made.campaign, goal };
    const run = startRun(campaign, library);
    goBy(run, campaign, "Down the stairs");
    goBy(run, campaign, "Into the vault");
    expect(where(run)).toBe("Vault");
    expect(() => actByLabel(run, "Unlock the chest")).toThrow();
    expect(adventureCompleted(run.getSession())).toBe(false);
  });
});
