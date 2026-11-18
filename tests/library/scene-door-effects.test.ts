import { describe, expect, it } from "vitest";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { doorEffects, setDoorEffect } from "../../src/library/sceneParts";
import { InteractionSchema } from "../../src/game/EncounterSchema";
import { validateEncounter } from "../../src/game/EncounterEngine";
import { storyboardWarnings } from "../../src/ui/studio/storyboardReadiness";
import { adventureFacts } from "../../src/library/playableCampaign";

function setup() {
  const built = innVisitExample();
  const campaign = structuredClone(built.campaign);
  const index = campaign.scenes.findIndex((s) => s.encounter?.state.barriers[built.storeDoorId]);
  const scene = campaign.scenes[index]!;
  const door = scene.encounter!.state.barriers[built.storeDoorId]!;
  scene.encounter!.definition.interactions.push(
    InteractionSchema.parse({
      id: "work",
      label: "Work the lock",
      description: "",
      position: door.position,
      success: { text: "It gives.", effects: [] },
      failure: { text: "It holds.", effects: [] },
    }),
  );
  return { built, campaign, index, scene, doorId: built.storeDoorId };
}

const doorProblems = (c: ReturnType<typeof setup>["campaign"]) =>
  storyboardWarnings(c, new Set(adventureFacts(c).map((f) => f.id))).filter(
    (i) =>
      i.message.includes("needs “Store room door”") || i.message.includes("cannot get the key"),
  );

describe("an action that unlocks or opens a door", () => {
  it("sets and clears each effect, and keeps the scene valid", () => {
    const { scene, doorId } = setup();

    const unlocks = setDoorEffect(scene, "work", "unlock", doorId);
    expect(doorEffects(unlocks, "work")).toEqual({ unlocks: doorId });
    const opens = setDoorEffect(unlocks, "work", "open", doorId);
    expect(doorEffects(opens, "work")).toEqual({ unlocks: doorId, opens: doorId });
    expect(() => validateEncounter(opens.encounter!)).not.toThrow();
    const cleared = setDoorEffect(setDoorEffect(opens, "work", "open", ""), "work", "unlock", "");

    expect(doorEffects(cleared, "work")).toEqual({});
    expect(
      cleared.encounter!.definition.interactions.find((a) => a.id === "work")!.success.effects,
    ).toEqual([]);
  });

  it("keeps other effects, and refuses a door the scene does not have", () => {
    const { scene, doorId } = setup();
    const flagged = structuredClone(scene);
    flagged
      .encounter!.definition.interactions.find((a) => a.id === "work")!
      .success.effects.push({
        kind: "flag",
        flag: "noise",
      });

    const next = setDoorEffect(flagged, "work", "unlock", doorId);

    expect(
      next.encounter!.definition.interactions.find((a) => a.id === "work")!.success.effects,
    ).toHaveLength(2);
    expect(() => setDoorEffect(scene, "work", "unlock", "nowhere")).toThrow(/not in this scene/);
    expect(() => setDoorEffect(scene, "work", "unlock", doorId, "failure")).toThrow(
      /Only an action that rolls/,
    );
  });

  it("makes a door with no key reachable, so the way through it is not reported shut", () => {
    const { campaign, index, scene, doorId } = setup();
    const keyless = structuredClone(campaign);
    const door = keyless.scenes[index]!.encounter!.state.barriers[doorId]!;
    delete door.keyId;
    expect(doorProblems(keyless).length).toBeGreaterThan(0);

    keyless.scenes[index] = setDoorEffect(keyless.scenes[index]!, "work", "unlock", doorId);

    expect(doorProblems(keyless)).toEqual([]);
    expect(scene).toBeDefined();
  });
});
