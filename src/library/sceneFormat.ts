import type { CampaignScene } from "./LibrarySchema";

/**
 * - playable: built in Storyboard, with prepared actions the engine decides.
 * - earlier: an older scene told freely by the AI, with people, triggers or replies.
 * - blank: nothing built yet. Storyboard turns it into a playable scene.
 */
export type SceneFormat = "playable" | "earlier" | "blank";

export function sceneFormat(scene: CampaignScene): SceneFormat {
  if (scene.encounter) return "playable";
  const hasOlderContent =
    scene.people.length > 0 ||
    scene.objectIds.length > 0 ||
    scene.triggers.length > 0 ||
    scene.whatNowSets.length > 0;
  return hasOlderContent ? "earlier" : "blank";
}
