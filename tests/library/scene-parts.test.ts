import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { newCharacterTemplate, newObjectTemplate } from "../../src/library/LibrarySchema";
import {
  actorIdFor,
  addPerson,
  itemsHere,
  peopleHere,
  placeItem,
  removeItem,
  removePerson,
} from "../../src/library/sceneParts";
import { validateEncounter } from "../../src/game/EncounterEngine";

function setup() {
  const built = connectedAdventureExample();
  const scene = structuredClone(built.campaign.scenes[0]!);
  const edda = built.characters[0]!;
  const orla = newCharacterTemplate({ name: "Orla" });
  const lamp = newObjectTemplate({
    name: "Brass lamp",
    note: "It still holds oil.",
    source: "player",
    tags: [],
  });
  return { built, scene, edda, orla, lamp, key: built.objects[0]! };
}

describe("people in a scene", () => {
  it("puts a person where the player starts and keeps the scene valid", () => {
    const { scene, orla } = setup();

    const next = addPerson(scene, orla);

    const actor = next.encounter!.state.actors[actorIdFor(orla.id)]!;
    expect(actor.name).toBe("Orla");
    expect(actor.team).toBe("residents");
    expect(actor.position).toBe(next.encounter!.state.actors.player!.position);
    expect(next.people.map((p) => p.characterId)).toContain(orla.id);
    expect(() => validateEncounter(next.encounter!)).not.toThrow();
  });

  it("does not change the scene it was given", () => {
    const { scene, orla } = setup();
    const before = structuredClone(scene);

    addPerson(scene, orla);

    expect(scene).toEqual(before);
  });

  it("will not add the same person twice", () => {
    const { scene, orla } = setup();
    const once = addPerson(scene, orla);

    expect(() => addPerson(once, orla)).toThrow(/already here/);
  });

  it("lets a person who is not part of any action be removed again", () => {
    const { scene, orla } = setup();
    const next = removePerson(addPerson(scene, orla), orla.id);

    expect(peopleHere(next).map((p) => p.name)).not.toContain("Orla");
    expect(next.people.map((p) => p.characterId)).not.toContain(orla.id);
  });

  it("refuses to remove someone an action is about, and says which action", () => {
    const { scene, edda } = setup();

    expect(() => removePerson(scene, edda.id)).toThrow(/Ask Edda about the messenger/);
    expect(peopleHere(scene).map((p) => p.name)).toContain("Edda");
  });

  it("refuses to remove someone who is carrying an item", () => {
    const { scene, orla, lamp } = setup();
    const withOrla = addPerson(scene, orla);
    const carrying = placeItem(withOrla, lamp, { heldBy: actorIdFor(orla.id) });

    expect(() => removePerson(carrying, orla.id)).toThrow(/carrying/);
  });
});

describe("items in a scene", () => {
  it("puts an item on a position and lists it", () => {
    const { scene, lamp } = setup();

    const next = placeItem(scene, lamp, { position: "here" });

    expect(itemsHere(next)).toContainEqual({ itemId: lamp.id, where: { position: "here" } });
    expect(next.objectIds).toContain(lamp.id);
    expect(next.encounter!.definition.items.find((i) => i.id === lamp.id)?.name).toBe("Brass lamp");
  });

  it("puts an item in someone's hands", () => {
    const { scene, lamp, edda } = setup();

    const next = placeItem(scene, lamp, { heldBy: actorIdFor(edda.id) });

    expect(itemsHere(next)).toContainEqual({
      itemId: lamp.id,
      where: { heldBy: actorIdFor(edda.id) },
    });
  });

  it("keeps an item in one place when it is moved", () => {
    const { scene, lamp, edda } = setup();
    const onFloor = placeItem(scene, lamp, { position: "here" });

    const inHands = placeItem(onFloor, lamp, { heldBy: actorIdFor(edda.id) });

    expect(itemsHere(inHands).filter((entry) => entry.itemId === lamp.id)).toHaveLength(1);
    expect(inHands.encounter!.state.itemLocations[lamp.id]).toBeUndefined();
  });

  it("refuses a position that is not in the scene and leaves the scene alone", () => {
    const { scene, lamp } = setup();
    const before = structuredClone(scene);

    expect(() => placeItem(scene, lamp, { position: "nowhere" })).toThrow(/not in this scene/);
    expect(scene).toEqual(before);
  });

  it("refuses a holder who is not in the scene", () => {
    const { scene, lamp } = setup();

    expect(() => placeItem(scene, lamp, { heldBy: "npc:ghost" })).toThrow(/not in this scene/);
  });

  it("removes an item nothing depends on", () => {
    const { scene, lamp } = setup();
    const next = removeItem(placeItem(scene, lamp, { position: "here" }), lamp.id);

    expect(itemsHere(next).map((entry) => entry.itemId)).not.toContain(lamp.id);
    expect(next.objectIds).not.toContain(lamp.id);
  });

  it("refuses to remove an item an action takes", () => {
    const { scene, lamp } = setup();
    const placed = placeItem(scene, lamp, { position: "here" });
    const take = structuredClone(placed);
    take.encounter!.definition.interactions.push({
      ...take.encounter!.definition.interactions[0]!,
      id: "take-lamp",
      label: "Take the lamp",
      counterpartyId: undefined as never,
      success: {
        text: "You take it.",
        effects: [{ kind: "take-item", itemId: lamp.id }],
      },
    });

    expect(() => removeItem(take, lamp.id)).toThrow(/Take the lamp/);
  });
});

describe("any sequence of operations", () => {
  it("either gives a valid scene or throws and changes nothing", () => {
    const { scene: start, edda, lamp, key } = setup();
    const others = [newCharacterTemplate({ name: "Orla" }), newCharacterTemplate({ name: "Pell" })];
    const people = [edda, ...others];
    const things = [lamp, key];
    const operation = fc.oneof(
      fc.record({ kind: fc.constant("add" as const), i: fc.nat(2) }),
      fc.record({ kind: fc.constant("remove" as const), i: fc.nat(2) }),
      fc.record({ kind: fc.constant("place" as const), i: fc.nat(1), at: fc.nat(3) }),
      fc.record({ kind: fc.constant("drop" as const), i: fc.nat(1) }),
    );
    fc.assert(
      fc.property(fc.array(operation, { maxLength: 12 }), (steps) => {
        let scene = start;
        for (const step of steps) {
          const before = structuredClone(scene);
          try {
            if (step.kind === "add") scene = addPerson(scene, people[step.i]!);
            else if (step.kind === "remove") scene = removePerson(scene, people[step.i]!.id);
            else if (step.kind === "drop") scene = removeItem(scene, things[step.i]!.id);
            else {
              const holders = peopleHere(scene).map((p) => p.id);
              const where =
                step.at === 0 || holders.length === 0
                  ? { position: "here" }
                  : { heldBy: holders[step.at % holders.length]! };
              scene = placeItem(scene, things[step.i]!, where);
            }
          } catch {
            expect(scene).toEqual(before);
          }
          expect(() => validateEncounter(scene.encounter!)).not.toThrow();
        }
      }),
      { numRuns: 60 },
    );
  });
});
