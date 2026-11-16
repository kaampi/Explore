import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { newObjectTemplate } from "../../src/library/LibrarySchema";
import {
  addContainer,
  addPickUp,
  containerContents,
  openAction,
  pickUpAction,
  placeItem,
  removeItem,
} from "../../src/library/sceneParts";
import { publicCommands } from "../../src/game/catalog";
import { resolveEncounterAction, validateEncounter } from "../../src/game/EncounterEngine";
import type { EncounterGame } from "../../src/game/EncounterSchema";

const card = (name: string, extra: Record<string, unknown> = {}) =>
  newObjectTemplate({ name, note: "", tags: [], source: "player", ...extra } as never);

function setup() {
  const built = connectedAdventureExample();
  const chest = card("Oak chest", { openable: true, lockable: true });
  const key = card("Small key");
  const coin = card("Silver coin");
  const ring = card("Old ring");
  let scene = structuredClone(built.campaign.scenes[0]!);
  scene = placeItem(scene, chest, { position: "here" });
  scene = placeItem(scene, key, { position: "here" });
  return { scene, chest, key, coin, ring };
}

function act(game: EncounterGame, interactionId: string): EncounterGame {
  return resolveEncounterAction(
    game,
    {
      id: crypto.randomUUID(),
      expectedRevision: game.state.revision,
      expectedSceneId: game.definition.id,
      action: { kind: "interaction" as const, interactionId },
    },
    () => {
      throw new Error("No dice needed.");
    },
  );
}

const labels = (game: EncounterGame) => publicCommands(game).map((c) => c.label);

describe("a container", () => {
  it("is valid, and its contents are hidden with a take action each", () => {
    const { scene, chest, key, coin, ring } = setup();

    const next = addContainer(scene, chest, { contents: [coin, ring], key });

    expect(() => validateEncounter(next.encounter!)).not.toThrow();
    expect(containerContents(next, chest.id)).toEqual(["Silver coin", "Old ring"]);
    expect(pickUpAction(next, coin.id)).toBeDefined();
    expect(openAction(next, chest.id)!.requiresItems).toEqual([key.id]);
    expect(labels(next.encounter!)).not.toContain("Take Silver coin");
  });

  it("plays: locked without the key, opens with it, then the contents can be taken", () => {
    const base = setup();
    const { chest, key, coin } = base;
    const scene = addPickUp(base.scene, key.id);
    let game = addContainer(scene, chest, { contents: [coin], key }).encounter!;
    const open = openAction({ ...scene, encounter: game }, chest.id)!;
    expect(publicCommands(game).find((c) => c.label === "Open Oak chest")?.blocked).toBe(
      "You need Small key.",
    );

    game = act(game, pickUpAction({ ...scene, encounter: game }, key.id)!.id);
    game = act(game, open.id);
    expect(labels(game)).toContain("Take Silver coin");
    game = act(game, pickUpAction({ ...scene, encounter: game }, coin.id)!.id);

    expect(game.state.actors.player!.inventory).toContain(coin.id);
  });

  it("is unlocked when no key is given", () => {
    const { scene, chest, coin } = setup();

    const next = addContainer(scene, chest, { contents: [coin] });

    expect(openAction(next, chest.id)!.requiresItems).toEqual([]);
  });

  it("refuses a weapon as key or contents, a card that does not open, and a second time", () => {
    const { scene, chest, key, coin } = setup();
    const sword = card("Sword", {
      weapon: { skill: "Melee", kind: "melee", damage: 5, usesAmmunition: false },
    });
    const withSword = placeItem(scene, sword, { position: "here" });
    const plain = card("Boulder");

    expect(() => addContainer(withSword, chest, { contents: [], key: sword })).toThrow(/weapon/);
    expect(() => addContainer(scene, chest, { contents: [sword] })).toThrow(/weapon/);
    expect(() =>
      addContainer(placeItem(scene, plain, { position: "here" }), plain, { contents: [] }),
    ).toThrow(/opens/);
    const once = addContainer(scene, chest, { contents: [coin], key });
    expect(() => addContainer(once, chest, { contents: [] })).toThrow(/already be opened/);
  });

  it("asks for a key that is in the scene", () => {
    const { scene, chest, coin } = setup();
    const lost = card("Lost key");

    expect(() => addContainer(scene, chest, { contents: [coin], key: lost })).toThrow(
      /Put Lost key/,
    );
  });

  it("will not be removed while it holds something", () => {
    const { scene, chest, coin } = setup();
    const next = addContainer(scene, chest, { contents: [coin] });

    expect(() => removeItem(next, chest.id)).toThrow(/still holds Silver coin/);
  });
});
