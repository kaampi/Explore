import { describe, it, expect } from "vitest";
import {
  createSessionFromSetup,
  slugifyCharacterId,
  displayCharacterName,
  primaryCharacter
} from "@session/createSession";

describe("createSessionFromSetup", () => {
  it("builds a valid session with slug ids, display names, and core layers", () => {
    const session = createSessionFromSetup(
      {
        location: "A kitchen at 2am",
        lighting: "fridge light",
        noise: "rain",
        music: false,
        placeNote: "Everyone talks quieter here.",
        characters: [
          {
            name: "Dr. Chen",
            personality: "Precise, tired, still kind.",
            mood: "weary",
            position: "at the table"
          },
          { name: "", personality: "ignored", mood: "", position: "" }
        ]
      },
      "scene-1"
    );

    expect(session.id).toBe("scene-1");
    expect(session.runtime.model).toBe("stheno-custom:latest");
    expect(session.scene?.location).toBe("A kitchen at 2am");
    expect(session.characters["dr-chen"]?.name).toBe("Dr. Chen");
    expect(session.characters["dr-chen"]?.mood.value).toBe("weary");
    expect(session.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "core", content: "Precise, tired, still kind.", active: true }),
        expect.objectContaining({ type: "environment", content: "Everyone talks quieter here." })
      ])
    );
    expect(primaryCharacter(session)).toEqual({ id: "dr-chen", name: "Dr. Chen" });
  });

  it("adds how they speak to the core layer", () => {
    const session = createSessionFromSetup(
      {
        location: "A bar",
        lighting: "",
        noise: "",
        music: false,
        placeNote: "",
        characters: [
          {
            name: "Inez",
            personality: "Slow to offer anything personal.",
            speech: "Speech is clipped. Few words, and no padding.",
            mood: "wary",
            position: "here"
          }
        ]
      },
      "scene-speech"
    );
    expect(session.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "core",
          content: "Slow to offer anything personal.\n\nHow they speak: Speech is clipped. Few words, and no padding."
        })
      ])
    );
  });

  it("attaches an optional ground story without turning it into a place note", () => {
    const session = createSessionFromSetup(
      {
        location: "Bag End",
        lighting: "firelight",
        noise: "",
        music: false,
        placeNote: "A round green door.",
        storyTitle: "The War of the Ring",
        storyPremise:
          "In the Second Age, the Dark Lord Sauron secretly forged the One Ring in order to control all the other Rings of Power.",
        characters: [{ name: "Frodo", personality: "Kind, reluctant.", mood: "uneasy", position: "by the hearth" }]
      },
      "lotr-1"
    );

    expect(session.story).toEqual({
      title: "The War of the Ring",
      premise:
        "In the Second Age, the Dark Lord Sauron secretly forged the One Ring in order to control all the other Rings of Power."
    });
    expect(session.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "environment", content: "A round green door." })
      ])
    );
    expect(session.layers.some((layer) => layer.content.includes("Sauron"))).toBe(false);
  });

  it("attaches keyword-gated place lore without making it always-on placeNote", () => {
    const session = createSessionFromSetup(
      {
        location: "The Aurora Room",
        lighting: "",
        noise: "",
        music: true,
        placeNote: "",
        placeLore: [
          {
            content: "A locked cellar door sits behind the bar.",
            keywords: ["cellar", "källare"]
          }
        ],
        characters: [{ name: "Emma", personality: "Dry.", mood: "reserved", position: "behind the bar" }]
      },
      "aurora-1"
    );

    const lore = session.layers.find((layer) => layer.content.includes("cellar door"));
    expect(lore).toMatchObject({
      type: "environment",
      active: true,
      keywords: ["cellar", "källare"]
    });
  });

  it("stores the model and narrator instruction separately from the ground story", () => {
    const session = createSessionFromSetup(
      {
        location: "Bag End",
        lighting: "",
        noise: "",
        music: false,
        placeNote: "",
        storyTitle: "The War of the Ring",
        storyPremise: "The Ring must go to the fire.",
        voiceTitle: "Tolkien-äventyr",
        voiceInstruction: "Du är Spelledare. Berättarrösten är storslagen.",
        model: "stheno:latest",
        characters: [{ name: "Frodo", personality: "", mood: "", position: "" }]
      },
      "lotr-2"
    );

    expect(session.runtime.model).toBe("stheno:latest");
    expect(session.voice).toEqual({
      title: "Tolkien-äventyr",
      instruction: "Du är Spelledare. Berättarrösten är storslagen."
    });
    expect(session.story?.premise).toContain("Ring");
  });

  it("attaches a campaign rule-set and character stat values", () => {
    const session = createSessionFromSetup(
      {
        location: "Bag End",
        lighting: "",
        noise: "",
        music: false,
        placeNote: "",
        ruleset: {
          name: "Klassisk fantasy",
          attributes: [
            {
              highMeaning: "",
              lowMeaning: "",
              midMeaning: "",
              options: [],
              maxShift: 0,
              id: "wisdom", name: "Visdom", kind: "number", min: 1, max: 18, description: "" },
            {
              highMeaning: "",
              lowMeaning: "",
              midMeaning: "",
              options: [],
              maxShift: 0,
              id: "oath", name: "Ed", kind: "text", description: "" }
          ]
        },
        characters: [
          {
            name: "Emma",
            personality: "",
            mood: "wary",
            position: "by the door",
            stats: { wisdom: "14", oath: "keep the ring hidden" }
          }
        ]
      },
      "ruleset-1"
    );

    expect(session.ruleset?.name).toBe("Klassisk fantasy");
    expect(session.characters.emma?.stats).toEqual({
      wisdom: { value: 14, lock: "unlocked" },
      oath: { value: "keep the ring hidden", lock: "unlocked" }
    });
  });

  it("keeps starting trust meters the player set, not the engine defaults", () => {
    const session = createSessionFromSetup(
      {
        location: "The Aurora Room",
        lighting: "",
        noise: "",
        music: false,
        placeNote: "",
        characters: [
          {
            name: "Emma",
            personality: "",
            mood: "kind",
            position: "Emma's room",
            trust: "100",
            familiarity: "100",
            tension: "0"
          }
        ]
      },
      "meters-1"
    );
    expect(session.relationships.emma).toEqual({
      trust: { value: 100, lock: "unlocked" },
      familiarity: { value: 100, lock: "unlocked" },
      tension: { value: 0, lock: "unlocked" }
    });
  });

  it("places picked objects into the scene as canon", () => {
    const session = createSessionFromSetup(
      {
        location: "Bag End",
        lighting: "",
        noise: "",
        music: false,
        placeNote: "",
        characters: [{ name: "Frodo", personality: "", mood: "", position: "" }],
        objects: [
          {
            id: "ring",
            name: "The One Ring",
            note: "A plain gold band.",
            tags: ["Fantasy"]
          }
        ]
      },
      "objects-1"
    );
    expect(session.objects).toEqual([
      { id: "ring", name: "The One Ring", note: "A plain gold band.", tags: ["Fantasy"] }
    ]);
  });

  it("copies archive pronouns onto the scene character", () => {
    const session = createSessionFromSetup(
      {
        location: "Bar",
        lighting: "",
        noise: "",
        music: false,
        placeNote: "",
        characters: [
          { name: "Emma", personality: "", mood: "", position: "", pronoun: "she" },
          { name: "Ernold", personality: "", mood: "", position: "", pronoun: "he" }
        ]
      },
      "pronouns-1"
    );
    expect(session.characters.emma?.pronoun).toBe("she");
    expect(session.characters.ernold?.pronoun).toBe("he");
  });

  it("stores family name and slugs from the full name", () => {
    const session = createSessionFromSetup(
      {
        location: "Bar",
        lighting: "",
        noise: "",
        music: false,
        placeNote: "",
        characters: [
          {
            name: "Emma",
            familyName: "Knucklewood",
            personality: "",
            mood: "",
            position: "behind the bar"
          }
        ]
      },
      "names-1"
    );
    expect(session.characters["emma-knucklewood"]?.name).toBe("Emma");
    expect(session.characters["emma-knucklewood"]?.familyName).toBe("Knucklewood");
    expect(primaryCharacter(session)).toEqual({ id: "emma-knucklewood", name: "Emma Knucklewood" });
  });

  it("does not copy a nickname onto the session character", () => {
    const session = createSessionFromSetup(
      {
        location: "Bar",
        lighting: "",
        noise: "",
        music: false,
        placeNote: "",
        characters: [
          {
            name: "Emma",
            personality: "",
            mood: "",
            position: "behind the bar"
          }
        ]
      },
      "no-nickname-1"
    );
    expect(session.characters.emma?.knownAs).toBeUndefined();
  });

  it("stores a middle name and slugs from the full name", () => {
    const session = createSessionFromSetup(
      {
        location: "Bar",
        lighting: "",
        noise: "",
        music: false,
        placeNote: "",
        characters: [
          {
            name: "Emma",
            middleName: "Therese",
            familyName: "Knucklewood",
            personality: "",
            mood: "",
            position: ""
          }
        ]
      },
      "names-2"
    );
    expect(session.characters["emma-therese-knucklewood"]?.middleName).toBe("Therese");
    expect(primaryCharacter(session)).toEqual({
      id: "emma-therese-knucklewood",
      name: "Emma Therese Knucklewood"
    });
  });

  it("copies looks onto the character and lore onto a keyword core layer", () => {
    const session = createSessionFromSetup(
      {
        location: "Bar",
        lighting: "",
        noise: "",
        music: false,
        placeNote: "",
        characters: [
          {
            name: "Emma",
            personality: "Dry-witted.",
            mood: "reserved",
            position: "behind the bar",
            appearance: "Dark hair, sharp features.",
            approximateAge: 28,
            clothing: "a bartender's apron",
            holding: "a dish towel",
            portraitDataUrl: "data:image/jpeg;base64,AAAA",
            lore: [
              {
                id: "ring",
                title: "The ring",
                content: "She keeps a plain gold band in her apron pocket.",
                keywords: ["ring", "gold band"]
              }
            ]
          }
        ]
      },
      "looks-1"
    );

    expect(session.characters.emma?.appearance).toBe("Dark hair, sharp features.");
    expect(session.characters.emma?.approximateAge).toBe(28);
    expect(session.characters.emma?.clothing).toEqual({ value: "a bartender's apron", lock: "unlocked" });
    expect(session.characters.emma?.holding).toEqual({ value: "a dish towel", lock: "unlocked" });
    expect(session.characters.emma?.portraitDataUrl).toBe("data:image/jpeg;base64,AAAA");
    expect(session.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "layer-lore-emma-ring",
          type: "core",
          active: true,
          keywords: ["ring", "gold band"],
          content: "The ring\n\nShe keeps a plain gold band in her apron pocket."
        })
      ])
    );
  });

  it("copies place and room pictures onto the scene without putting them in lore", () => {
    const session = createSessionFromSetup(
      {
        location: "The Aurora Room",
        lighting: "",
        noise: "",
        music: false,
        placeNote: "Adjoining the bar: Emma's room.",
        placeVisual: {
          thumbDataUrl: "data:thumb-venue",
          imageDataUrl: "data:image-venue",
          gallery: [{ thumbDataUrl: "data:thumb-venue-2", imageDataUrl: "data:image-venue-2" }],
          picturePlay: "fade",
          audioDataUrl: "data:audio-venue",
          audioGallery: ["data:audio-venue-2"],
          audioPlay: "fade",
          rooms: [
            {
              fromRoomIds: [],
              gate: "open" as const,
              id: "room-emmas",
              label: "Emma's room",
              keywords: ["staff room"],
              description: "A narrow bed, a chair, curtains drawn.",
              thumbDataUrl: "data:thumb-emma",
              imageDataUrl: "data:image-emma",
              gallery: [{ thumbDataUrl: "data:thumb-emma-2", imageDataUrl: "data:image-emma-2" }],
              picturePlay: "random",
              audioDataUrl: "data:audio-emma",
              audioGallery: ["data:audio-emma-2"],
              audioPlay: "random"
            }
          ]
        },
        characters: [{ name: "Emma", personality: "Dry.", mood: "reserved", position: "behind the bar" }]
      },
      "pix-1"
    );
    expect(session.scene?.thumbDataUrl).toBe("data:thumb-venue");
    expect(session.scene?.imageDataUrl).toBe("data:image-venue");
    expect(session.scene?.gallery).toEqual([{ thumbDataUrl: "data:thumb-venue-2", imageDataUrl: "data:image-venue-2" }]);
    expect(session.scene?.picturePlay).toBe("fade");
    expect(session.scene?.audioDataUrl).toBe("data:audio-venue");
    expect(session.scene?.audioGallery).toEqual(["data:audio-venue-2"]);
    expect(session.scene?.audioPlay).toBe("fade");
    expect(session.scene?.rooms).toEqual([
      {
        id: "room-emmas",
        label: "Emma's room",
        keywords: ["staff room"],
        fromRoomIds: [],
        gate: "open",
        description: "A narrow bed, a chair, curtains drawn.",
        thumbDataUrl: "data:thumb-emma",
        imageDataUrl: "data:image-emma",
        gallery: [{ thumbDataUrl: "data:thumb-emma-2", imageDataUrl: "data:image-emma-2" }],
        picturePlay: "random",
        audioDataUrl: "data:audio-emma",
        audioGallery: ["data:audio-emma-2"],
        audioPlay: "random"
      }
    ]);
    expect(session.scene?.note).toBe("Adjoining the bar: Emma's room.");
    expect(session.layers.some((layer) => String(layer.content).includes("data:image"))).toBe(false);
  });

  it("copies the compact place prompt for the model, not the long intro, onto the always-on layer", () => {
    const longIntro =
      "The Aurora Room is a hidden, atmospheric jazz bar… Behind the bar, the bartender goes about his business unhurriedly.";
    const compact =
      "The Aurora Room is a hidden, atmospheric jazz bar with subdued lighting, weathered wooden surfaces and dark doors lurking in the shadows.";
    const session = createSessionFromSetup(
      {
        location: "The Aurora Room",
        lighting: "",
        noise: "",
        music: false,
        placeNote: longIntro,
        placeBrief: compact,
        placeVisual: {
          rooms: [
            {
              fromRoomIds: [],
              gate: "open" as const,
              id: "room-emmas",
              label: "Emma's room",
              keywords: ["staff room"],
              description: "A long walk-in intro for the picture.",
              brief: "A narrow staff room. Bed, chair, curtains drawn."
            }
          ]
        },
        characters: [{ name: "Emma", personality: "Dry.", mood: "reserved", position: "behind the bar" }]
      },
      "brief-1"
    );
    expect(session.scene?.note).toBe(longIntro);
    expect(session.scene?.brief).toBe(compact);
    expect(session.scene?.rooms?.[0]).toMatchObject({
      description: "A long walk-in intro for the picture.",
      brief: "A narrow staff room. Bed, chair, curtains drawn."
    });
    const placeLayer = session.layers.find((layer) => layer.id === "layer-place");
    expect(placeLayer?.content).toBe(compact);
    expect(placeLayer?.content).not.toBe(longIntro);
  });

  it("disambiguates duplicate names", () => {
    const session = createSessionFromSetup(
      {
        location: "Bar",
        lighting: "",
        noise: "",
        music: false,
        placeNote: "",
        characters: [
          { name: "Alex", personality: "", mood: "", position: "" },
          { name: "Alex", personality: "", mood: "", position: "" }
        ]
      },
      "s"
    );
    expect(Object.keys(session.characters).sort()).toEqual(["alex", "alex-2"]);
  });
});

describe("slugifyCharacterId / displayCharacterName", () => {
  it("slugifies and title-cases ids", () => {
    expect(slugifyCharacterId("Dr. Chen")).toBe("dr-chen");
    expect(displayCharacterName("dr-chen")).toBe("Dr Chen");
    expect(displayCharacterName("dr-chen", "Dr. Chen")).toBe("Dr. Chen");
    expect(displayCharacterName("emma-knucklewood", "Emma", "Knucklewood")).toBe("Emma Knucklewood");
    expect(displayCharacterName("emma-therese-knucklewood", "Emma", "Knucklewood", "Therese")).toBe(
      "Emma Therese Knucklewood"
    );
  });
});

