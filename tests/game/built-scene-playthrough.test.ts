import { describe, expect, it } from "vitest";
import { connectedAdventureExample, newOpportunity } from "../../src/library/playableCampaign";
import { newCharacterTemplate, newObjectTemplate } from "../../src/library/LibrarySchema";
import {
  actorIdFor,
  addDoor,
  addPerson,
  addPickUp,
  addPosition,
  attachDoorToConnection,
  placeItem,
  setAttitude,
  setFightBreaksOut,
  setPersonPosition,
  setToughness,
  setPositionDetail,
} from "../../src/library/sceneParts";
import { syncScene } from "../../src/library/sceneSync";
import { resolveEncounterAction } from "../../src/game/EncounterEngine";
import { publicCommands } from "../../src/game/catalog";
import type { EncounterAction, EncounterGame } from "../../src/game/EncounterSchema";

/**
 * A guard stands behind a locked door. The key lies in the room. A scene made only with
 * the editor's operations can be played from the start to the end of the fight.
 */
function buildScene() {
  const built = connectedAdventureExample();
  const guard = newCharacterTemplate({ name: "Orla" });
  const key = built.objects[0]!;
  const sword = newObjectTemplate({
    name: "Short sword",
    note: "",
    source: "player",
    tags: [],
    weapon: { skill: "Melee", kind: "melee", damage: 4, usesAmmunition: false },
  });
  const club = newObjectTemplate({
    name: "Club",
    note: "",
    source: "player",
    tags: [],
    weapon: { skill: "Melee", kind: "melee", damage: 2, usesAmmunition: false },
  });
  const library = {
    characters: [...built.characters, guard],
    objects: [...built.objects, sword, club],
    places: built.places,
  };
  const id = actorIdFor(guard.id);
  let scene = structuredClone(built.campaign.scenes[0]!);
  // The key is not already carried by the player in this build.
  scene.encounter!.state.actors.player!.inventory = [];
  const porch = addPosition(scene, { name: "The porch", from: "here", distance: "close" });
  scene = setPositionDetail(porch.scene, porch.positionId, { cover: "some" });
  scene = placeItem(scene, key, { position: "here" });
  scene = addPickUp(scene, key.id);
  const door = addDoor(scene, {
    name: "Cellar door",
    position: "here",
    locked: true,
    keyId: key.id,
  });
  scene = attachDoorToConnection(door.scene, door.doorId, "here", porch.positionId);
  scene = addPerson(scene, guard);
  scene = setPersonPosition(scene, guard.id, porch.positionId);
  scene = placeItem(scene, sword, { heldBy: "player" });
  scene = placeItem(scene, club, { heldBy: id });
  scene = setToughness(setAttitude(scene, guard.id, "hostile"), guard.id, "weak");
  const insult = newOpportunity("Call out to Orla", "Orla grips her club. “Come on, then.”");
  insult.counterpartyId = undefined as never;
  insult.position = porch.positionId;
  scene = {
    ...scene,
    encounter: {
      ...scene.encounter!,
      definition: {
        ...scene.encounter!.definition,
        interactions: [...scene.encounter!.definition.interactions, insult],
      },
    },
  };
  scene = setFightBreaksOut(scene, insult.id, "success", true);
  const ready = syncScene(built.campaign, scene, library);
  return {
    game: ready.encounter!,
    key,
    sword,
    id,
    porchId: porch.positionId,
    doorId: door.doorId,
    insult,
  };
}

describe("a scene built only with the editor's operations", () => {
  it("can be played from taking the key to winning the fight", () => {
    const { game: start, key, sword, id, porchId, doorId, insult } = buildScene();
    let game: EncounterGame = start;
    let step = 0;
    const act = (action: EncounterAction, rng: () => number = () => 0.5) => {
      game = resolveEncounterAction(
        game,
        {
          id: `step-${step++}`,
          expectedRevision: game.state.revision,
          expectedSceneId: game.definition.id,
          action,
        },
        rng,
      );
    };
    const take = publicCommands(game).find((command) => command.label === `Take ${key.name}`)!;

    // The door is shut and locked, and the player has no key.
    expect(() => act({ kind: "move", to: porchId })).toThrow(/no open route/i);
    expect(() => act({ kind: "interact", barrierId: doorId, operation: "unlock" })).toThrow(/key/i);

    act(take.action);
    expect(game.state.actors.player!.inventory).toContain(key.id);
    act({ kind: "interact", barrierId: doorId, operation: "unlock" });
    act({ kind: "interact", barrierId: doorId, operation: "open" });
    act({ kind: "move", to: porchId });
    expect(game.state.actors.player!.position).toBe(porchId);
    expect(game.state.phase).toBe("exploration");

    act({ kind: "interaction", interactionId: insult.id });
    expect(game.state.phase).toBe("combat");

    for (let round = 0; round < 8 && game.state.actors[id]!.hp > 0; round++) {
      if (game.state.initiative!.order[game.state.cursor] !== "player") break;
      act({ kind: "attack", targetId: id, weaponId: sword.id }, () => 0.01);
    }

    expect(game.state.actors[id]!.hp).toBe(0);
    expect(game.state.phase).not.toBe("defeated");
  });

  it("keeps every step in the engine's own history with no step rolled for the player", () => {
    const { game } = buildScene();

    expect(game.history).toEqual([]);
    expect(game.state.attempts).toEqual([]);
    expect(game.state.revision).toBe(0);
  });
});
