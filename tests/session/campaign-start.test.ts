import { describe, it, expect } from "vitest";
import {
  campaignLandmarks,
  emptyCampaignScene,
  inferCampaignRealmId,
  newCampaignTemplate,
  parseCampaignTemplate,
  triggerWhenLabel
} from "@library/LibrarySchema";
import { sessionFromCampaignScene } from "@session/campaignStart";
import { exampleCharacterTemplate, examplePlaceTemplate, exampleRealmDunbaar } from "@library/exampleTemplates";
import { createSessionFromSetup } from "@session/createSession";
import { WHAT_NOW_STAY } from "@state/playerDestination";

describe("campaign templates", () => {
  it("round-trips a campaign with a scene Trigger", () => {
    const scene = {
      ...emptyCampaignScene(),
      placeId: "place-1",
      people: [{ characterId: "emma", position: "behind the bar", mood: "", clothing: "", holding: "", trust: "20", familiarity: "10", tension: "5" }],
      triggers: [
        {
          id: "t1",
          content: "Two strangers ask about a brooch.",
          keywords: ["brooch"],
          when: "return_to_bar" as const
        }
      ]
    };
    const campaign = newCampaignTemplate({
      name: "The Aurora Room",
      playerIntro: "A quiet bar.",
      startPrompt: "A hidden jazz bar.",
      placeIds: ["place-1"],
      people: [{ characterId: "emma", stats: {} }],
      scenes: [scene]
    });
    const loaded = parseCampaignTemplate(JSON.parse(JSON.stringify(campaign)));
    expect(loaded.scenes[0]?.triggers[0]?.content).toContain("brooch");
    expect(loaded.scenes[0]?.whatNowSets).toEqual([]);
    expect(triggerWhenLabel("return_to_bar")).toBe("You come back to the bar");
  });

  it("keeps a shelf lens and defaults missing character tags to empty", () => {
    const campaign = newCampaignTemplate({
      name: "Neon",
      lens: "Cyberpunk",
      scenes: [emptyCampaignScene()]
    });
    expect(parseCampaignTemplate(JSON.parse(JSON.stringify(campaign))).lens).toBe("Cyberpunk");
    expect(
      parseCampaignTemplate(
        JSON.parse(
          JSON.stringify(
            newCampaignTemplate({
              name: "Dunbaar",
              placeLens: "harbour",
              objectLens: "relic",
              scenes: [emptyCampaignScene()]
            })
          )
        )
      )
    ).toMatchObject({ placeLens: "harbour", objectLens: "relic" });
    expect(exampleCharacterTemplate().tags).toEqual([]);
    expect(examplePlaceTemplate().tags).toEqual([]);
  });

  it("includes every landmark in the campaign realm", () => {
    const aurora = examplePlaceTemplate();
    const cabin = { ...aurora, id: "cabin", name: "Old Woman's Cabin" };
    const campaign = newCampaignTemplate({
      name: "Dunbaar",
      realmId: aurora.realmId,
      scenes: [emptyCampaignScene()]
    });
    expect(campaignLandmarks(campaign, [aurora, cabin]).map((item) => item.id)).toEqual([aurora.id, "cabin"]);
    expect(inferCampaignRealmId({ realmId: undefined, placeIds: [aurora.id] }, [aurora])).toBe(aurora.realmId);
  });

  it("keeps a campaign whose stats were stored as numbers", () => {
    const campaign = newCampaignTemplate({
      name: "The Aurora Room",
      people: [{ characterId: "emma", stats: { safety: "40" } }],
      scenes: [emptyCampaignScene()]
    });
    const raw = JSON.parse(JSON.stringify(campaign)) as {
      people: { characterId: string; stats: Record<string, string | number> }[];
    };
    raw.people[0] = { characterId: "emma", stats: { safety: 40 } };
    expect(parseCampaignTemplate(raw).people[0]?.stats.safety).toBe("40");
  });

  it("keeps a player sheet on the campaign", () => {
    const campaign = newCampaignTemplate({
      name: "Dunbaar",
      player: { name: "Mats", appearance: "tall, dark hair", pronoun: "he", stats: { grit: "12" } },
      scenes: [emptyCampaignScene()]
    });
    const loaded = parseCampaignTemplate(JSON.parse(JSON.stringify(campaign)));
    expect(loaded.player?.name).toBe("Mats");
    expect(loaded.player?.appearance).toContain("tall");
    expect(loaded.player?.pronoun).toBe("he");
    expect(loaded.player?.stats.grit).toBe("12");
  });
});

describe("sessionFromCampaignScene", () => {
  it("copies Triggers onto the session as once-beats and keeps the player intro off the prompt", () => {
    const place = examplePlaceTemplate();
    const emma = exampleCharacterTemplate();
    const campaign = newCampaignTemplate({
      name: "The Aurora Room",
      playerIntro: "Stay as long as you like.",
      startPrompt: "A hidden jazz bar in a quiet city.",
      worldPremise: "An ancient city with many factions.",
      realmId: place.realmId,
      people: [{ characterId: emma.id, stats: {} }],
      scenes: [
        {
          ...emptyCampaignScene(),
          placeId: place.id,
          people: [
            {
              characterId: emma.id,
              position: "behind the bar",
              mood: "reserved",
              clothing: "an apron",
              holding: "",
              trust: "20",
              familiarity: "10",
              tension: "5"
            }
          ],
          triggers: [
            {
              id: "hunters",
              content: "Two strangers enter and ask who showed a brooch.",
              keywords: ["brooch"],
              when: "return_to_bar"
            }
          ],
          whatNow: [
            { id: "wn1", label: "Go with Emma to her room", room: "Emma's room" },
            { id: "wn2", label: "", room: "cellar" },
            { id: "wn3", label: "I tell her the truth", room: "" }
          ],
          whatNowKeywords: ["last call", "tired"]
        }
      ]
    });
    const result = sessionFromCampaignScene(
      {
        campaign,
        scene: campaign.scenes[0]!,
        places: [place],
        realms: [exampleRealmDunbaar()],
        characters: [emma],
        objects: [],
        voices: [],
        rulesets: []
      },
      "camp-1"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.scene?.realm).toBe("City of Dunbaar");
    expect(result.session.scene?.realmNote).toBe("A quiet city. Hidden rooms sit behind ordinary doors.");
    expect(result.session.campaignIntro).toBe("Stay as long as you like.");
    expect(result.session.campaignId).toBe(campaign.id);
    expect(result.session.sceneId).toBe(campaign.scenes[0]!.id);
    expect(result.session.storyline?.premise).toContain("hidden jazz bar");
    expect(result.session.story?.premise).toContain("ancient city");
    const once = result.session.layers.find((layer) => layer.once);
    expect(once?.content).toContain("Two strangers");
    expect(once?.keywords).toEqual(["brooch"]);
    expect(once?.trigger).toBe("return_to_bar");
    expect(once?.active).toBe(true);
    expect(result.session.characters.emma?.position.value).toBe("behind the bar");
    expect(result.session.whatNow).toBeUndefined();
    expect(result.session.whatNowOpen).toBe(false);
    expect(result.session.whatNowSets).toEqual([
      {
        id: `${campaign.scenes[0]!.id}-replies`,
        keywords: ["last call", "tired"],
        choices: [
          { id: "wn1", label: "Go with Emma to her room", room: "Emma's room" },
          { id: "wn3", label: "I tell her the truth", room: WHAT_NOW_STAY }
        ]
      }
    ]);
    expect(result.session.player.position.value).toBe(place.name);
  });

  it("copies the campaign player sheet onto the session", () => {
    const place = examplePlaceTemplate();
    const emma = exampleCharacterTemplate();
    const campaign = newCampaignTemplate({
      name: "Dunbaar",
      player: {
        name: "Mats",
        appearance: "tall, dark hair",
        personality: "curious",
        pronoun: "he",
        stats: { grit: "12" }
      },
      realmId: place.realmId,
      people: [{ characterId: emma.id, stats: {} }],
      scenes: [
        {
          ...emptyCampaignScene(),
          placeId: place.id,
          people: [
            {
              characterId: emma.id,
              position: "behind the bar",
              mood: "",
              clothing: "",
              holding: "",
              trust: "",
              familiarity: "",
              tension: ""
            }
          ]
        }
      ]
    });
    const result = sessionFromCampaignScene(
      {
        campaign,
        scene: campaign.scenes[0]!,
        places: [place],
        realms: [exampleRealmDunbaar()],
        characters: [emma],
        objects: [],
        voices: [],
        rulesets: []
      },
      "camp-you"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.player?.name).toBe("Mats");
    expect(result.session.player?.appearance).toBe("tall, dark hair");
    expect(result.session.player?.personality).toBe("curious");
    expect(result.session.player?.pronoun).toBe("he");
    expect(result.session.player?.stats?.grit).toBe("12");
  });

  it("starts the player in a focal when Starts at is a listed room", () => {
    const place = examplePlaceTemplate();
    const emma = exampleCharacterTemplate();
    const campaign = newCampaignTemplate({
      name: "The Aurora Room",
      realmId: place.realmId,
      people: [{ characterId: emma.id, stats: {} }],
      scenes: [
        {
          ...emptyCampaignScene(),
          placeId: place.id,
          startRoomId: "room-emmas",
          people: [
            {
              characterId: emma.id,
              position: "by the bed",
              mood: "quiet",
              clothing: "",
              holding: "",
              trust: "20",
              familiarity: "10",
              tension: "5"
            }
          ]
        }
      ]
    });
    const result = sessionFromCampaignScene(
      {
        campaign,
        scene: campaign.scenes[0]!,
        places: [place],
        characters: [emma],
        objects: [],
        voices: [],
        rulesets: []
      },
      "camp-room"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.player.position.value).toBe("Emma's room");
    expect(result.session.scene?.location).toBe(place.name);
  });

  it("copies a scene handoff onto the session as trusted arrival fact", () => {
    const place = examplePlaceTemplate();
    const emma = exampleCharacterTemplate();
    const campaign = newCampaignTemplate({
      name: "The Aurora Room",
      realmId: place.realmId,
      people: [{ characterId: emma.id, stats: {} }],
      scenes: [
        {
          ...emptyCampaignScene(),
          placeId: place.id,
          startRoomId: "room-emmas",
          people: [
            {
              characterId: emma.id,
              position: "by the bed",
              mood: "quiet",
              clothing: "",
              holding: "",
              trust: "20",
              familiarity: "10",
              tension: "5"
            }
          ]
        }
      ]
    });
    const result = sessionFromCampaignScene(
      {
        campaign,
        scene: campaign.scenes[0]!,
        places: [place],
        characters: [emma],
        objects: [],
        voices: [],
        rulesets: [],
        handoff: "He asked to sleep. No sex."
      },
      "camp-handoff"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.handoff).toBe("He asked to sleep. No sex.");
  });

  it("copies campaign-member lore onto the session, not the archive card", () => {
    const place = examplePlaceTemplate();
    const emma = exampleCharacterTemplate();
    const campaign = newCampaignTemplate({
      name: "The Aurora Room",
      realmId: place.realmId,
      people: [
        {
          characterId: emma.id,
          stats: {},
          lore: [
            {
              id: "ring",
              title: "The ring",
              content: "She keeps a plain gold band in her apron pocket.",
              keywords: ["ring", "gold band"]
            }
          ]
        }
      ],
      scenes: [
        {
          ...emptyCampaignScene(),
          placeId: place.id,
          people: [
            {
              characterId: emma.id,
              position: "behind the bar",
              mood: "reserved",
              clothing: "",
              holding: "",
              trust: "20",
              familiarity: "10",
              tension: "5"
            }
          ]
        }
      ]
    });
    const result = sessionFromCampaignScene(
      {
        campaign,
        scene: campaign.scenes[0]!,
        places: [place],
        characters: [{ ...emma, lore: [] }],
        objects: [],
        voices: [],
        rulesets: []
      },
      "camp-lore"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "layer-lore-emma-ring",
          content: "The ring\n\nShe keeps a plain gold band in her apron pocket.",
          keywords: ["ring", "gold band"],
          type: "core",
          active: true
        })
      ])
    );
  });

  it("refuses to start without a place or people", () => {
    const campaign = newCampaignTemplate({
      name: "Empty",
      scenes: [emptyCampaignScene()]
    });
    const result = sessionFromCampaignScene(
      {
        campaign,
        scene: campaign.scenes[0]!,
        places: [],
        characters: [],
        objects: [],
        voices: [],
        rulesets: []
      },
      "camp-2"
    );
    expect(result.ok).toBe(false);
  });
});

describe("createSession once-beats", () => {
  it("skips a Trigger with no already-in-play words", () => {
    const session = createSessionFromSetup(
      {
        location: "Bar",
        lighting: "",
        noise: "",
        music: false,
        placeNote: "",
        characters: [{ name: "Emma", personality: "Dry.", mood: "reserved", position: "behind the bar" }],
        onceBeats: [{ content: "Bandits.", keywords: [] }]
      },
      "once-skip"
    );
    expect(session.layers.some((layer) => layer.once)).toBe(false);
  });
});

