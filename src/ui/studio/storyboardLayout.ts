import type { CampaignScene, StoryboardPosition, StoryboardSection } from '../../library/LibrarySchema';
import { defaultStoryboardPosition, storyboardHierarchy } from '../../library/storyboardHierarchy';

const CARD_WIDTH = 200;
const CARD_HEIGHT = 124;
const FRAME_GUTTER = 18;
const FRAME_HEADER = 44;

type CardGeometry = { pos: StoryboardPosition; width: number; height: number };
export type SceneCard = CardGeometry & { scene: CampaignScene };
export type SectionCard = CardGeometry & { section: StoryboardSection; sceneCount: number };
export type StoryboardCard = SceneCard | SectionCard;

export function layoutStoryboard(scenes: CampaignScene[], sections: StoryboardSection[]) {
  const hierarchy = storyboardHierarchy(scenes, sections);
  const sceneCards = new Map<string, SceneCard>(scenes.map((scene, index) => [scene.id, {
    scene, pos: scene.position ?? defaultStoryboardPosition(index), width: CARD_WIDTH, height: CARD_HEIGHT
  }]));
  const fallbackPositions = new Map(sections.map((section, index) => [section.id,
    section.position ?? defaultStoryboardPosition(scenes.length + index)]));
  type Branch = { card: SectionCard; groups: Branch[]; scenes: SceneCard[]; sceneIds: Set<string> };

  function branchFor(section: StoryboardSection): Branch {
    const groups = (hierarchy.sectionChildren.get(section.id) ?? []).map(branchFor);
    const children = (hierarchy.sceneChildren.get(section.id) ?? []).map(scene => sceneCards.get(scene.id)!);
    const members = [...children, ...groups.map(group => group.card)];
    const sceneIds = hierarchy.sectionSceneIds(section.id);
    const pos = members.length ? {
      x: Math.min(...members.map(card => card.pos.x)) - FRAME_GUTTER,
      y: Math.min(...members.map(card => card.pos.y)) - FRAME_HEADER
    } : fallbackPositions.get(section.id)!;
    const size = section.kind === 'group' ? section.size : undefined;
    const width = Math.max(size?.width ?? 0, CARD_WIDTH, ...members.map(card => card.pos.x + card.width - pos.x + FRAME_GUTTER));
    const height = Math.max(size?.height ?? 0, 78, ...members.map(card => card.pos.y + card.height - pos.y + FRAME_GUTTER));
    return {
      card: { section, pos, width: section.collapsed ? CARD_WIDTH : width, height: section.collapsed ? CARD_HEIGHT : height, sceneCount: sceneIds.size },
      groups, scenes: children, sceneIds
    };
  }

  const visibleScenes = (hierarchy.sceneChildren.get(undefined) ?? []).map(scene => sceneCards.get(scene.id)!);
  const frames: SectionCard[] = [];
  const folded: SectionCard[] = [];
  const endpoints = new Map<string, StoryboardCard>();
  function show(branch: Branch) {
    if (branch.card.section.collapsed) {
      folded.push(branch.card);
      for (const sceneId of branch.sceneIds) endpoints.set(sceneId, branch.card);
    } else {
      frames.push(branch.card);
      visibleScenes.push(...branch.scenes);
      branch.groups.forEach(show);
    }
  }
  (hierarchy.sectionChildren.get(undefined) ?? []).map(branchFor).forEach(show);
  for (const card of visibleScenes) endpoints.set(card.scene.id, card);
  return { sceneCards, visibleScenes, frames, folded, endpoints };
}
