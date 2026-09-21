import type { CampaignScene, CampaignTemplate, StoryboardChapter } from "./LibrarySchema";

/**
 * Chapter grouping over the Storyboard — which scenes belong together
 * for a chapter-shell export to the writing tool (StoryBook AI). Pure
 * authoring-time data; it does not touch play. The export is
 * deliberately lossy — a title and an assembled brief, no prose, same
 * "chapter shells only" scope as sandboxExport.ts on the other side.
 */

export const CHAPTER_EXPORT_KIND = "sandbox-storyboard-chapters";
export const CHAPTER_EXPORT_FORMAT = 1;

export type ChapterShell = {
  id: string;
  title: string;
  /** List order — same field name as StoryBook AI's own Chapter.sequence_index. */
  sequence_index: number;
  /** Writing instruction assembled from the grouped scenes' beats — not prose. */
  brief: string;
};

export type ChapterExportPayload = {
  kind: typeof CHAPTER_EXPORT_KIND;
  format: number;
  exportedAt: string;
  campaignName: string;
  chapters: ChapterShell[];
};

export function newChapter(title = ""): StoryboardChapter {
  return { id: crypto.randomUUID(), title };
}

/** Scenes in this chapter, in campaign scene order. */
export function scenesInChapter(scenes: CampaignScene[], chapterId: string): CampaignScene[] {
  return scenes.filter((scene) => scene.chapterId === chapterId);
}

export function setSceneChapter(
  scenes: CampaignScene[],
  sceneId: string,
  chapterId: string | undefined
): CampaignScene[] {
  return scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    if (!chapterId) {
      const { chapterId: _drop, ...rest } = scene;
      return rest;
    }
    return { ...scene, chapterId };
  });
}

/** Clears the assignment from every scene in a deleted chapter. */
export function unassignChapter(scenes: CampaignScene[], chapterId: string): CampaignScene[] {
  return scenes.map((scene) => {
    if (scene.chapterId !== chapterId) return scene;
    const { chapterId: _drop, ...rest } = scene;
    return rest;
  });
}

function sceneBeatLines(scene: CampaignScene): string[] {
  const lines = [`- ${scene.name.trim() || "Untitled scene"}`];
  for (const trigger of scene.triggers) {
    const content = trigger.content.trim();
    if (content) lines.push(`  - ${content}`);
  }
  for (const set of scene.whatNowSets) {
    for (const choice of set.choices) {
      const label = choice.label.trim();
      if (label) lines.push(`  - ${label}`);
    }
  }
  return lines;
}

function chapterBrief(scenes: CampaignScene[]): string {
  return scenes.flatMap(sceneBeatLines).join("\n");
}

export function buildChapterExport(
  campaign: Pick<CampaignTemplate, "name" | "scenes" | "chapters">,
  exportedAt = new Date().toISOString()
): ChapterExportPayload {
  return {
    kind: CHAPTER_EXPORT_KIND,
    format: CHAPTER_EXPORT_FORMAT,
    exportedAt,
    campaignName: campaign.name,
    chapters: campaign.chapters.map((chapter, index) => ({
      id: chapter.id,
      title: chapter.title.trim() || `Chapter ${index + 1}`,
      sequence_index: index,
      brief: chapterBrief(scenesInChapter(campaign.scenes, chapter.id))
    }))
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function chapterExportFilename(campaignName: string, exportedAt = new Date().toISOString()): string {
  const slug = slugify(campaignName) || "campaign";
  const day = exportedAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
  return `${slug}-chapters-${day}.json`;
}
