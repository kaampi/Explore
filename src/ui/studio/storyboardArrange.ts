import type {
  CampaignScene,
  StoryboardLink,
  StoryboardPosition,
  StoryboardSection,
} from "@library/LibrarySchema";
import { defaultStoryboardPosition, storyboardHierarchy } from "@library/storyboardHierarchy";
import { ceilStoryboardCoordinate } from "./storyboardGrid";
import { CARD_HEIGHT, CARD_WIDTH, layoutStoryboard, type StoryboardCard } from "./storyboardLayout";
import { STORYBOARD_GRID_SIZE } from "./storyboardGrid";

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

/** A card that is already on the canvas: where it is and how big. */
export type PlacedCard = { id: string; pos: StoryboardPosition; width: number; height: number };

const floorToGrid = (value: number) =>
  Math.floor(value / STORYBOARD_GRID_SIZE) * STORYBOARD_GRID_SIZE;

/**
 * Where new scenes go: on the grid, beside the scene they grow from, on the side where there is
 * room. It never moves a card that is already there, and the same input gives the same answer.
 */
export function placeNewScenes(
  cards: PlacedCard[],
  anchorSceneId: string,
  newIds: string[],
): Map<string, StoryboardPosition> {
  const fresh = new Set(newIds);
  const taken: { x: number; y: number; width: number; height: number }[] = cards
    .filter(({ id }) => !fresh.has(id))
    .map(({ pos, width, height }) => ({ ...pos, width, height }));
  const anchor = cards.find(({ id }) => id === anchorSceneId);
  const placed = new Map<string, StoryboardPosition>();
  const gap = STORYBOARD_GRID_SIZE;
  const free = (x: number, y: number) =>
    !taken.some(
      (card) =>
        x < card.x + card.width + gap &&
        x + CARD_WIDTH + gap > card.x &&
        y < card.y + card.height + gap &&
        y + CARD_HEIGHT + gap > card.y,
    );
  /** The nearest free spot in a column, trying the anchor's own height first, then down and up. */
  function inColumn(x: number, top: number): StoryboardPosition {
    const step = ceilStoryboardCoordinate(CARD_HEIGHT + CARD_GAP);
    for (let n = 0; n < 200; n++) {
      const offset = Math.ceil(n / 2) * step * (n % 2 === 1 ? 1 : -1);
      const y = top + offset;
      if (free(x, y)) return { x, y };
    }
    return { x, y: top + 200 * step };
  }
  newIds.forEach((id) => {
    let spot: StoryboardPosition;
    if (!anchor) {
      const right = Math.max(0, ...taken.map((card) => card.x + card.width));
      spot = inColumn(ceilStoryboardCoordinate(right + COLUMN_GAP), 0);
    } else {
      const top = ceilStoryboardCoordinate(anchor.pos.y);
      // Right side first, then left, then below. A side is good when its column has room within a
      // card's height of the anchor; otherwise the side that needs the smallest move is used.
      const step = ceilStoryboardCoordinate(CARD_HEIGHT + CARD_GAP);
      const sides: StoryboardPosition[] = [
        inColumn(ceilStoryboardCoordinate(anchor.pos.x + anchor.width + COLUMN_GAP), top),
        inColumn(floorToGrid(anchor.pos.x - COLUMN_GAP - CARD_WIDTH), top),
      ];
      const below = {
        x: ceilStoryboardCoordinate(anchor.pos.x),
        y: ceilStoryboardCoordinate(anchor.pos.y + anchor.height + CARD_GAP),
      };
      if (free(below.x, below.y)) sides.push(below);
      const shift = (side: StoryboardPosition) => (side === below ? 0 : Math.abs(side.y - top));
      spot =
        sides.find((side) => shift(side) <= step) ??
        [...sides].sort((a, b) => shift(a) - shift(b))[0]!;
    }
    placed.set(id, spot);
    taken.push({ ...spot, width: CARD_WIDTH, height: CARD_HEIGHT });
  });
  return placed;
}
