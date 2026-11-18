import { describe, expect, it } from "vitest";
import { adventureFacts, connectedAdventureExample } from "../../src/library/playableCampaign";
import { newCharacterTemplate, newObjectTemplate } from "../../src/library/LibrarySchema";
import {
  HOSTILE_TEAM,
  NEUTRAL_TEAM,
  healthFor,
  actorIdFor,
  addPerson,
  isHostile,
  placeItem,
  removeItem,
  setAttitude,
  setTactics,
  setToughness,
  toughnessOf,
} from "../../src/library/sceneParts";
import { syncScene } from "../../src/library/sceneSync";
import { resolveEncounterAction, validateEncounter } from "../../src/game/EncounterEngine";
import { storyboardIssues } from "../../src/ui/studio/storyboardReadiness";

function setup() {
  const built = connectedAdventureExample();
  const orla = newCharacterTemplate({ name: "Orla" });
  const sword = newObjectTemplate({
    name: "Short sword",
    note: "",
    source: "player",
    tags: [],
    weapon: { skill: "Melee", kind: "melee", damage: 4, usesAmmunition: false },
  });
  const dagger = newObjectTemplate({
    name: "Dagger",
    note: "",
    source: "player",
    tags: [],
    weapon: { skill: "Melee", kind: "melee", damage: 2, usesAmmunition: false },
  });
  const scene = addPerson(structuredClone(built.campaign.scenes[0]!), orla);
  const library = {
    characters: [...built.characters, orla],
    objects: [...built.objects, sword, dagger],
    places: built.places,
  };
  return { built, scene, orla, sword, dagger, library, id: actorIdFor(orla.id) };
}

describe("attitude", () => {
  it("makes a person hostile to the player's side, whatever that side is called", () => {
    const { scene, orla, id } = setup();
    scene.encounter!.state.actors.player!.team = "travellers";

    const next = setAttitude(scene, orla.id, "hostile");

    const game = next.encounter!;
    expect(game.state.actors[id]!.team).toBe(HOSTILE_TEAM);
    expect(game.definition.hostilities).toContainEqual(["travellers", HOSTILE_TEAM]);
    expect(isHostile(game, game.state.actors[id]!)).toBe(true);
  });

  it("does not add the same hostility twice", () => {
    const { scene, orla } = setup();
    const once = setAttitude(scene, orla.id, "hostile");

    const twice = setAttitude(once, orla.id, "hostile");

    expect(twice.encounter!.definition.hostilities).toHaveLength(1);
  });

  it("turns a person neutral again and takes the hostility away when no one is left", () => {
    const { scene, orla, id } = setup();
    const next = setAttitude(setAttitude(scene, orla.id, "hostile"), orla.id, "neutral");

    expect(next.encounter!.state.actors[id]!.team).toBe(NEUTRAL_TEAM);
    expect(next.encounter!.definition.hostilities).toEqual([]);
  });

  it("keeps the hostility while someone else is still hostile", () => {
    const { scene, orla, built } = setup();
    const pell = newCharacterTemplate({ name: "Pell" });
    const two = addPerson(scene, pell);
    const both = setAttitude(setAttitude(two, orla.id, "hostile"), pell.id, "hostile");

    const next = setAttitude(both, orla.id, "neutral");

    expect(next.encounter!.definition.hostilities).toHaveLength(1);
    expect(built.characters).toBeTruthy();
  });

  it("refuses someone who is not in the scene", () => {
    const { scene } = setup();

    expect(() => setAttitude(scene, "nobody", "hostile")).toThrow(/not in this scene/);
  });
});

describe("toughness", () => {
  it("sets health and starts at full health", () => {
    const { scene, orla, id } = setup();

    const next = setToughness(scene, orla.id, "tough");

    expect(next.encounter!.state.actors[id]).toMatchObject({
      maxHp: healthFor("tough", 20),
      hp: healthFor("tough", 20),
    });
    expect(toughnessOf(next.encounter!.state.actors[id]!)).toBe("tough");
  });

  it("reports a health that matches no choice as custom", () => {
    const { scene, id } = setup();
    scene.encounter!.state.actors[id]!.maxHp = 15;

    expect(toughnessOf(scene.encounter!.state.actors[id]!)).toBeUndefined();
  });
});

describe("tactics", () => {
  it("needs a weapon first", () => {
    const { scene, orla } = setup();

    expect(() => setTactics(scene, orla.id, { retreatAt: 2 })).toThrow(/Give Orla a weapon first/);
  });

  it("sets when to retreat and where to, within the scene", () => {
    const { scene, orla, sword, id } = setup();
    const armed = placeItem(scene, sword, { heldBy: id });

    const next = setTactics(armed, orla.id, { retreatAt: 3, escapeTo: "here" });

    expect(next.encounter!.state.actors[id]!.tactics).toMatchObject({
      preferredWeapon: sword.id,
      retreatAt: 3,
      escapeTo: "here",
    });
    expect(() => setTactics(armed, orla.id, { retreatAt: 99 })).toThrow(/from 0 to 12/);
    expect(() => setTactics(armed, orla.id, { escapeTo: "nowhere" })).toThrow(/not in this scene/);
    const cleared = setTactics(next, orla.id, { escapeTo: null });
    expect(cleared.encounter!.state.actors[id]!.tactics?.escapeTo).toBeUndefined();
  });

  it("stays valid when the weapon it prefers is taken away", () => {
    const { scene, orla, sword, dagger, id } = setup();
    const armed = placeItem(placeItem(scene, sword, { heldBy: id }), dagger, { heldBy: id });
    const tuned = setTactics(armed, orla.id, { retreatAt: 2 });

    const next = removeItem(tuned, sword.id);

    expect(next.encounter!.state.actors[id]!.tactics?.preferredWeapon).toBe(dagger.id);
    const none = removeItem(next, dagger.id);
    expect(none.encounter!.state.actors[id]!.tactics).toBeUndefined();
    expect(() => validateEncounter(none.encounter!)).not.toThrow();
  });
});

describe("a hostile person in the sync", () => {
  it("fights with what they carry", () => {
    const { built, scene, orla, sword, library, id } = setup();
    const armed = setAttitude(placeItem(scene, sword, { heldBy: id }), orla.id, "hostile");

    const synced = syncScene(built.campaign, armed, library);

    expect(synced.encounter!.state.actors[id]!.tactics).toMatchObject({
      preferredWeapon: sword.id,
      retreatAt: 0,
    });
  });

  it("does not give tactics to a neutral person", () => {
    const { built, scene, sword, library, id } = setup();
    const armed = placeItem(scene, sword, { heldBy: id });

    const synced = syncScene(built.campaign, armed, library);

    expect(synced.encounter!.state.actors[id]!.tactics).toBeUndefined();
  });

  it("keeps tactics the author set", () => {
    const { built, scene, orla, sword, library, id } = setup();
    const armed = setAttitude(placeItem(scene, sword, { heldBy: id }), orla.id, "hostile");
    const tuned = setTactics(armed, orla.id, { retreatAt: 4 });

    const synced = syncScene(built.campaign, tuned, library);

    expect(synced.encounter!.state.actors[id]!.tactics?.retreatAt).toBe(4);
  });
});

describe("what blocks testing", () => {
  const issuesOf = (campaign: ReturnType<typeof setup>["built"]["campaign"], places: never[]) =>
    storyboardIssues(campaign, places, new Set(adventureFacts(campaign).map((fact) => fact.id)));

  it("blocks a hostile person with no weapon, and names them", () => {
    const { built, scene, orla } = setup();
    const hostile = setAttitude(scene, orla.id, "hostile");
    const campaign = { ...built.campaign, scenes: [hostile, ...built.campaign.scenes.slice(1)] };

    const issue = issuesOf(campaign, built.places as never[]).find((i) =>
      i.message.includes("hostile"),
    );

    expect(issue?.message).toContain("Orla");
    expect(issue?.message).toContain("no weapon");
  });

  it("does not block once they carry a weapon, or when they are neutral", () => {
    const { built, scene, orla, sword, id } = setup();
    const armed = setAttitude(placeItem(scene, sword, { heldBy: id }), orla.id, "hostile");
    const campaign = { ...built.campaign, scenes: [armed, ...built.campaign.scenes.slice(1)] };
    const neutral = { ...built.campaign, scenes: [scene, ...built.campaign.scenes.slice(1)] };

    expect(
      issuesOf(campaign, built.places as never[]).some((i) => i.message.includes("no weapon")),
    ).toBe(false);
    expect(
      issuesOf(neutral, built.places as never[]).some((i) => i.message.includes("no weapon")),
    ).toBe(false);
  });
});

describe("a fight in a scene built only with the operations", () => {
  it("lets the player win against a weak opponent", () => {
    const { built, scene, orla, sword, library, id } = setup();
    const club = newObjectTemplate({
      name: "Club",
      note: "",
      source: "player",
      tags: [],
      weapon: { skill: "Melee", kind: "melee", damage: 2, usesAmmunition: false },
    });
    library.objects.push(club);
    let armed = placeItem(placeItem(scene, sword, { heldBy: "player" }), club, { heldBy: id });
    armed = setToughness(setAttitude(armed, orla.id, "hostile"), orla.id, "weak");
    const ready = syncScene(built.campaign, armed, library);
    let game = ready.encounter!;
    const lucky = () => 0.01;

    game = resolveEncounterAction(
      game,
      {
        id: "fight-1",
        expectedRevision: game.state.revision,
        expectedSceneId: game.definition.id,
        action: { kind: "attack", targetId: id, weaponId: sword.id },
      },
      lucky,
    );

    expect(game.state.actors[id]!.hp).toBe(0);
    expect(game.state.phase).not.toBe("combat");
  });
});
