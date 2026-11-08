import type { CampaignTemplate, PlaceTemplate } from '../../library/LibrarySchema';
import { mapPlaceForScene, type AdventureMapPlace } from '../../library/adventureMap';

export type SceneField = 'name' | 'place' | 'playable' | 'arrival' | 'action';
export type ActionField = 'label' | 'success' | 'failure';
export type StoryboardIssue = { message: string } & (
  { kind: 'scene'; id: string; field: SceneField; action?: { id: string; field: ActionField } } |
  { kind: 'link'; id: string } |
  { kind: 'objective' }
);

export function storyboardIssues(campaign: CampaignTemplate, places: PlaceTemplate[], facts: ReadonlySet<string>, mapPlaces?: AdventureMapPlace[]): StoryboardIssue[] {
  const issues: StoryboardIssue[] = [];
  const placeIds = new Set(places.map(place => place.id));
  const sceneIds = new Set(campaign.scenes.map(scene => scene.id));
  for (const scene of campaign.scenes) {
    const name = scene.name.trim() || 'Untitled scene';
    const mapPlace = mapPlaces ? mapPlaceForScene(scene, mapPlaces) : undefined;
    const hasPlace = mapPlaces ? !!mapPlace : placeIds.has(scene.placeId);
    const add = (field: SceneField, message: string, action?: { id: string; field: ActionField }) => issues.push({
      kind: 'scene', id: scene.id, field, message, ...(action ? { action } : {})
    });
    if (!scene.name.trim()) add('name', 'Name the untitled scene.');
    if (!hasPlace) add('place', `Choose a place for “${name}”.`);
    if (!scene.encounter) {
      if (hasPlace) add('playable', `Make “${name}” playable.`);
      continue;
    }
    const arrival = scene.usePlaceIntro && mapPlaces ? mapPlace?.place.note ?? '' : scene.encounter.definition.description;
    if (!arrival.trim() || arrival === 'Describe what the player sees on arrival.') add('arrival', `Describe the arrival in “${name}”.`);
    for (const action of scene.encounter.definition.interactions) {
      const actionName = action.label.trim() || 'Untitled action';
      if (!action.label.trim()) add('action', `Name the untitled action in “${name}”.`, { id: action.id, field: 'label' });
      if (!action.success.text.trim() || action.success.text === 'Describe what the player discovers.') {
        add('action', `Write the success outcome for “${actionName}” in “${name}”.`, { id: action.id, field: 'success' });
      }
      if (action.check && !action.failure.text.trim()) {
        add('action', `Write the failure outcome for “${actionName}” in “${name}”.`, { id: action.id, field: 'failure' });
      }
    }
  }
  for (const link of campaign.sceneLinks) {
    if (link.fromSceneId === link.toSceneId || !sceneIds.has(link.fromSceneId) || !sceneIds.has(link.toSceneId)) {
      issues.push({ kind: 'link', id: link.id, message: `Choose two different scenes for “${link.label || 'Continue'}”.` });
    }
    if (link.requiresFlags.some(flag => link.requiresAbsentFlags.includes(flag))) {
      issues.push({ kind: 'link', id: link.id, message: `Resolve the conflicting conditions on “${link.label || 'Continue'}”.` });
    }
  }
  if (campaign.goal && !campaign.goal.title.trim()) issues.push({ kind: 'objective', message: 'Name the adventure objective.' });
  if (campaign.goal?.requiresFlags.some(flag => !facts.has(flag))) {
    issues.push({ kind: 'objective', message: 'Replace the missing discovery in the adventure objective.' });
  }
  return issues;
}
