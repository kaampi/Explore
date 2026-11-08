import type { CampaignScene, CampaignTemplate, StoryboardPosition, StoryboardSection } from './LibrarySchema';

export function defaultStoryboardPosition(index: number): StoryboardPosition {
  return { x: 40 + (index % 4) * 240, y: 40 + Math.floor(index / 4) * 180 };
}

export function storyboardSectionTitle(section: StoryboardSection): string {
  return section.title.trim() || (section.kind === 'act' ? 'Untitled act' : 'Untitled scene group');
}

export function storyboardHierarchy(scenes: CampaignScene[], sections: StoryboardSection[]) {
  const byId = new Map(sections.map(section => [section.id, section]));
  const sceneChildren = new Map<string | undefined, CampaignScene[]>();
  const sectionChildren = new Map<string | undefined, StoryboardSection[]>();
  function parentAct(section: StoryboardSection) {
    if (section.kind === 'group' && section.actId && byId.get(section.actId)?.kind === 'act') {
      return section.actId;
    }
  }
  for (const section of sections) {
    const parent = parentAct(section);
    const siblings = sectionChildren.get(parent) ?? [];
    siblings.push(section);
    sectionChildren.set(parent, siblings);
  }
  for (const scene of scenes) {
    const parent = scene.storyboardSectionId && byId.has(scene.storyboardSectionId)
      ? scene.storyboardSectionId : undefined;
    const siblings = sceneChildren.get(parent) ?? [];
    siblings.push(scene);
    sceneChildren.set(parent, siblings);
  }
  function sceneAct(scene: CampaignScene) {
    const section = byId.get(scene.storyboardSectionId ?? '');
    return section?.kind === 'act' ? section.id : section && parentAct(section);
  }
  function sectionSceneIds(id: string) {
    return new Set([
      ...(sceneChildren.get(id) ?? []),
      ...(sectionChildren.get(id) ?? []).flatMap(section => sceneChildren.get(section.id) ?? [])
    ].map(scene => scene.id));
  }
  return { byId, sceneChildren, sectionChildren, parentAct, sceneAct, sectionSceneIds };
}

export function removeStoryboardSection(campaign: CampaignTemplate, id: string): CampaignTemplate {
  const sections = campaign.storyboardSections ?? [];
  const hierarchy = storyboardHierarchy(campaign.scenes, sections);
  const removed = hierarchy.byId.get(id);
  if (!removed) return campaign;
  const parent = hierarchy.parentAct(removed);
  return {
    ...campaign,
    storyboardSections: sections.filter(section => section.id !== id).map(section =>
      section.kind === 'group' && section.actId === id ? { ...section, actId: undefined } : section
    ),
    scenes: campaign.scenes.map(scene => scene.storyboardSectionId === id
      ? { ...scene, storyboardSectionId: parent }
      : scene)
  };
}

export function moveStoryboardSection(campaign: CampaignTemplate, id: string, delta: StoryboardPosition): CampaignTemplate {
  const sections = campaign.storyboardSections ?? [];
  const hierarchy = storyboardHierarchy(campaign.scenes, sections);
  const members = hierarchy.sectionSceneIds(id);
  const translate = (position: StoryboardPosition) => ({ x: position.x + delta.x, y: position.y + delta.y });
  return {
    ...campaign,
    scenes: campaign.scenes.map((scene, index) => members.has(scene.id)
      ? { ...scene, position: translate(scene.position ?? defaultStoryboardPosition(index)) }
      : scene),
    storyboardSections: sections.map((section, index) => section.id === id || hierarchy.parentAct(section) === id
      ? { ...section, position: translate(section.position ?? defaultStoryboardPosition(campaign.scenes.length + index)) }
      : section)
  };
}
