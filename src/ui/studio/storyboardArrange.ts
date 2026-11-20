import type {
  CampaignScene,
  StoryboardLink,
  StoryboardPosition,
  StoryboardSection,
} from "@library/LibrarySchema";
import { defaultStoryboardPosition, storyboardHierarchy } from "@library/storyboardHierarchy";
import { layoutStoryboard } from "./storyboardLayout";

const COLUMN_STEP = 280;
const ROW_STEP = 140;

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
  const origins = new Map<string, StoryboardPosition>();
  const sceneUnits = new Map<string, string>();
  for (const scene of scenes) {
    const section = hierarchy.byId.get(scene.storyboardSectionId ?? "");
    const key = section ? topSectionKey(section) : sceneKey(scene.id);
    sceneUnits.set(scene.id, key);
    if (!section) origins.set(key, layout.sceneCards.get(scene.id)!.pos);
  }
  for (const card of [...layout.frames, ...layout.folded]) {
    if (topSectionIds.has(card.section.id)) origins.set(sectionKey(card.section.id), card.pos);
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

  const rows = new Map<string, number>();
  function indexRows(column: string[]) {
    column.forEach((card, row) => rows.set(card, row));
  }
  columns.forEach(indexRows);
  // Stop once a pass makes no changes. One pass per column bounds oscillation
  // when incoming edges also include links that go back to earlier columns.
  for (let pass = 0; pass < columns.length; pass++) {
    let changed = false;
    for (const column of columns) {
      const means = new Map(
        column.map((card) => {
          const predecessors = [...(incoming.get(card) ?? [])].filter((key) => rows.has(key));
          const mean = predecessors.length
            ? predecessors.reduce((sum, key) => sum + rows.get(key)!, 0) / predecessors.length
            : rows.get(card)!;
          return [card, mean];
        }),
      );
      column.sort((a, b) => means.get(a)! - means.get(b)!);
      changed ||= column.some((card, row) => rows.get(card) !== row);
      indexRows(column);
    }
    if (!changed) break;
  }

  let nextRow = 0;
  const anchors = new Map<string, StoryboardPosition>();
  columns.forEach((column, x) => {
    column.forEach((card, y) => anchors.set(card, { x: x * COLUMN_STEP, y: y * ROW_STEP }));
    nextRow = Math.max(nextRow, column.length);
  });
  let nextColumn = 0;
  for (const card of origins.keys()) {
    if (!ranks.has(card))
      anchors.set(card, { x: nextColumn++ * COLUMN_STEP, y: nextRow * ROW_STEP });
  }

  function translated(key: string, previous: StoryboardPosition): StoryboardPosition {
    const origin = origins.get(key)!;
    const anchor = anchors.get(key)!;
    return { x: previous.x + (anchor.x - origin.x), y: previous.y + (anchor.y - origin.y) };
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
