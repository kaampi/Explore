import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  IndexedDBRepository,
  SessionNotFoundError,
  SchemaValidationError,
  LibraryItemNotFoundError
} from "@persistence/IndexedDBRepository";
import type { Session } from "@state/StateSchema";
import type { CharacterTemplate } from "@library/LibrarySchema";
import { newCampaignTemplate, newPlaceTemplate, parsePlaceTemplate } from "@library/LibrarySchema";

function makeSession(id: string): Session {
  return {
    schemaVersion: 2,
    id,
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 0,
    characters: {},
    player: {
      position: { value: "here", lock: "unlocked" },
      status: { value: "awake", lock: "unlocked" }
    },
    relationships: {},
    layers: [],
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: [],
    openedRoomIds: [],
    partyIds: [],
    partyHoldIds: [],
    partyPendingIds: []
  };
}

describe("IndexedDBRepository", () => {
  let repo: IndexedDBRepository;
  let idbFactory: IDBFactory;

  beforeEach(() => {
    // Fresh in-memory IDB per test so tests can't see each other's data.
    idbFactory = new IDBFactory();
    repo = new IndexedDBRepository(idbFactory, "test-db", 1);
  });

  it("round-trips a session through save and load", async () => {
    const session = makeSession("s1");
    await repo.saveSession(session);

    const loaded = await repo.loadSession("s1");
    expect(loaded).toEqual(session);
  });

  it("throws SessionNotFoundError for a missing id", async () => {
    await expect(repo.loadSession("does-not-exist")).rejects.toThrow(SessionNotFoundError);
  });

  it("throws SchemaValidationError when stored data no longer matches the canonical schema", async () => {
    // Ensure the store exists first by exercising the repo once, then
    // write directly through the same underlying idbFactory to simulate
    // corrupted / pre-migration data landing in the store.
    await repo.saveSession(makeSession("placeholder"));

    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = idbFactory.open("test-db", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sessions", "readwrite");
      tx.objectStore("sessions").put({ id: "corrupt", stateVersion: "not-a-number" });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    await expect(repo.loadSession("corrupt")).rejects.toThrow(SchemaValidationError);
  });

  it("overwrites an existing session on save (put semantics)", async () => {
    const session = makeSession("s1");
    await repo.saveSession(session);

    const updated: Session = { ...session, stateVersion: 42 };
    await repo.saveSession(updated);

    const loaded = await repo.loadSession("s1");
    expect(loaded.stateVersion).toBe(42);
  });

  it("deletes a session", async () => {
    await repo.saveSession(makeSession("s1"));
    await repo.deleteSession("s1");
    await expect(repo.loadSession("s1")).rejects.toThrow(SessionNotFoundError);
  });

  it("lists all stored session ids", async () => {
    await repo.saveSession(makeSession("s1"));
    await repo.saveSession(makeSession("s2"));

    const ids = await repo.listSessionIds();
    expect(ids.sort()).toEqual(["s1", "s2"]);
  });

  it("migrates an old-schema record transparently on load", async () => {
    await repo.saveSession(makeSession("placeholder"));

    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = idbFactory.open("test-db", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const v1Record = {
      schemaVersion: 1,
      id: "legacy",
      runtime: { model: "old", temperature: 0.7, seed: null, provider: "test" },
      stateVersion: 0,
      characters: { emma: { position: "table", mood: "reserved" } },
      relationships: {},
      layers: [],
      memory: { episodic: [], semantic: [], relational: [] },
      conversation: [],
      events: [],
      snapshots: [],
      diagnostics: []
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sessions", "readwrite");
      tx.objectStore("sessions").put(v1Record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const loaded = await repo.loadSession("legacy");
    expect(loaded.schemaVersion).toBe(2);
    expect(loaded.characters.emma?.mood).toEqual({ value: "reserved", lock: "unlocked" });
  });
});

describe("IndexedDBRepository library", () => {
  it("round-trips characters and places independent of sessions", async () => {
    const factory = new IDBFactory();
    const repo = new IndexedDBRepository(factory, "lib-db");
    const stamp = "2026-01-01T00:00:00.000Z";
    const character: CharacterTemplate = {
      id: "c1",
      name: "Ada",
      familyName: "",
      middleName: "",
      knownAs: "",
      personality: "Curious",
      mood: "",
      appearance: "",
      position: "",
      scenario: "",
      lore: [],
      tags: [],
      source: "player",
      createdAt: stamp,
      updatedAt: stamp
    };
    const place = {
      id: "p1",
      name: "Map shop",
      lighting: "green",
      noise: "rain",
      music: false,
      note: "Paper.",
      rooms: [],
      tags: [],
      realmId: "example-realm-dunbaar",
      source: "player" as const,
      createdAt: stamp,
      updatedAt: stamp
    };
    const story = {
      id: "st1",
      name: "The War of the Ring",
      premise: "Sauron's life-force is bound to the One Ring.",
      source: "player" as const,
      createdAt: stamp,
      updatedAt: stamp
    };
    const voice = {
      id: "v1",
      name: "Tolkien-äventyr",
      instruction: "Du är Spelledare.",
      source: "player" as const,
      createdAt: stamp,
      updatedAt: stamp
    };
    const ruleset = {
      id: "r1",
      name: "Klassisk fantasy",
      attributes: [
        {
          id: "wisdom",
          name: "Visdom",
          kind: "number" as const,
          min: 1,
          max: 18,
          description: "",
          highMeaning: "",
          lowMeaning: "",
          midMeaning: "",
          options: [],
          maxShift: 0
        }
      ],
      source: "player" as const,
      createdAt: stamp,
      updatedAt: stamp
    };

    await repo.saveCharacter(character);
    await repo.savePlace(place);
    await repo.saveStory(story);
    await repo.saveVoice(voice);
    await repo.saveRuleset(ruleset);

    expect(await repo.loadCharacter("c1")).toEqual(character);
    expect(await repo.loadPlace("p1")).toEqual(place);
    expect(await repo.loadStory("st1")).toEqual(story);
    expect(await repo.loadVoice("v1")).toEqual(voice);
    expect((await repo.listCharacters()).map((c) => c.name)).toEqual(["Ada"]);
    expect((await repo.listPlaces()).map((p) => p.name)).toEqual(["Map shop"]);
    expect((await repo.listStories()).map((s) => s.name)).toEqual(["The War of the Ring"]);
    expect((await repo.listVoices()).map((v) => v.name)).toEqual(["Tolkien-äventyr"]);
    expect(await repo.loadRuleset("r1")).toEqual(ruleset);
    expect((await repo.listRulesets()).map((r) => r.name)).toEqual(["Klassisk fantasy"]);

    const object = {
      id: "o1",
      name: "The One Ring",
      note: "A plain gold band.",
      tags: ["Fantasy"],
      source: "player" as const,
      createdAt: stamp,
      updatedAt: stamp
    };
    await repo.saveObject(object);
    expect(await repo.loadObject("o1")).toEqual(object);
    expect((await repo.listObjects()).map((item) => item.name)).toEqual(["The One Ring"]);

    await repo.deleteCharacter("c1");
    await expect(repo.loadCharacter("c1")).rejects.toThrow(LibraryItemNotFoundError);
  });

  it("round-trips a character portrait on the archive card", async () => {
    const factory = new IDBFactory();
    const repo = new IndexedDBRepository(factory, "portrait-db");
    const stamp = "2026-01-01T00:00:00.000Z";
    const portraitDataUrl = `data:image/jpeg;base64,${"A".repeat(4000)}`;
    await repo.saveCharacter({
      id: "c1",
      name: "Ada",
      familyName: "",
      middleName: "",
      knownAs: "",
      personality: "",
      mood: "",
      appearance: "",
      position: "",
      scenario: "",
      lore: [],
      source: "player",
      portraitDataUrl,
      createdAt: stamp,
      updatedAt: stamp
    });

    expect((await repo.loadCharacter("c1")).portraitDataUrl).toBe(portraitDataUrl);
    expect((await repo.listCharacters())[0]?.portraitDataUrl).toBe(portraitDataUrl);
  });

  it("round-trips place thumbs and room pictures", async () => {
    const factory = new IDBFactory();
    const repo = new IndexedDBRepository(factory, "place-pix-db");
    const stamp = "2026-01-01T00:00:00.000Z";
    await repo.savePlace({
      id: "p1",
      name: "The Aurora Room",
      lighting: "",
      noise: "",
      music: false,
      note: "",
      brief: "A hidden jazz bar. Weathered wood, dark doors, a bartender who leaves you be.",
        rooms: [
          {
            id: "room-emmas",
            label: "Emma's room",
            keywords: ["staff room"],
            description: "A narrow bed.",
            brief: "A staff room. Bed, chair, curtains.",
            thumbDataUrl: "data:thumb-emma",
            imageDataUrl: "data:image-emma"
          }
        ],
      thumbDataUrl: "data:thumb-venue",
      imageDataUrl: "data:image-venue",
      tags: [],
      realmId: "example-realm-dunbaar",
      source: "player",
      createdAt: stamp,
      updatedAt: stamp
    });
    const loaded = await repo.loadPlace("p1");
    expect(loaded.thumbDataUrl).toBe("data:thumb-venue");
    expect(loaded.imageDataUrl).toBe("data:image-venue");
    expect(loaded.brief).toBe("A hidden jazz bar. Weathered wood, dark doors, a bartender who leaves you be.");
    expect(loaded.rooms[0]?.imageDataUrl).toBe("data:image-emma");
    expect(loaded.rooms[0]?.description).toBe("A narrow bed.");
    expect(loaded.rooms[0]?.brief).toBe("A staff room. Bed, chair, curtains.");
  });

  it("keeps pictures on one place when another place is saved", async () => {
    const factory = new IDBFactory();
    const repo = new IndexedDBRepository(factory, "two-place-pix-db");
    await repo.savePlace(
      newPlaceTemplate({
        id: "bar",
        name: "Bar",
        lighting: "",
        noise: "",
        music: false,
        note: "",
        thumbDataUrl: "data:thumb-bar",
        imageDataUrl: "data:image-bar",
        rooms: [],
        tags: [],
        source: "player"
      })
    );
    await repo.savePlace(
      newPlaceTemplate({
        id: "hotel",
        name: "Hotel",
        lighting: "",
        noise: "",
        music: false,
        note: "",
        thumbDataUrl: "data:thumb-hotel",
        imageDataUrl: "data:image-hotel",
        rooms: [],
        tags: [],
        source: "player"
      })
    );
    const bar = await repo.loadPlace("bar");
    const hotel = await repo.loadPlace("hotel");
    expect(bar.thumbDataUrl).toBe("data:thumb-bar");
    expect(bar.imageDataUrl).toBe("data:image-bar");
    expect(hotel.thumbDataUrl).toBe("data:thumb-hotel");
    expect(hotel.imageDataUrl).toBe("data:image-hotel");
    const listed = await repo.listPlaces();
    expect(listed.find((item) => item.id === "bar")?.thumbDataUrl).toBe("data:thumb-bar");
    expect(listed.find((item) => item.id === "hotel")?.thumbDataUrl).toBe("data:thumb-hotel");
  });

  it("loads a place that has a broken extra picture without dropping the card", () => {
    const loaded = parsePlaceTemplate({
      id: "bar",
      name: "Bar",
      lighting: "",
      noise: "",
      music: false,
      note: "",
      rooms: [],
      tags: [],
      source: "player",
      thumbDataUrl: "data:thumb-bar",
      imageDataUrl: "data:image-bar",
      gallery: [{ oops: true }, { thumbDataUrl: "data:thumb-2", imageDataUrl: "data:image-2" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    expect(loaded.thumbDataUrl).toBe("data:thumb-bar");
    expect(loaded.gallery).toEqual([{ thumbDataUrl: "data:thumb-2", imageDataUrl: "data:image-2" }]);
    expect(loaded.realmId).toBe("example-realm-dunbaar");
  });

  it("adds library stores when upgrading a sessions-only v1 database", async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const request = factory.open("upgrade-db", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("sessions", { keyPath: "id" });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const repo = new IndexedDBRepository(factory, "upgrade-db", 2);
    await repo.saveSession(makeSession("kept"));
    await repo.saveCharacter({
      id: "c1",
      name: "Ada",
      familyName: "",
      middleName: "",
      knownAs: "",
      personality: "",
      mood: "",
      appearance: "",
      position: "",
      scenario: "",
      lore: [],
      source: "player",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    expect((await repo.loadSession("kept")).id).toBe("kept");
    expect((await repo.listCharacters())[0]?.name).toBe("Ada");
  });

  it("keeps saved voices when upgrading to the campaigns store", async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const request = factory.open("voice-upgrade-db", 6);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of ["sessions", "characters", "places", "stories", "voices", "rulesets", "objects"]) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("voices", "readwrite");
        tx.objectStore("voices").put({
          id: "cyberpunk",
          name: "Cyberpunk",
          instruction: "Neon rain on wet streets.",
          source: "player",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });

    const repo = new IndexedDBRepository(factory, "voice-upgrade-db", 7);
    expect((await repo.listVoices()).some((item) => item.name === "Cyberpunk")).toBe(true);
    expect(await repo.listCampaigns()).toEqual([]);
  });

  it("round-trips a campaign template", async () => {
    const factory = new IDBFactory();
    const campaignRepo = new IndexedDBRepository(factory, "campaign-db", 7);
    await campaignRepo.saveCampaign(
      newCampaignTemplate({
        id: "camp-1",
        name: "The Aurora Room",
        playerIntro: "Stay as long as you like.",
        startPrompt: "A hidden jazz bar.",
        placeIds: ["p1"],
        people: [{ characterId: "emma", stats: {} }],
        scenes: [
          {
            id: "sc1",
            name: "Opening",
            placeId: "p1",
            people: [],
            objectIds: [],
            triggers: [
              {
                id: "t1",
                content: "Two strangers ask about a brooch.",
                keywords: ["brooch"],
                when: "return_to_bar"
              }
            ]
          }
        ]
      })
    );
    const loaded = await campaignRepo.loadCampaign("camp-1");
    expect(loaded.scenes[0]?.triggers[0]?.keywords).toEqual(["brooch"]);
    expect((await campaignRepo.listCampaigns())[0]?.name).toBe("The Aurora Room");
  });

  it("remembers which campaign to open after new scene", async () => {
    const factory = new IDBFactory();
    const repo = new IndexedDBRepository(factory, "resume-db", 8);
    await repo.saveStudioResume({ campaignId: "camp-1", sceneId: "sc1" });
    expect(await repo.loadStudioResume()).toEqual({ campaignId: "camp-1", sceneId: "sc1" });
    await repo.saveStudioResume({
      campaignId: "camp-1",
      sceneId: "sc1",
      handoff: "He asked to sleep. No sex."
    });
    expect(await repo.loadStudioResume()).toEqual({
      campaignId: "camp-1",
      sceneId: "sc1",
      handoff: "He asked to sleep. No sex."
    });
    await repo.clearStudioResume();
    expect(await repo.loadStudioResume()).toBeNull();
  });

  it("upgrades a v7 library database to v8 prefs without dropping campaigns", async () => {
    const factory = new IDBFactory();
    const kept = newCampaignTemplate({ id: "camp-1", name: "Kept", scenes: [] });
    await new Promise<void>((resolve, reject) => {
      const request = factory.open("resume-upgrade-db", 7);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of ["sessions", "characters", "places", "stories", "voices", "rulesets", "objects", "campaigns"]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("campaigns", "readwrite");
        tx.objectStore("campaigns").put(kept);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });

    const v8 = new IndexedDBRepository(factory, "resume-upgrade-db", 8);
    expect((await v8.listCampaigns())[0]?.name).toBe("Kept");
    await v8.saveStudioResume({ campaignId: "camp-1" });
    expect(await v8.loadStudioResume()).toEqual({ campaignId: "camp-1" });
  });

  it("lists library rows again after the live connection is closed", async () => {
    const factory = new IDBFactory();
    const live = new IndexedDBRepository(factory, "reopen-db", 8);
    await live.saveCampaign(newCampaignTemplate({ id: "camp-1", name: "Kept", scenes: [] }));
    const handle = live as unknown as { db?: IDBDatabase };
    handle.db?.close();
    expect((await live.listCampaigns())[0]?.name).toBe("Kept");
  });

  it("attaches orphan landmarks to City of Dunbaar when listing after v9", async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const request = factory.open("realm-upgrade-db", 8);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of [
          "sessions",
          "characters",
          "places",
          "stories",
          "voices",
          "rulesets",
          "objects",
          "campaigns",
          "prefs"
        ]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("places", "readwrite");
        tx.objectStore("places").put({
          id: "bar",
          name: "Bar",
          lighting: "",
          noise: "",
          music: false,
          note: "",
          rooms: [],
          tags: [],
          source: "player",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });

    const v9 = new IndexedDBRepository(factory, "realm-upgrade-db", 9);
    expect((await v9.listPlaces())[0]?.realmId).toBe("example-realm-dunbaar");
    await v9.saveRealm({
      id: "example-realm-dunbaar",
      name: "City of Dunbaar",
      note: "",
      source: "example",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    expect((await v9.listRealms())[0]?.name).toBe("City of Dunbaar");
  });
});
