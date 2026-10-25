import { describe, expect, it } from "vitest";
import { newCharacterTemplate } from "@library/LibrarySchema";
import {
  exampleCharacterTemplate,
  examplePlaceTemplate,
  exampleRealmDunbaar,
  exampleFantasyRuleset,
  exampleFreighterVoice,
} from "@library/exampleTemplates";
import { quickCharacterSession } from "../../src/ui/home/quickStart";

describe("start from a character", () => {
  it("copies optional voice and rules into a fresh scene with neutral numeric traits, without changing library cards", () => {
    const character = exampleCharacterTemplate(), place = examplePlaceTemplate(), realm = exampleRealmDunbaar();
    const ruleset = exampleFantasyRuleset(), voice = exampleFreighterVoice();
    const before = structuredClone({ character, place, realm, ruleset, voice });
    const session = quickCharacterSession(character, "configured", { place, realm, ruleset, voice });
    expect(session.ruleset?.name).toBe(ruleset.name);
    expect(session.voice).toEqual({ title: voice.name, instruction: voice.instruction });
    expect(session.characters.emma?.stats?.strength?.value).toBe(10);
    expect(session.player?.stats?.strength).toBe("10");
    expect(session.scene?.placeId).toBe(place.id);
    expect(session.story).toBeUndefined();
    expect(session.campaignId).toBeUndefined();
    expect({ character, place, realm, ruleset, voice }).toEqual(before);
    ruleset.attributes[0]!.name = "Edited later";
    voice.instruction = "Edited later";
    expect(session.ruleset?.attributes[0]?.name).toBe(before.ruleset.attributes[0]?.name);
    expect(session.voice?.instruction).toBe(before.voice.instruction);
    const plain = quickCharacterSession(character, "plain");
    expect(plain.ruleset).toBeUndefined(); expect(plain.voice).toBeUndefined(); expect(plain.scene?.placeId).toBeUndefined();
  });
  it("starts a real session without a campaign, place card, story, or rule-set", () => {
    const character = newCharacterTemplate({
      name: "Ari",
      personality: "A curious archivist.",
      lore: [
        {
          id: "note",
          title: "Home",
          content: "Ari grew up in Windfall.",
          keywords: ["Windfall"],
        },
      ],
    });
    const session = quickCharacterSession(character, "chat");
    expect(Object.keys(session.characters)).toEqual(["ari"]);
    expect(session.campaignId).toBeUndefined();
    expect(session.scene?.placeId).toBeUndefined();
    expect(session.ruleset).toBeUndefined();
    expect(session.story).toBeUndefined();
    expect(
      session.layers.some((layer) =>
        layer.content.includes("Ari grew up in Windfall"),
      ),
    ).toBe(true);
    expect(session.conversation).toEqual([]);
    expect(character.position).toBe("");
  });
  it("can use a real place and its visuals without changing the source cards", () => {
    const character = exampleCharacterTemplate(),
      place = examplePlaceTemplate(),
      realm = exampleRealmDunbaar();
    const before = JSON.stringify({ character, place, realm });
    const session = quickCharacterSession(character, "chat", {
      place,
      realm,
      model: "chosen-model",
    });
    expect(session.scene?.placeId).toBe(place.id);
    expect(session.scene?.location).toBe(place.name);
    expect(session.scene?.realm).toBe(realm.name);
    expect(session.runtime.model).toBe("chosen-model");
    expect(JSON.stringify({ character, place, realm })).toBe(before);
  });
});
