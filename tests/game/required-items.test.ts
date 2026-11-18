import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { newObjectTemplate } from "../../src/library/LibrarySchema";
import { placeItem, addPickUp } from "../../src/library/sceneParts";
import { actionBlock, validateEncounter } from "../../src/game/EncounterEngine";
import { InteractionSchema } from "../../src/game/EncounterSchema";
import { publicCommands } from "../../src/game/catalog";
import { storyboardWarnings } from "../../src/ui/studio/storyboardReadiness";
import { adventureFacts } from "../../src/library/playableCampaign";

const card = (name: string, extra: Record<string, unknown> = {}) =>
  newObjectTemplate({ name, note: "", tags: [], source: "player", ...extra } as never);

function setup() {
  const built = connectedAdventureExample();
  const campaign = structuredClone(built.campaign);
  const pick = card("Lockpick");
  const sword = card("Short sword", {
    weapon: { skill: "Melee", kind: "melee", damage: 5, usesAmmunition: false },
  });
  let scene = campaign.scenes[0]!;
  scene = placeItem(scene, pick, { position: "here" });
  scene = placeItem(scene, sword, { position: "here" });
  const game = scene.encounter!;
  const where = game.state.actors[game.definition.playerId]!.position;
  const action = (id: string, needs: string[]) =>
    InteractionSchema.parse({
      id,
      label: `Pick the lock ${id}`,
      description: "",
      position: where,
      once: false,
      requiresItems: needs,
      success: { text: "Click.", effects: [{ kind: "flag", flag: `opened:${id}` }] },
      failure: { text: "No.", effects: [] },
    });
  return { built, campaign, scene, pick, sword, where, action };
}

const block = (game: ReturnType<typeof setup>["scene"]["encounter"], id: string) =>
  actionBlock(game!.definition, game!.state, { kind: "interaction", interactionId: id });

describe("actions that need something carried", () => {
  it("is shown but turned off with the reason until the player has the thing", () => {
    const { scene, pick, action } = setup();
    const game = structuredClone(scene.encounter!);
    game.definition.interactions.push(action("a", [pick.id]));

    const listed = publicCommands(game).find((c) => c.label === "Pick the lock a");
    expect(listed?.blocked).toBe("You need Lockpick.");

    delete game.state.itemLocations[pick.id];
    game.state.actors[game.definition.playerId]!.inventory.push(pick.id);
    expect(block(game, "a")).toBeUndefined();
  });

  it("counts a carried weapon as carried", () => {
    const { scene, sword, action } = setup();
    const game = structuredClone(scene.encounter!);
    game.definition.interactions.push(action("b", [sword.id]));
    expect(block(game, "b")).toBe("You need Short sword.");

    delete game.state.itemLocations[sword.id];
    game.state.actors[game.definition.playerId]!.weapons.push(sword.id);

    expect(block(game, "b")).toBeUndefined();
  });

  it("refuses a scene where an action needs a thing that is not in it", () => {
    const { scene, action } = setup();
    const game = structuredClone(scene.encounter!);
    game.definition.interactions.push(action("c", ["ghost"]));

    expect(() => validateEncounter(game)).toThrow(/not in this scene/);
  });

  it("is reachable only when the player can get the thing", () => {
    const { campaign, scene, pick, action } = setup();
    const facts = new Set(adventureFacts(campaign).map((f) => f.id));
    const withAction = structuredClone(scene);
    withAction.encounter!.definition.interactions.push(action("d", [pick.id]));
    const unreachable = { ...campaign, scenes: [withAction, ...campaign.scenes.slice(1)] };
    const findIssue = (c: typeof campaign) =>
      storyboardWarnings(c, facts).find((i) => i.message.includes("Pick the lock d"));

    expect(findIssue(unreachable)?.message).toContain("needs “Lockpick”");

    const reachable = structuredClone(unreachable);
    reachable.scenes[0] = addPickUp(reachable.scenes[0]!, pick.id);
    expect(findIssue(reachable)).toBeUndefined();
  });

  it("leaves an action without requirements exactly as before", () => {
    const { scene, action } = setup();
    const game = structuredClone(scene.encounter!);
    game.definition.interactions.push(action("e", []));

    expect(block(game, "e")).toBeUndefined();
  });
});
