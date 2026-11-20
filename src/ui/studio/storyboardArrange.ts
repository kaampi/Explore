import type {
  CampaignScene,
  StoryboardLink,
  StoryboardPosition,
  StoryboardSection,
} from "@library/LibrarySchema";
import { defaultStoryboardPosition, storyboardHierarchy } from "@library/storyboardHierarchy";
import { ceilStoryboardCoordinate } from "./storyboardGrid";
import { layoutStoryboard, type StoryboardCard } from "./storyboardLayout";

const COLUMN_GAP = 120;
const CARD_GAP = 40;

type Positions = {
  scenes: Map<string, StoryboardPosition>;
  sections: Map<string, StoryboardPosition>;
};

/** Arrange the top-level cards. For a section, translate every descendant by the same amount. */
export function arrangeStoryboard(
  scenes: CampaignScene[],
  sections: StoryboardSection[],
  links: StoryboardLink[],
  startSceneId?: string,
): Positions {
  const hierarchy = storyboardHierarchy(scenes, sections);
  const layout = layoutStoryboard(scenes, sections);
  const sceneKey = (id: string) => `scene:${id}`;
  const sectionKey = (id: string) => `section:${id}`;
  const topSectionKey = (section: StoryboardSection) =>
    sectionKey(hierarchy.parentAct(section) ?? section.id);
  const topSectionIds = new Set(hierarchy.sectionChildren.get(undefined)?.map(({ id }) => id));
  const cards = new Map<string, StoryboardCard>();
  const sceneUnits = new Map<string, string>();
  for (const scene of scenes) {
    const section = hierarchy.byId.get(scene.storyboardSectionId ?? "");
    const key = section ? topSectionKey(section) : sceneKey(scene.id);
    sceneUnits.set(scene.id, key);
    if (!section) cards.set(key, layout.sceneCards.get(scene.id)!);
  }
  for (const card of [...layout.frames, ...layout.folded]) {
    if (topSectionIds.has(card.section.id)) cards.set(sectionKey(card.section.id), card);
  }

  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  for (const { fromSceneId, toSceneId } of links) {
    const from = sceneUnits.get(fromSceneId);
    const to = sceneUnits.get(toSceneId);
    if (!from || !to || from === to) continue;
    if (!outgoing.has(from)) outgoing.set(from, new Set());
    if (!incoming.has(to)) incoming.set(to, new Set());
    outgoing.get(from)!.add(to);
    incoming.get(to)!.add(from);
  }

  const start = sceneUnits.get(startSceneId ?? "") ?? sceneUnits.get(scenes[0]?.id ?? "");
  const visiting = new Set<string>();
  const forward = new Map<string, string[]>();
  const postorder: string[] = [];
  function visit(key: string) {
    visiting.add(key);
    const successors: string[] = [];
    for (const next of outgoing.get(key) ?? []) {
      // Edges into the current DFS stack close a cycle and do not define rank.
      if (visiting.has(next)) continue;
      if (!forward.has(next)) visit(next);
      successors.push(next);
    }
    visiting.delete(key);
    forward.set(key, successors);
    postorder.push(key);
  }
  if (start) visit(start);

  const ranks = new Map<string, number>();
  const columns: string[][] = [];
  if (start) ranks.set(start, 0);
  for (const card of postorder.reverse()) {
    const rank = ranks.get(card)!;
    (columns[rank] ??= []).push(card);
    for (const next of forward.get(card)!) {
      ranks.set(next, Math.max(ranks.get(next) ?? 0, rank + 1));
    }
  }

  const tops = new Map<string, number>();
  function stackColumn(column: string[]) {
    let y = 0;
    for (const key of column) {
      tops.set(key, y);
      y = ceilStoryboardCoordinate(y + cards.get(key)!.height + CARD_GAP);
    }
  }
  function centerY(key: string) {
    return tops.get(key)! + cards.get(key)!.height / 2;
  }
  columns.forEach(stackColumn);
  // Stop once a pass makes no changes. One pass per column bounds oscillation
  // when incoming edges also include links that go back to earlier columns.
  for (let pass = 0; pass < columns.length; pass++) {
    let changed = false;
    for (const column of columns) {
      const means = new Map(
        column.map((card) => {
          const predecessors = [...(incoming.get(card) ?? [])].filter((key) => tops.has(key));
          const mean = predecessors.length
            ? predecessors.reduce((sum, key) => sum + centerY(key), 0) / predecessors.length
            : centerY(card);
          return [card, mean];
        }),
      );
      const previous = [...column];
      column.sort((a, b) => means.get(a)! - means.get(b)!);
      changed ||= column.some((card, index) => card !== previous[index]);
      stackColumn(column);
    }
    if (!changed) break;
  }

  const unreachable = [...cards.keys()].filter((key) => !ranks.has(key));
  let unreachableY = 0;
  for (const [key, y] of tops) {
    unreachableY = Math.max(unreachableY, y + cards.get(key)!.height + CARD_GAP);
  }
  unreachableY = ceilStoryboardCoordinate(unreachableY);

  const anchors = new Map<string, StoryboardPosition>();
  let x = 0;
  for (let index = 0; index < Math.max(columns.length, unreachable.length); index++) {
    let width = 0;
    for (const key of columns[index] ?? []) {
      anchors.set(key, { x, y: tops.get(key)! });
      width = Math.max(width, cards.get(key)!.width);
    }
    const orphan = unreachable[index];
    if (orphan) {
      anchors.set(orphan, { x, y: unreachableY });
      width = Math.max(width, cards.get(orphan)!.width);
    }
    x = ceilStoryboardCoordinate(x + width + COLUMN_GAP);
  }

  function translated(key: string, previous: StoryboardPosition): StoryboardPosition {
    const origin = cards.get(key)!.pos;
    const anchor = anchors.get(key)!;
    return { x: anchor.x + (previous.x - origin.x), y: anchor.y + (previous.y - origin.y) };
  }
  return {
    scenes: new Map(
      scenes.map(({ id }) => [id, translated(sceneUnits.get(id)!, layout.sceneCards.get(id)!.pos)]),
    ),
    sections: new Map(
      sections.map((section, index) => {
        const key = topSectionKey(section);
        const position = topSectionIds.has(section.id)
          ? anchors.get(key)!
          : translated(key, section.position ?? defaultStoryboardPosition(scenes.length + index));
        return [section.id, position];
      }),
    ),
  };
}
