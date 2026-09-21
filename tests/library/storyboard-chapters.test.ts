import { describe, it, expect } from "vitest";
import {
  buildChapterExport,
  chapterExportFilename,
  newChapter,
  scenesInChapter,
  setSceneChapter,
  unassignChapter,
  CHAPTER_EXPORT_KIND,
  CHAPTER_EXPORT_FORMAT
} from "@library/storyboardChapters";
import { emptyCampaignScene, type CampaignScene } from "@library/LibrarySchema";

function scene(overrides: Partial<CampaignScene> & Pick<CampaignScene, "id">): CampaignScene {
  return { ...emptyCampaignScene(), ...overrides, id: overrides.id };
}

describe("newChapter", () => {
  it("makes a chapter with an id and the given title", () => {
    const chapter = newChapter("Opening");
    expect(chapter.title).toBe("Opening");
    expect(chapter.id).toBeTruthy();
  });

  it("defaults to an empty title", () => {
    expect(newChapter().title).toBe("");
  });
});

describe("setSceneChapter / scenesInChapter / unassignChapter", () => {
  it("assigns a scene to a chapter", () => {
    const scenes = [scene({ id: "a" }), scene({ id: "b" })];
    const next = setSceneChapter(scenes, "a", "ch1");
    expect(next.find((s) => s.id === "a")?.chapterId).toBe("ch1");
    expect(next.find((s) => s.id === "b")?.chapterId).toBeUndefined();
  });

  it("clears the assignment when given undefined", () => {
    const scenes = [scene({ id: "a", chapterId: "ch1" })];
    const next = setSceneChapter(scenes, "a", undefined);
    expect(next[0]?.chapterId).toBeUndefined();
  });

  it("scenesInChapter keeps campaign scene order", () => {
    const scenes = [scene({ id: "a", chapterId: "ch1" }), scene({ id: "b" }), scene({ id: "c", chapterId: "ch1" })];
    expect(scenesInChapter(scenes, "ch1").map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("unassignChapter clears every scene that pointed at a deleted chapter", () => {
    const scenes = [scene({ id: "a", chapterId: "ch1" }), scene({ id: "b", chapterId: "ch2" })];
    const next = unassignChapter(scenes, "ch1");
    expect(next.find((s) => s.id === "a")?.chapterId).toBeUndefined();
    expect(next.find((s) => s.id === "b")?.chapterId).toBe("ch2");
  });
});

describe("buildChapterExport", () => {
  it("assembles a brief from each grouped scene's name, triggers, and Pre-defined Replies", () => {
    const campaign = {
      name: "The Aurora Room",
      chapters: [{ id: "ch1", title: "Meeting Emma" }],
      scenes: [
        scene({
          id: "a",
          name: "Baren öppnar",
          chapterId: "ch1",
          triggers: [{ id: "t1", content: "She notices something familiar.", keywords: ["x"], when: "return_to_bar", requiresFlags: [], requiresAbsentFlags: [], setsFlags: [] }],
          whatNowSets: [{ id: "s1", keywords: [], choices: [{ id: "c1", label: "Show her the brooch", room: "" }] }]
        }),
        scene({ id: "b", name: "Emma bjuder in", chapterId: "ch1" }),
        scene({ id: "c", name: "Not in this chapter" })
      ]
    };
    const payload = buildChapterExport(campaign, "2026-01-01T00:00:00.000Z");
    expect(payload.kind).toBe(CHAPTER_EXPORT_KIND);
    expect(payload.format).toBe(CHAPTER_EXPORT_FORMAT);
    expect(payload.campaignName).toBe("The Aurora Room");
    expect(payload.chapters).toHaveLength(1);
    const chapter = payload.chapters[0]!;
    expect(chapter.title).toBe("Meeting Emma");
    expect(chapter.sequence_index).toBe(0);
    expect(chapter.brief).toContain("Baren öppnar");
    expect(chapter.brief).toContain("She notices something familiar.");
    expect(chapter.brief).toContain("Show her the brooch");
    expect(chapter.brief).toContain("Emma bjuder in");
    expect(chapter.brief).not.toContain("Not in this chapter");
  });

  it("falls back to Chapter N when a chapter has no title", () => {
    const payload = buildChapterExport({ name: "C", chapters: [{ id: "ch1", title: "" }], scenes: [] });
    expect(payload.chapters[0]?.title).toBe("Chapter 1");
  });

  it("an empty chapter still exports with an empty brief", () => {
    const payload = buildChapterExport({ name: "C", chapters: [{ id: "ch1", title: "Empty" }], scenes: [] });
    expect(payload.chapters[0]?.brief).toBe("");
  });
});

describe("chapterExportFilename", () => {
  it("slugifies the campaign name and stamps the day", () => {
    expect(chapterExportFilename("The Aurora Room!", "2026-03-04T00:00:00.000Z")).toBe(
      "the-aurora-room-chapters-2026-03-04.json"
    );
  });

  it("falls back to 'campaign' for a name with nothing slug-worthy", () => {
    expect(chapterExportFilename("★★★", "2026-03-04T00:00:00.000Z")).toBe("campaign-chapters-2026-03-04.json");
  });
});
