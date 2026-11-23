import type { CampaignScene, CampaignTemplate } from "./LibrarySchema";

export function savedAdventureStart(campaign: CampaignTemplate): CampaignScene | undefined {
  return campaign.scenes.find((scene) => scene.id === campaign.startSceneId && scene.encounter);
}

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

/**
 * A manuscript or guide scene that nothing has been built in yet. It is a note to work
 * from, not a part of the adventure: it never stops the adventure from being tested, and it is
 * left out when a game starts, until it is made playable.
 */
export function isOpenDraft(scene: CampaignScene): boolean {
  return !!(scene.draft || scene.guideDraftNote) && !scene.encounter;
}
