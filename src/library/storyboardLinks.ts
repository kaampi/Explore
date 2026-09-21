import { storyFlagsSatisfied } from "@state/storyFlags";
import type { CampaignScene, CampaignTemplate, StoryboardLink, StoryboardPosition } from "./LibrarySchema";

/**
 * Storyboard — how a campaign's scenes connect. Pure data/graph helpers
 * only; a scene is still a separate night you Start from the Scenes
 * list (§ project_spec "not a graph and not a later visit yet"). This
 * is the map that fills that gap, and what the canvas (task 4) draws.
 */

export function linksFromScene(links: StoryboardLink[], sceneId: string): StoryboardLink[] {
  return links.filter((link) => link.fromSceneId === sceneId);
}

export function linksToScene(links: StoryboardLink[], sceneId: string): StoryboardLink[] {
  return links.filter((link) => link.toSceneId === sceneId);
}

/**
 * A scene with no incoming links is always open (a campaign's entry
 * points aren't gated). One with incoming links is open once at least
 * one of them is currently satisfied — several links into the same
 * scene are alternative paths in, not all required together.
 */
export function sceneIsAvailable(links: StoryboardLink[], sceneId: string, flags: string[]): boolean {
  const incoming = linksToScene(links, sceneId);
  if (incoming.length === 0) return true;
  return incoming.some((link) =>
    storyFlagsSatisfied({ storyFlags: flags }, link.requiresFlags, link.requiresAbsentFlags)
  );
}

/** Ids of links that reference a scene the campaign no longer has. */
export function danglingLinkIds(campaign: Pick<CampaignTemplate, "scenes" | "sceneLinks">): string[] {
  const sceneIds = new Set(campaign.scenes.map((scene) => scene.id));
  return campaign.sceneLinks
    .filter((link) => !sceneIds.has(link.fromSceneId) || !sceneIds.has(link.toSceneId))
    .map((link) => link.id);
}

/** Adds a link, or replaces the existing one with the same id. */
export function upsertSceneLink(links: StoryboardLink[], link: StoryboardLink): StoryboardLink[] {
  return [...links.filter((item) => item.id !== link.id), link];
}

export function removeSceneLink(links: StoryboardLink[], linkId: string): StoryboardLink[] {
  return links.filter((item) => item.id !== linkId);
}

/** Drops every link touching a scene — call this when that scene is deleted. */
export function removeLinksForScene(links: StoryboardLink[], sceneId: string): StoryboardLink[] {
  return links.filter((link) => link.fromSceneId !== sceneId && link.toSceneId !== sceneId);
}

/** Sets one scene's canvas position, leaving every other scene untouched. */
export function setScenePosition(
  scenes: CampaignScene[],
  sceneId: string,
  position: StoryboardPosition
): CampaignScene[] {
  return scenes.map((scene) => (scene.id === sceneId ? { ...scene, position } : scene));
}
