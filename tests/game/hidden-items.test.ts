import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { publicCommands } from "../../src/game/catalog";
import { actionBlock, validateEncounter } from "../../src/game/EncounterEngine";
import { InteractionSchema } from "../../src/game/EncounterSchema";
import { itemRevealed } from "../../src/game/itemVisibility";
import { buildFreeReplyMessages } from "../../src/session/encounterPrompt";

function hidden() {
  const built = connectedAdventureExample();
  const session = startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "hidden-items",
    [built.realm],
    { characters: built.characters },
  );
  const game = session.encounter!;
  const where = game.state.actors[game.definition.playerId]!.position;
  game.definition.items.push({ id: "coin", name: "Silver coin", requiresFlags: ["drawer-open"] });
  game.state.itemLocations.coin = where;
  const take = InteractionSchema.parse({
    id: "take-coin",
    label: "Take Silver coin",
    description: "",
    position: where,
    once: true,
    success: { text: "You pocket it.", effects: [{ kind: "take-item", itemId: "coin" }] },
    failure: { text: "No.", effects: [] },
  });
  game.definition.interactions.push(take);
  return { session, game, eddaId: `npc:${built.characters[0]!.id}` };
}

const labels = (game: ReturnType<typeof hidden>["game"]) =>
  publicCommands(game).map((command) => command.label);

describe("a thing that stays hidden until a flag is set", () => {
  it("is valid, and a thing without flags is always revealed", () => {
    const { game } = hidden();

    expect(() => validateEncounter(game)).not.toThrow();
    expect(itemRevealed(game.definition, game.state, "coin")).toBe(false);
    game.definition.items[0]!.requiresFlags = [];
    expect(itemRevealed(game.definition, game.state, game.definition.items[0]!.id)).toBe(true);
  });

  it("is not offered as a choice, and the take is blocked with the usual reason", () => {
    const { game } = hidden();

    expect(labels(game)).not.toContain("Take Silver coin");
    expect(
      actionBlock(game.definition, game.state, { kind: "interaction", interactionId: "take-coin" }),
    ).toBe("The conditions for this opportunity are not met.");
  });

  it("is not named to the story AI", () => {
    const { session, eddaId } = hidden();

    const text = buildFreeReplyMessages(session, eddaId, "Hello", [])
      .map((message) => message.content)
      .join("\n");

    expect(text).not.toContain("Silver coin");
  });

  it("shows up, is offered and can be taken once the flag is set", () => {
    const { session, game, eddaId } = hidden();
    game.state.flags.push("drawer-open");

    expect(itemRevealed(game.definition, game.state, "coin")).toBe(true);
    expect(labels(game)).toContain("Take Silver coin");
    expect(
      actionBlock(game.definition, game.state, { kind: "interaction", interactionId: "take-coin" }),
    ).toBeUndefined();
    const text = buildFreeReplyMessages(session, eddaId, "Hello", [])
      .map((message) => message.content)
      .join("\n");
    expect(text).toContain("Silver coin");
  });
});

describe("hidden things and the library sync", () => {
  it("keeps the flags a thing requires when the scene is synced from its card", async () => {
    const { syncScene } = await import("../../src/library/sceneSync");
    const built = connectedAdventureExample();
    const scene = structuredClone(built.campaign.scenes[0]!);
    const card = built.objects[0]!;
    const game = scene.encounter!;
    const there = game.definition.items.find((item) => item.id === card.id);
    expect(there).toBeDefined();
    there!.requiresFlags = ["drawer-open"];

    const synced = syncScene(built.campaign, scene, {
      characters: built.characters,
      objects: built.objects,
      places: built.places,
      rulesets: [],
    });

    expect(
      synced.encounter!.definition.items.find((item) => item.id === card.id)!.requiresFlags,
    ).toEqual(["drawer-open"]);
  });
});
