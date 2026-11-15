import { describe, expect, it } from "vitest";
import { sceneFormat } from "../../src/library/sceneFormat";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { emptyCampaignScene } from "../../src/library/LibrarySchema";

const someone = {
  characterId: "someone",
  position: "",
  mood: "calm",
  clothing: "",
  holding: "",
  trust: "20",
  familiarity: "10",
  tension: "5",
};

describe("sceneFormat", () => {
  it("calls a scene with an engine encounter playable", () => {
    const built = connectedAdventureExample();

    expect(sceneFormat(built.campaign.scenes[0]!)).toBe("playable");
  });

  it("calls an untouched new scene blank", () => {
    expect(sceneFormat(emptyCampaignScene())).toBe("blank");
  });

  it("calls a scene with people, in the older format, earlier", () => {
    const scene = { ...emptyCampaignScene(), people: [someone] };

    expect(sceneFormat(scene)).toBe("earlier");
  });

  it("calls a scene with only a place chosen blank, since it has nothing to start", () => {
    const scene = { ...emptyCampaignScene(), placeId: "p1" };

    expect(sceneFormat(scene)).toBe("blank");
  });
});
