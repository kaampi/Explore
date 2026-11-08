import type { CampaignScene, StoryboardSection } from '../../library/LibrarySchema';
import { storyboardHierarchy, storyboardSectionTitle } from '../../library/storyboardHierarchy';

type Props = {
  scenes: CampaignScene[];
  sections: StoryboardSection[];
  selectedScene: string;
  selectedSection: string;
  markedScenes: ReadonlySet<string>;
  onSelectScene: (id: string, additive: boolean) => void;
  onSelectSection: (id: string) => void;
  onToggleSection: (id: string) => void;
};

export function StoryboardOutline({ scenes, sections, selectedScene, selectedSection, markedScenes, onSelectScene, onSelectSection, onToggleSection }: Props) {
  const { sceneChildren, sectionChildren } = storyboardHierarchy(scenes, sections);
  const sceneNumbers = new Map(scenes.map((scene, index) => [scene.id, String(index + 1).padStart(2, '0')]));

  function branch(parent?: string) {
    return <ul className="storyboard-outline__branch">
      {(sectionChildren.get(parent) ?? []).map(section => {
        const title = storyboardSectionTitle(section);
        return <li key={section.id}>
          <div className="storyboard-outline__section">
            <button type="button" aria-expanded={!section.collapsed} aria-label={`${section.collapsed ? 'Expand' : 'Collapse'} ${title} in outline`}
              onClick={() => onToggleSection(section.id)}>{section.collapsed ? '▸' : '▾'}</button>
            <button type="button" aria-pressed={selectedSection === section.id} onClick={() => onSelectSection(section.id)}>
              <small>{section.kind === 'act' ? 'Act' : 'Scene group'}</small><strong>{title}</strong>
            </button>
          </div>
          {!section.collapsed && branch(section.id)}
        </li>;
      })}
      {(sceneChildren.get(parent) ?? []).map(scene => <li key={scene.id}>
        <button type="button" className="storyboard-outline__scene" aria-pressed={selectedScene === scene.id || markedScenes.has(scene.id)}
          onClick={event => onSelectScene(scene.id, event.shiftKey || event.ctrlKey || event.metaKey)}>
          <small>{sceneNumbers.get(scene.id)}</small><strong>{scene.name || 'Untitled scene'}</strong>
          <span>{scene.encounter?.definition.interactions.length ?? 0} actions</span>
        </button>
      </li>)}
    </ul>;
  }

  return <nav className="storyboard-outline" aria-label="Adventure structure">{branch()}</nav>;
}
