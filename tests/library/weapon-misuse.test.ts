import { describe, expect, it } from "vitest";
import {
  adventureFacts,
  connectedAdventureExample,
  newOpportunity,
} from "../../src/library/playableCampaign";
import { newObjectTemplate, type ObjectTemplate } from "../../src/library/LibrarySchema";
import { addDoor, placeItem } from "../../src/library/sceneParts";
import { syncScene } from "../../src/library/sceneSync";
import { storyboardIssues } from "../../src/ui/studio/storyboardReadiness";

function setup() {
  const built = connectedAdventureExample();
  const dagger = newObjectTemplate({
    name: "Dagger",
    note: "",
    source: "player",
    tags: [],
  });
  const asWeapon: ObjectTemplate = {
    ...dagger,
    weapon: { skill: "Melee", kind: "melee", damage: 2, usesAmmunition: false },
  };
  return { built, dagger, asWeapon };
}

const issuesFor = (
  campaign: ReturnType<typeof setup>["built"]["campaign"],
  places: never[],
  objects: { id: string; name: string; weapon?: unknown }[],
) =>
  storyboardIssues(
    campaign,
    places,
    new Set(adventureFacts(campaign).map((fact) => fact.id)),
    undefined,
    { objects },
  ).filter((issue) => issue.message.includes("is a weapon"));

/** A door whose key is the dagger, which the player carries in the pack. */
function daggerDoor() {
  const { built, dagger, asWeapon } = setup();
  let scene = structuredClone(built.campaign.scenes[0]!);
  scene.encounter!.state.actors.player!.inventory = [];
  scene = placeItem(scene, dagger, { heldBy: "player" });
  const door = addDoor(scene, {
    name: "Cellar door",
    position: "here",
    locked: true,
    keyId: dagger.id,
  });
  const campaign = { ...built.campaign, scenes: [door.scene, ...built.campaign.scenes.slice(1)] };
  return { built, dagger, asWeapon, campaign };
}

describe("a weapon used as a key or handed over", () => {
  it("is fine while the thing is not a weapon", () => {
    const { built, dagger, campaign } = daggerDoor();

    expect(issuesFor(campaign, built.places as never[], [...built.objects, dagger])).toEqual([]);
  });

  it("blocks testing as soon as the card becomes a weapon, before anything is synced", () => {
    const { built, asWeapon, campaign } = daggerDoor();

    const found = issuesFor(campaign, built.places as never[], [...built.objects, asWeapon]);

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("“Dagger”");
    expect(found[0]!.message).toContain("the key to “Cellar door”");
  });

  it("still blocks after the scene has been brought up to date and the dagger moved to the weapons", () => {
    const { built, asWeapon, campaign } = daggerDoor();
    const library = {
      characters: built.characters,
      objects: [...built.objects, asWeapon],
      places: built.places,
    };

    const synced = syncScene(campaign, campaign.scenes[0]!, library);

    expect(synced.encounter!.state.actors.player!.weapons).toContain(asWeapon.id);
    expect(synced.encounter!.state.actors.player!.inventory).not.toContain(asWeapon.id);
    const after = { ...campaign, scenes: [synced, ...campaign.scenes.slice(1)] };
    expect(issuesFor(after, built.places as never[], library.objects)).toHaveLength(1);
  });

  it("blocks a weapon in a handover", () => {
    const { built, asWeapon, campaign } = daggerDoor();
    const scene = structuredClone(campaign.scenes[0]!);
    const give = newOpportunity("Give Edda the dagger", "She takes it.");
    give.counterpartyId = Object.keys(scene.encounter!.state.actors).find((id) =>
      id.startsWith("npc:"),
    )!;
    give.success.effects = [
      { kind: "transfer-item", itemId: asWeapon.id, from: "player", to: give.counterpartyId },
    ];
    scene.encounter!.definition.interactions.push(give);
    scene.encounter!.state.barriers = {};
    const handover = { ...campaign, scenes: [scene, ...campaign.scenes.slice(1)] };

    const found = issuesFor(handover, built.places as never[], [...built.objects, asWeapon]);

    expect(
      found.some((issue) => issue.message.includes("handed over in “Give Edda the dagger”")),
    ).toBe(true);
  });

  it("names the weapon even when its card is not passed in, once it is carried as one", () => {
    const { built, asWeapon, campaign } = daggerDoor();
    const library = {
      characters: built.characters,
      objects: [...built.objects, asWeapon],
      places: built.places,
    };
    const synced = syncScene(campaign, campaign.scenes[0]!, library);
    const after = { ...campaign, scenes: [synced, ...campaign.scenes.slice(1)] };

    expect(issuesFor(after, built.places as never[], [])).toHaveLength(1);
  });
});
