import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { emmaInnExample } from "../../src/scenarios/emmaInn";
import { newCharacterTemplate, type CampaignTemplate } from "../../src/library/LibrarySchema";
import { syncAdventure, syncScene, type SceneLibrary } from "../../src/library/sceneSync";
import { actorIdFor, addPerson, placeItem, removePerson } from "../../src/library/sceneParts";
import { storyboardWarnings } from "../../src/ui/studio/storyboardReadiness";
import { adventureFacts } from "../../src/library/playableCampaign";

function connected() {
  const built = connectedAdventureExample();
  const library: SceneLibrary = {
    characters: built.characters,
    objects: built.objects,
    places: built.places,
  };
  return { built, library, campaign: structuredClone(built.campaign) };
}

/** What the author sets, and what the engine reads for movement, doors and conversations. */
function authored(campaign: CampaignTemplate) {
  return campaign.scenes.map((scene) => ({
    interactions: scene.encounter?.definition.interactions,
    barriers: scene.encounter?.state.barriers,
    itemLocations: scene.encounter?.state.itemLocations,
    places: scene.encounter?.definition.places,
    connections: scene.encounter?.definition.connections,
  }));
}

describe("syncAdventure", () => {
  it("gives the same result when run twice", () => {
    const { library, campaign } = connected();

    const once = syncAdventure(campaign, library);
    const twice = syncAdventure(once, library);

    expect(twice).toEqual(once);
  });

  it("leaves what the author set untouched in the bundled adventures", () => {
    const inn = innVisitExample();
    const emmaCard = newCharacterTemplate({ name: "Emma", familyName: "Blossom" });
    const common = inn.realm.worldMap!.nodes.find((node) => node.name === "Common room")!;
    const bedroom = inn.realm.worldMap!.nodes.find((node) => node.name === "Guest room")!;
    const emma = emmaInnExample(inn.realm, inn.places, emmaCard, common.id, bedroom.id);
    const messenger = connectedAdventureExample();
    const cases: [CampaignTemplate, SceneLibrary][] = [
      [
        messenger.campaign,
        { characters: messenger.characters, objects: messenger.objects, places: messenger.places },
      ],
      [inn.campaign, { characters: [], objects: [], places: inn.places }],
      [emma, { characters: [emmaCard], objects: [], places: inn.places }],
    ];

    for (const [campaign, library] of cases) {
      const synced = syncAdventure(campaign, library);
      expect(authored(synced)).toEqual(authored(campaign));
    }
  });

  it("shows a renamed person in the scene", () => {
    const { library, campaign, built } = connected();
    const renamed = { ...built.characters[0]!, name: "Edda the Elder" };

    const synced = syncAdventure(campaign, { ...library, characters: [renamed] });

    expect(synced.scenes[0]!.encounter!.state.actors[actorIdFor(renamed.id)]!.name).toBe(
      "Edda the Elder",
    );
  });

  it("shows a changed player name and value in every scene", () => {
    const { library, campaign } = connected();
    campaign.player = {
      name: "Mira",
      stats: { Observation: "72" },
      personality: "",
      appearance: "",
    };

    const synced = syncAdventure(campaign, library);

    for (const scene of synced.scenes) {
      const player = scene.encounter!.state.actors.player!;
      expect(player.name).toBe("Mira");
      expect(player.stats.Observation).toBe(72);
    }
  });

  it("shows a person's value from the Cast", () => {
    const { library, campaign, built } = connected();
    const id = built.characters[0]!.id;
    campaign.people = campaign.people.map((p) =>
      p.characterId === id ? { ...p, stats: { Persuasion: "35", Notes: "text" } } : p,
    );

    const synced = syncAdventure(campaign, library);

    const edda = synced.scenes[0]!.encounter!.state.actors[actorIdFor(id)]!;
    expect(edda.stats.Persuasion).toBe(35);
    expect(edda.stats.Notes).toBeUndefined();
  });

  it("shows changed texts on a thing", () => {
    const { library, campaign } = connected();
    const key = { ...library.objects[0]!, name: "Old iron key", note: "Cold to the touch." };

    const synced = syncAdventure(campaign, { ...library, objects: [key] });

    const item = synced.scenes[0]!.encounter!.definition.items.find((i) => i.id === key.id)!;
    expect(item).toMatchObject({ name: "Old iron key", description: "Cold to the touch." });
  });

  it("keeps the last details when a card is gone, and warns", () => {
    const { library, campaign, built } = connected();
    const id = built.characters[0]!.id;

    const synced = syncAdventure(campaign, { ...library, characters: [] });
    const warnings = storyboardWarnings(
      synced,
      new Set(adventureFacts(synced).map((fact) => fact.id)),
      { characters: [], objects: library.objects },
    );

    expect(synced.scenes[0]!.encounter!.state.actors[actorIdFor(id)]!.name).toBe("Edda");
    expect(warnings.some((w) => w.message.includes("Edda") && w.message.includes("no card"))).toBe(
      true,
    );
  });

  it("does not warn when the cards exist", () => {
    const { library, campaign } = connected();

    const warnings = storyboardWarnings(
      campaign,
      new Set(adventureFacts(campaign).map((fact) => fact.id)),
      library,
    );

    expect(warnings.some((w) => w.message.includes("no card"))).toBe(false);
  });

  it("does not touch where a person stands, their side or their health", () => {
    const { library, campaign, built } = connected();
    const id = actorIdFor(built.characters[0]!.id);
    const actor = campaign.scenes[0]!.encounter!.state.actors[id]!;
    actor.team = "guards";
    actor.maxHp = 33;
    actor.hp = 33;

    const synced = syncAdventure(campaign, library);

    expect(synced.scenes[0]!.encounter!.state.actors[id]).toMatchObject({
      team: "guards",
      maxHp: 33,
      hp: 33,
      position: actor.position,
    });
  });

  it("puts a library scene back at its start", () => {
    const { library, campaign } = connected();
    const game = campaign.scenes[0]!.encounter!;
    game.state.revision = 4;
    game.state.attempts = ["something"];
    game.state.phase = "complete";

    const synced = syncScene(campaign, campaign.scenes[0]!, library);

    expect(synced.encounter!.state).toMatchObject({
      revision: 0,
      attempts: [],
      phase: "exploration",
    });
    expect(synced.encounter!.history).toEqual([]);
  });

  it("leaves scenes in the earlier format alone", () => {
    const { library, campaign } = connected();
    const older = {
      ...campaign.scenes[0]!,
      id: "older",
      encounter: undefined,
      people: [{ ...campaign.scenes[0]!.people[0]! }],
    };
    const mixed = { ...campaign, scenes: [...campaign.scenes, older as never] };

    const synced = syncAdventure(mixed, library);

    expect(synced.scenes.at(-1)).toBe(mixed.scenes.at(-1));
  });

  it("gives a valid, stable scene after any sequence of part changes", () => {
    const { library, campaign, built } = connected();
    const orla = newCharacterTemplate({ name: "Orla" });
    const cards = { ...library, characters: [...library.characters, orla] };
    const operation = fc.constantFrom("add", "remove", "place", "sync");
    fc.assert(
      fc.property(fc.array(operation, { maxLength: 10 }), (steps) => {
        let scene = campaign.scenes[0]!;
        for (const step of steps) {
          try {
            if (step === "add") scene = addPerson(scene, orla);
            if (step === "remove") scene = removePerson(scene, orla.id);
            if (step === "place") scene = placeItem(scene, built.objects[0]!, { position: "here" });
            if (step === "sync") scene = syncScene(campaign, scene, cards);
          } catch {
            // A refused change leaves the scene as it was.
          }
        }
        const once = syncScene(campaign, scene, cards);
        expect(syncScene(campaign, once, cards)).toEqual(once);
      }),
      { numRuns: 40 },
    );
  });
});
