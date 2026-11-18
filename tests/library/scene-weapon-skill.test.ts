import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import {
  newObjectTemplate,
  newRulesetTemplate,
  type CampaignTemplate,
} from "../../src/library/LibrarySchema";
import { skillIdFor, syncAdventure, type SceneLibrary } from "../../src/library/sceneSync";
import { actorIdFor, placeItem } from "../../src/library/sceneParts";

const scales = [
  { id: "melee-1", name: "Close combat", min: 1, max: 18 },
  { id: "aim", name: "Aim", min: 1, max: 18 },
];

describe("skillIdFor", () => {
  it("matches an id first, then a name in any capitals", () => {
    expect(skillIdFor("aim", { scales })).toBe("aim");
    expect(skillIdFor("close combat", { scales })).toBe("melee-1");
    expect(skillIdFor(" CLOSE COMBAT ", { scales })).toBe("melee-1");
  });

  it("prefers an id over a name that looks the same", () => {
    const tricky = [
      { id: "x", name: "aim", min: 0, max: 10 },
      { id: "aim", name: "Something else", min: 0, max: 10 },
    ];

    expect(skillIdFor("aim", { scales: tricky })).toBe("aim");
  });

  it("keeps the text when nothing matches, or when there are no scales", () => {
    expect(skillIdFor("Archery", { scales })).toBe("Archery");
    expect(skillIdFor("Archery")).toBe("Archery");
  });
});

function setup() {
  const built = connectedAdventureExample();
  const set = newRulesetTemplate({
    name: "Fighters",
    source: "player",
    attributes: [
      { id: "melee-1", name: "Close combat", kind: "number", min: 1, max: 18 },
      { id: "aim", name: "Aim", kind: "number", min: 1, max: 18 },
    ] as never,
  });
  const weapon = (name: string, skill: string) =>
    newObjectTemplate({
      name,
      note: "",
      source: "player",
      tags: [],
      weapon: { skill, kind: "melee", damage: 3, usesAmmunition: false },
    });
  const byId = weapon("Spear", "melee-1");
  const byName = weapon("Sword", "close combat");
  const unknown = weapon("Whip", "Whipcraft");
  const library: SceneLibrary = {
    characters: built.characters,
    objects: [...built.objects, byId, byName, unknown],
    places: built.places,
    rulesets: [set],
  };
  const campaign: CampaignTemplate = { ...structuredClone(built.campaign), rulesetId: set.id };
  return {
    built,
    library,
    campaign,
    byId,
    byName,
    unknown,
    eddaId: actorIdFor(built.characters[0]!.id),
  };
}

describe("a weapon's skill in the sync", () => {
  it("is written as the skill's id, whether the card says the id or the name", () => {
    const { campaign, library, byId, byName, eddaId } = setup();
    let scene = campaign.scenes[0]!;
    scene = placeItem(placeItem(scene, byId, { heldBy: "player" }), byName, { heldBy: eddaId });
    const synced = syncAdventure(
      { ...campaign, scenes: [scene, ...campaign.scenes.slice(1)] },
      library,
    );

    const weapons = synced.scenes[0]!.encounter!.definition.weapons;
    expect(weapons.find((w) => w.id === byId.id)?.skill).toBe("melee-1");
    expect(weapons.find((w) => w.id === byName.id)?.skill).toBe("melee-1");
  });

  it("gives the holder a value for it, so the weapon always has a chance", () => {
    const { campaign, library, byName, eddaId } = setup();
    const scene = placeItem(campaign.scenes[0]!, byName, { heldBy: eddaId });
    const synced = syncAdventure(
      { ...campaign, scenes: [scene, ...campaign.scenes.slice(1)] },
      library,
    );

    expect(synced.scenes[0]!.encounter!.state.actors[eddaId]!.stats["melee-1"]).toBe(9.5);
  });

  it("keeps the text of a skill that matches nothing, does not crash, and adds no value for it", () => {
    const { campaign, library, unknown, eddaId } = setup();
    const scene = placeItem(campaign.scenes[0]!, unknown, { heldBy: eddaId });

    const synced = syncAdventure(
      { ...campaign, scenes: [scene, ...campaign.scenes.slice(1)] },
      library,
    );

    const game = synced.scenes[0]!.encounter!;
    expect(game.definition.weapons.find((w) => w.id === unknown.id)?.skill).toBe("Whipcraft");
    expect(game.state.actors[eddaId]!.stats.Whipcraft).toBeUndefined();
  });

  it("is stable when run twice", () => {
    const { campaign, library, byId, eddaId } = setup();
    const scene = placeItem(campaign.scenes[0]!, byId, { heldBy: eddaId });
    const once = syncAdventure(
      { ...campaign, scenes: [scene, ...campaign.scenes.slice(1)] },
      library,
    );

    expect(syncAdventure(once, library)).toEqual(once);
  });
});

describe("what the player starts with", () => {
  function withStartItem() {
    const { built, library, campaign } = setup();
    const lamp = newObjectTemplate({
      name: "Brass lamp",
      note: "It still holds oil.",
      source: "player",
      tags: [],
      startingLocation: { kind: "player" },
    });
    const withLamp: CampaignTemplate = { ...campaign, objectIds: [...campaign.objectIds, lamp.id] };
    // The messenger example's key is also carried from the start, so start from a clean pack.
    for (const scene of withLamp.scenes) scene.encounter!.state.actors.player!.inventory = [];
    return {
      built,
      lamp,
      campaign: withLamp,
      library: { ...library, objects: [...library.objects, lamp] },
    };
  }

  it("goes in the pack of every scene, once", () => {
    const { campaign, library, lamp } = withStartItem();

    const synced = syncAdventure(campaign, library);
    const again = syncAdventure(synced, library);

    for (const result of [synced, again])
      for (const scene of result.scenes) {
        const pack = scene.encounter!.state.actors.player!.inventory;
        expect(pack.filter((id) => id === lamp.id)).toHaveLength(1);
        expect(scene.encounter!.definition.items.find((item) => item.id === lamp.id)?.name).toBe(
          "Brass lamp",
        );
      }
  });

  it("is added to a scene made before the object was added to the adventure", () => {
    const { campaign, library, lamp } = withStartItem();
    const before = { ...campaign, objectIds: campaign.objectIds.filter((id) => id !== lamp.id) };
    const first = syncAdventure(before, library);
    expect(first.scenes[0]!.encounter!.state.actors.player!.inventory).not.toContain(lamp.id);

    const later = syncAdventure({ ...first, objectIds: [...first.objectIds, lamp.id] }, library);

    expect(later.scenes[0]!.encounter!.state.actors.player!.inventory).toContain(lamp.id);
  });

  it("stays out of the pack when the thing is placed somewhere in the adventure", () => {
    const { campaign, library, lamp } = withStartItem();
    const placed = placeItem(
      campaign.scenes[1]!,
      library.objects.find((o) => o.id === lamp.id)!,
      {
        position: "here",
      },
    );
    const withPlacement = { ...campaign, scenes: [campaign.scenes[0]!, placed] };

    const synced = syncAdventure(withPlacement, library);

    for (const scene of synced.scenes)
      expect(scene.encounter!.state.actors.player!.inventory).not.toContain(lamp.id);
  });

  it("stays out of the pack when someone else carries it", () => {
    const { campaign, library, lamp, built } = withStartItem();
    const held = placeItem(
      campaign.scenes[0]!,
      library.objects.find((o) => o.id === lamp.id)!,
      { heldBy: actorIdFor(built.characters[0]!.id) },
    );

    const synced = syncAdventure({ ...campaign, scenes: [held, campaign.scenes[1]!] }, library);

    expect(synced.scenes[1]!.encounter!.state.actors.player!.inventory).not.toContain(lamp.id);
  });
});
