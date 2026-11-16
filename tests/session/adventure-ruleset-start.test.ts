import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { newRulesetTemplate, type CampaignTemplate } from "../../src/library/LibrarySchema";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { syncAdventure } from "../../src/library/sceneSync";
import { parseSession } from "../../src/state/StateSchema";
import { statName } from "../../src/game/narration";
import { encounterCombatLog } from "../../src/ui/components/CombatLog";
import { innVisitExample } from "../../src/scenarios/innVisit";

const strength = {
  id: "str",
  name: "Strength",
  kind: "number" as const,
  min: 1,
  max: 18,
  highMeaning: "Strong.",
  lowMeaning: "Weak.",
};
const mood = { id: "mood", name: "Mood", kind: "text" as const, options: ["Calm", "Wary"] };

function setup() {
  const built = connectedAdventureExample();
  const set = newRulesetTemplate({
    name: "Classic",
    source: "player",
    attributes: [strength, mood] as never,
  });
  const campaign: CampaignTemplate = {
    ...structuredClone(built.campaign),
    rulesetId: set.id,
    player: { ...built.campaign.player!, stats: { str: "14" } },
  };
  const library = {
    characters: built.characters,
    objects: built.objects,
    places: built.places,
    rulesets: [set],
  };
  const synced = syncAdventure(campaign, library);
  return { built, set, synced };
}

describe("starting a game with a rule-set", () => {
  it("gives the game the set's name and all its attributes, text ones too", () => {
    const { built, set, synced } = setup();

    const session = startPlayableCampaign(
      synced,
      synced.scenes[0]!,
      built.places,
      "start",
      [built.realm],
      {
        characters: built.characters,
        rulesets: [set],
      },
    );

    expect(session.ruleset?.name).toBe("Classic");
    expect(session.ruleset?.attributes.map((a) => a.id)).toEqual(["str", "mood"]);
    expect(session.ruleset?.attributes[0]).toMatchObject({ highMeaning: "Strong." });
  });

  it("gives the player's value as written on the sheet, not as a chance", () => {
    const { built, set, synced } = setup();

    const session = startPlayableCampaign(
      synced,
      synced.scenes[0]!,
      built.places,
      "start",
      [built.realm],
      {
        characters: built.characters,
        rulesets: [set],
      },
    );

    expect(session.encounter!.state.actors.player!.stats.str).toBe(14);
    expect(session.player?.stats).toMatchObject({ str: "14" });
  });

  it("keeps its own copy: later changes to the set do not reach a game that has begun", () => {
    const { built, set, synced } = setup();
    const library = [set];
    const session = startPlayableCampaign(
      synced,
      synced.scenes[0]!,
      built.places,
      "start",
      [built.realm],
      {
        characters: built.characters,
        rulesets: library,
      },
    );

    library[0] = { ...set, name: "Renamed", attributes: [] };

    expect(session.ruleset?.name).toBe("Classic");
    expect(session.ruleset?.attributes).toHaveLength(2);
  });

  it("uses the basic set's name when there are scales but no saved set", () => {
    const { built, synced } = setup();

    const session = startPlayableCampaign(
      synced,
      synced.scenes[0]!,
      built.places,
      "start",
      [built.realm],
      {
        characters: built.characters,
        rulesets: [],
      },
    );

    expect(session.ruleset?.name).toBe("Basic");
  });

  it("plays an adventure with no set and no scales as it always has", () => {
    const inn = innVisitExample();
    const plain = {
      ...inn.campaign,
      player: { ...inn.campaign.player!, stats: {} },
      scenes: inn.campaign.scenes.map((scene) => {
        const copy = structuredClone(scene);
        copy.encounter!.definition.rules.attributes = [];
        return copy;
      }),
    };

    const session = startPlayableCampaign(plain, plain.scenes[0]!, inn.places, "plain", [
      inn.realm,
    ]);

    expect(session.ruleset).toEqual({ name: "Adventure · d100", attributes: [] });
  });

  it("opens an older saved game that has the old fixed set", () => {
    const { built, synced } = setup();
    const session = startPlayableCampaign(synced, synced.scenes[0]!, built.places, "old", [
      built.realm,
    ]);
    const older = JSON.parse(JSON.stringify(session));
    older.ruleset = { name: "Adventure · d100", attributes: [] };
    delete older.adventure.cast;
    delete older.adventure.narration;

    const loaded = parseSession(older);

    expect(loaded.ruleset?.name).toBe("Adventure · d100");
    expect(loaded.encounter!.definition.rules.attributes).toHaveLength(1);
  });
});

describe("showing a skill by name", () => {
  it("shows the name for an id the scene knows, and the id for one it does not", () => {
    const { synced } = setup();
    const d = synced.scenes[0]!.encounter!.definition;

    expect(statName(d, "str")).toBe("Strength");
    expect(statName(d, "Observation")).toBe("Observation");
    expect(statName(d, "unknown")).toBe("unknown");
  });

  it("is used in the combat log", () => {
    const { synced } = setup();
    const game = structuredClone(synced.scenes[0]!.encounter!);
    game.history.push({
      id: "h1",
      revision: 1,
      label: "Attack",
      text: "",
      combat: true,
      checks: [
        { actorId: "player", stat: "str", roll: 20, target: 76, degree: "success", round: 1 },
      ],
      events: [],
      turns: [],
    });

    const log = encounterCombatLog(game);

    expect(log[0]!.checks[0]!.stat).toBe("Strength");
  });
});
