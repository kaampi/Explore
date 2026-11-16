import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import {
  RulesetTemplateSchema,
  newCharacterTemplate,
  newRulesetTemplate,
  type CampaignTemplate,
} from "../../src/library/LibrarySchema";
import {
  DEFAULT_PLAYER_HEALTH,
  actorIdFor,
  addPerson,
  healthFor,
  setToughness,
  toughnessOf,
} from "../../src/library/sceneParts";
import { syncAdventure, type SceneLibrary } from "../../src/library/sceneSync";
import { startPlayableCampaign } from "../../src/session/adventureStart";

const strength = { id: "str", name: "Strength", kind: "number" as const, min: 1, max: 18 };

describe("health from a share of the player's", () => {
  it("gives 6, 12 and 20 when the player has 20", () => {
    expect(healthFor("weak", 20)).toBe(6);
    expect(healthFor("normal", 20)).toBe(12);
    expect(healthFor("tough", 20)).toBe(20);
  });

  it("follows a higher player health and never goes below 1", () => {
    expect(healthFor("weak", 100)).toBe(30);
    expect(healthFor("normal", 100)).toBe(60);
    expect(healthFor("tough", 100)).toBe(100);
    expect(healthFor("weak", 1)).toBe(1);
  });
});

describe("a rule-set's player health", () => {
  it("is optional and a whole number from 1 to 200", () => {
    const base = newRulesetTemplate({
      name: "Set",
      source: "player",
      attributes: [strength] as never,
    });

    expect(RulesetTemplateSchema.parse(base).playerHealth).toBeUndefined();
    expect(RulesetTemplateSchema.parse({ ...base, playerHealth: 60 }).playerHealth).toBe(60);
    for (const playerHealth of [0, 201, 12.5])
      expect(() => RulesetTemplateSchema.parse({ ...base, playerHealth })).toThrow();
  });
});

function setup(playerHealth?: number) {
  const built = connectedAdventureExample();
  const orla = newCharacterTemplate({ name: "Orla" });
  const set = newRulesetTemplate({
    name: "Set",
    source: "player",
    attributes: [strength] as never,
    ...(playerHealth !== undefined ? { playerHealth } : {}),
  });
  const library: SceneLibrary = {
    characters: [...built.characters, orla],
    objects: built.objects,
    places: built.places,
    rulesets: [set],
  };
  const campaign: CampaignTemplate = { ...structuredClone(built.campaign), rulesetId: set.id };
  campaign.scenes[0] = addPerson(campaign.scenes[0]!, orla);
  return { built, orla, set, library, campaign, orlaId: actorIdFor(orla.id) };
}

describe("health in the sync", () => {
  it("gives the player the set's health, in every scene", () => {
    const { library, campaign } = setup(60);

    const synced = syncAdventure(campaign, library);

    for (const scene of synced.scenes) {
      const player = scene.encounter!.state.actors.player!;
      expect(player).toMatchObject({ hp: 60, maxHp: 60 });
      expect(scene.encounter!.definition.rules.playerHealth).toBe(60);
    }
  });

  it("gives 20 when the set names none, and no health on the scene", () => {
    const { library, campaign } = setup();

    const scene = syncAdventure(campaign, library).scenes[0]!.encounter!;

    expect(scene.state.actors.player).toMatchObject({ hp: DEFAULT_PLAYER_HEALTH });
    expect(scene.definition.rules.playerHealth).toBeUndefined();
  });

  it("gives a person with a toughness their share, and follows a change of set", () => {
    const { library, campaign, orla, orlaId, set } = setup(60);
    campaign.scenes[0] = setToughness(campaign.scenes[0]!, orla.id, "normal");

    const first = syncAdventure(campaign, library);
    expect(first.scenes[0]!.encounter!.state.actors[orlaId]).toMatchObject({ maxHp: 36, hp: 36 });

    const again = syncAdventure(first, { ...library, rulesets: [{ ...set, playerHealth: 100 }] });
    expect(again.scenes[0]!.encounter!.state.actors[orlaId]).toMatchObject({ maxHp: 60, hp: 60 });
  });

  it("leaves a person with no toughness at the health the author gave", () => {
    const { library, campaign, orlaId } = setup(60);
    const actor = campaign.scenes[0]!.encounter!.state.actors[orlaId]!;
    actor.maxHp = 7;
    actor.hp = 7;

    const synced = syncAdventure(campaign, library);

    expect(synced.scenes[0]!.encounter!.state.actors[orlaId]).toMatchObject({ maxHp: 7, hp: 7 });
  });

  it("gives the same result when run twice", () => {
    const { library, campaign, orla } = setup(60);
    campaign.scenes[0] = setToughness(campaign.scenes[0]!, orla.id, "weak");
    const once = syncAdventure(campaign, library);

    expect(syncAdventure(once, library)).toEqual(once);
  });

  it("does not change health in an adventure with no set, no values and no scales", () => {
    const { library, campaign, orlaId } = setup(60);
    const plain: CampaignTemplate = {
      ...campaign,
      rulesetId: undefined as never,
      player: { ...campaign.player!, stats: {} },
    };
    delete (plain as { rulesetId?: string }).rulesetId;
    for (const scene of plain.scenes) scene.encounter!.definition.rules.attributes = [];
    plain.scenes[0]!.encounter!.state.actors.player!.hp = 17;
    plain.scenes[0]!.encounter!.state.actors.player!.maxHp = 17;

    const synced = syncAdventure(plain, library);

    expect(synced.scenes[0]!.encounter!.state.actors.player).toMatchObject({ hp: 17, maxHp: 17 });
    expect(synced.scenes[0]!.encounter!.state.actors[orlaId]!.maxHp).toBe(12);
  });
});

describe("toughness in the editor", () => {
  it("is kept on the person and sized by the scene's player health", () => {
    const { library, campaign, orla, orlaId } = setup(60);
    const synced = syncAdventure(campaign, library);

    const next = setToughness(synced.scenes[0]!, orla.id, "weak");

    const actor = next.encounter!.state.actors[orlaId]!;
    expect(actor).toMatchObject({ toughness: "weak", maxHp: 18, hp: 18 });
    expect(toughnessOf(actor)).toBe("weak");
  });

  it("is read from health for a person made before it was kept", () => {
    const { campaign, orlaId } = setup();
    const actor = campaign.scenes[0]!.encounter!.state.actors[orlaId]!;
    actor.maxHp = 12;

    expect(toughnessOf(actor)).toBe("normal");
    actor.maxHp = 15;
    expect(toughnessOf(actor)).toBeUndefined();
  });
});

describe("a game's health", () => {
  it("starts the player with the set's health", () => {
    const { built, library, campaign, set } = setup(60);
    const synced = syncAdventure(campaign, library);

    const session = startPlayableCampaign(
      synced,
      synced.scenes[0]!,
      built.places,
      "hp",
      [built.realm],
      {
        characters: library.characters,
        rulesets: [set],
      },
    );

    expect(session.encounter!.state.actors.player).toMatchObject({ hp: 60, maxHp: 60 });
  });

  it("refuses an adventure whose scenes disagree about the player's health", () => {
    const { built, library, campaign, set } = setup(60);
    const synced = syncAdventure(campaign, library);
    const split = structuredClone(synced);
    split.scenes[1]!.encounter!.definition.rules.playerHealth = 30;

    expect(() =>
      startPlayableCampaign(split, split.scenes[0]!, built.places, "split", [built.realm], {
        characters: library.characters,
        rulesets: [set],
      }),
    ).toThrow(/same attributes and player health/);
  });
});
