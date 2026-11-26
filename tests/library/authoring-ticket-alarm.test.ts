import { expect, it } from "vitest";
import { checkPatch } from "../../src/game/authoringChecks";
import { applyPatch, type AuthoringPatch } from "../../src/library/authoringPatch";
import { actByLabel, goBy, sketchAdventure, startRun } from "../fixtures/authoring-sketch";

it("warns when obtaining the ticket has already raised the alarm", () => {
  const base = sketchAdventure();
  const built = applyPatch(base.campaign, base.library, {
    ops: [
      { op: "addLink", from: base.tower, to: base.hall, label: "Take ticket lane" },
      { op: "addScene", tempId: "new:room", name: "Room", arrival: "Quiet.", placeId: "p-cellar" },
      {
        op: "addLink",
        from: base.hall,
        to: "new:room",
        label: "Use ticket",
        requires: [{ kind: "fact", fact: "ticket" }],
      },
      { op: "addLink", from: base.hall, to: "new:room", label: "Noisy door" },
    ],
  });
  const campaign = {
    ...built.campaign,
    sceneLinks: built.campaign.sceneLinks.map((link) => {
      if (link.label === "Take ticket lane") return { ...link, setsFlags: ["ticket", "alarm"] };
      if (link.label === "Noisy door") return { ...link, setsFlags: ["alarm"] };
      return link;
    }),
  };
  const room = built.newSceneIds[0]!;
  const patch: AuthoringPatch = {
    ops: [
      {
        op: "addAction",
        sceneId: room,
        label: "Hide",
        outcome: "Hidden.",
        requires: [{ kind: "noFact", fact: "alarm" }],
      },
    ],
  };
  const saved = applyPatch(campaign, base.library, patch).campaign;
  const ticket = startRun(saved, base.library);
  goBy(ticket, saved, "Take ticket lane");
  goBy(ticket, saved, "Use ticket");
  expect(ticket.getSession().encounter!.state.flags).toContain("alarm");
  expect(() => actByLabel(ticket, "Hide")).toThrow();
  const ordinary = startRun(saved, base.library);
  goBy(ordinary, saved, "Down the stairs");
  expect(() => goBy(ordinary, saved, "Use ticket")).toThrow();
  goBy(ordinary, saved, "Noisy door");
  expect(ordinary.getSession().encounter!.state.flags).toContain("alarm");
  expect(() => actByLabel(ordinary, "Hide")).toThrow();

  expect(checkPatch(campaign, base.library, patch)).toContainEqual(
    expect.objectContaining({ kind: "unreachable", sceneId: room }),
  );
});
