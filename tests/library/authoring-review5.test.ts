import { describe, expect, it } from "vitest";
import { adventureCompleted } from "../../src/game/AdventureEngine";
import { checkPatch } from "../../src/game/authoringChecks";
import { applyPatch, type AuthoringPatch } from "../../src/library/authoringPatch";
import { newObjectTemplate, type CampaignTemplate } from "../../src/library/LibrarySchema";
import { placeItem } from "../../src/library/sceneParts";
import { actByLabel, goBy, sketchAdventure, startRun, where } from "../fixtures/authoring-sketch";

/** Astra's review of 0390b31: two counterexamples, each checked and played by the engine. */
describe("the checks and the engine agree (review 5)", () => {
  it("refuses an ending behind a door whose key is a weapon the player holds", () => {
    const base = sketchAdventure();
    const bow = newObjectTemplate({
      id: "bow",
      name: "Short bow",
      source: "player",
      tags: [],
      note: "A hunting bow.",
      weapon: { skill: "Archery", kind: "ranged", damage: 6, usesAmmunition: true },
    });
    // The bow is in the player's hand from the start.
    const tower = base.campaign.scenes.find((scene) => scene.id === base.tower)!;
    const armed = placeItem(tower, bow, { heldBy: "player" });
    const start: CampaignTemplate = {
      ...base.campaign,
      objectIds: [...base.campaign.objectIds, bow.id],
      scenes: base.campaign.scenes.map((scene) => (scene.id === base.tower ? armed : scene)),
    };
    const library = { ...base.library, objects: [...base.library.objects, bow] };
    const goal = { title: "Get the treasure", requiresFlags: ["treasure"] };
    const patch: AuthoringPatch = {
      ops: [
        {
          op: "addScene",
          tempId: "new:vault",
          name: "Vault",
          placeId: "p-cellar",
          arrival: "A chest.",
        },
        {
          op: "addLink",
          from: base.hall,
          to: "new:vault",
          label: "Iron gate",
          lockName: "Iron gate",
          requires: [{ kind: "item", itemId: bow.id }],
        },
        {
          op: "addAction",
          sceneId: "new:vault",
          label: "Open the chest",
          outcome: "Gold.",
          gives: [{ fact: "treasure", learned: "The chest held gold." }],
        },
      ],
    };
    const findings = checkPatch({ ...start, goal }, library, patch);
    const vault = applyPatch(start, library, patch).newSceneIds[0]!;
    expect(findings).toContainEqual(expect.objectContaining({ kind: "deadEnd", sceneId: vault }));

    // The engine agrees: the bow does not open the gate, so the treasure is never reached.
    const after = applyPatch({ ...start, goal }, library, patch).campaign;
    const run = startRun(after, library);
    goBy(run, after, "Down the stairs");
    expect(() => goBy(run, after, "Iron gate")).toThrow();
    expect(where(run)).toBe("Guildhall");
    expect(adventureCompleted(run.getSession())).toBe(false);
  });

  it("lets an action the player may take quietly pass when the alarm way is the other one", () => {
    const base = sketchAdventure();
    // A room with the loud way in: the alarm door sets the alarm.
    const room = applyPatch(base.campaign, base.library, {
      ops: [
        {
          op: "addScene",
          tempId: "new:room",
          name: "Cellar room",
          placeId: "p-cellar",
          arrival: "Dim.",
        },
        { op: "addLink", from: base.hall, to: "new:room", label: "Alarm door" },
        { op: "addLink", from: "new:room", to: base.hall, label: "Back out" },
      ],
    });
    const roomId = room.newSceneIds[0]!;
    const withAlarm: CampaignTemplate = {
      ...room.campaign,
      sceneLinks: room.campaign.sceneLinks.map((link) =>
        link.label === "Alarm door" ? { ...link, setsFlags: ["alarm"] } : link,
      ),
    };
    const patch: AuthoringPatch = {
      ops: [
        // Buy a ticket in the tower, show it in the hall, and go in quietly.
        {
          op: "addAction",
          sceneId: base.tower,
          label: "Buy a ticket",
          outcome: "A ticket.",
          gives: [{ fact: "ticket" }],
        },
        {
          op: "addAction",
          sceneId: base.hall,
          label: "Show the ticket",
          outcome: "The guard lets you in.",
          requires: [{ kind: "fact", fact: "ticket" }],
          gives: [{ fact: "admitted" }],
        },
        {
          op: "addLink",
          from: base.hall,
          to: roomId,
          label: "Quiet way in",
          requires: [{ kind: "fact", fact: "admitted" }],
        },
        {
          op: "addAction",
          sceneId: roomId,
          label: "Göm dig",
          outcome: "You hide in the shadows.",
          requires: [{ kind: "noFact", fact: "alarm" }],
        },
      ],
    };
    const findings = checkPatch(withAlarm, base.library, patch);
    expect(findings.filter((f) => f.kind === "unreachable" && f.params.what === "action")).toEqual(
      [],
    );

    // The engine agrees: the quiet way is taken, and Göm dig is played.
    const after = applyPatch(withAlarm, base.library, patch).campaign;
    const run = startRun(after, base.library);
    actByLabel(run, "Buy a ticket");
    goBy(run, after, "Down the stairs");
    actByLabel(run, "Show the ticket");
    goBy(run, after, "Quiet way in");
    expect(where(run)).toBe("Cellar room");
    expect(() => actByLabel(run, "Göm dig")).not.toThrow();
  });
});
