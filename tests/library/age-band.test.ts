import { describe, expect, it } from "vitest";
import { ageBandOf, matchesAgeBand } from "@library/ageBand";
import { parseCharacterTemplate } from "@library/LibrarySchema";

describe("approximate age", () => {
  it("bands young / adult / elder for campaign search", () => {
    expect(ageBandOf(16)).toBe("young");
    expect(ageBandOf(25)).toBe("young");
    expect(ageBandOf(28)).toBe("adult");
    expect(ageBandOf(54)).toBe("adult");
    expect(ageBandOf(55)).toBe("elder");
    expect(ageBandOf(undefined)).toBeUndefined();
  });

  it("hides unset ages when a band is picked", () => {
    expect(matchesAgeBand({ approximateAge: 19 }, "young")).toBe(true);
    expect(matchesAgeBand({ approximateAge: 19 }, "elder")).toBe(false);
    expect(matchesAgeBand({}, "young")).toBe(false);
    expect(matchesAgeBand({}, null)).toBe(true);
  });

  it("accepts a year and drops blank cards from older saves", () => {
    const withAge = parseCharacterTemplate({
      id: "c1",
      name: "Ada",
      personality: "",
      mood: "",
      position: "",
      scenario: "",
      source: "player",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      approximateAge: 67
    });
    expect(withAge.approximateAge).toBe(67);

    const blank = parseCharacterTemplate({
      id: "c2",
      name: "Bea",
      personality: "",
      mood: "",
      position: "",
      scenario: "",
      source: "player",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      approximateAge: ""
    });
    expect(blank.approximateAge).toBeUndefined();
  });
});
