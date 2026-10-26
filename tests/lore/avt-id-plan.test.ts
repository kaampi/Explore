import { describe, expect, it } from "vitest";
import { inspectAvtStructure } from "../../src/lore/avtInspect";
import { planAvtIds } from "../../src/lore/avtIdPlan";

const archive = () => ({
  version: "1.11.0", exportedAt: 100,
  story: { id: "old-story", title: "The Coast" },
  entries: [{ id: "old-entry", text: "Hello" }],
  characters: [{ id: "old-character", name: "Mira" }],
  locations: [{ id: "old-location", name: "Harbor" }],
  chapters: [{ id: "old-chapter", title: "Beginning" }],
  lorebookEntries: [{ id: "old-lore", name: "Coast" }],
  worldStateRecords: [{ id: "old-state" }],
  embeddedImages: [],
});
describe("Aventuras archive inspection and ID planning", () => {
  it("counts documented sections without executing their contents", () => {
    const overview = inspectAvtStructure(archive());
    expect(overview.title).toBe("The Coast");
    expect(overview.chapterCount).toBe(1);
    expect(overview.worldStateRecordCount).toBe(1);
    expect(overview.lorebookCount).toBe(1);
  });
  it("assigns new IDs and preserves the original source", () => {
    const raw = archive();
    let next = 0;
    const plan = planAvtIds(raw, () => `new-${++next}`);
    expect(plan.idMap.get("old-story")).toBe("new-1");
    expect(plan.idMap.get("old-entry")).toBe("new-2");
    expect(plan.storyId).toBe("new-1");
    expect(raw.story.id).toBe("old-story");
  });
  it("rejects duplicate source IDs", () => {
    const raw = archive();
    raw.characters[0]!.id = "old-entry";
    expect(() => planAvtIds(raw)).toThrow(/Duplicate source ID/);
  });
  it("rejects archives without story entries", () => {
    expect(() => inspectAvtStructure({ version: "1.0.0", story: { id: "x" }, entries: [] })).toThrow();
  });
});
