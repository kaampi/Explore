import { describe, it, expect } from "vitest";
import { FALLBACK_REALM_ID, parsePlaceTemplate, parseRealmTemplate } from "@library/LibrarySchema";
import { examplePlaceTemplate, exampleRealmDunbaar } from "@library/exampleTemplates";

describe("realms and landmarks", () => {
  it("names the example realm City of Dunbaar and hangs Aurora under it", () => {
    expect(exampleRealmDunbaar().name).toBe("City of Dunbaar");
    expect(examplePlaceTemplate().realmId).toBe(exampleRealmDunbaar().id);
  });

  it("attaches a landmark with no realm to City of Dunbaar", () => {
    const loaded = parsePlaceTemplate({
      id: "cave",
      name: "A cave",
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
    expect(loaded.realmId).toBe(FALLBACK_REALM_ID);
  });

  it("keeps realm pictures, sound, intro, and For the model", () => {
    const loaded = parseRealmTemplate({
      id: "hollow",
      name: "The Hollow",
      note: "Limestone caves under the hills.",
      brief: "A wet cave system. Locals leave offerings at the mouth.",
      thumbDataUrl: "data:thumb",
      imageDataUrl: "data:image",
      audioDataUrl: "data:audio",
      source: "player",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    expect(loaded.brief).toBe("A wet cave system. Locals leave offerings at the mouth.");
    expect(loaded.thumbDataUrl).toBe("data:thumb");
    expect(loaded.audioDataUrl).toBe("data:audio");
  });
});
