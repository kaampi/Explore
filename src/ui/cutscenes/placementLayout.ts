import type { CutscenePlacement } from "../../cutscenes/schema";
import type { StoryboardPosition } from "../../library/storyboardPosition";
import { ceilStoryboardCoordinate, snapStoryboardCoordinate } from "../studio/storyboardGrid";

export const placementWidth = 180;
export const placementHeight = 100;
const gap = 40;

type BoardCard = { pos: StoryboardPosition; width: number; height: number };

export function placementCards(
  placements: CutscenePlacement[],
  cards: BoardCard[],
  scenes: ReadonlyMap<string, BoardCard>,
  ways: ReadonlyMap<string, StoryboardPosition>,
  arrange = false,
) {
  const occupied = [...cards];
  const bottom = ceilStoryboardCoordinate(
    Math.max(0, ...cards.map(({ pos, height }) => pos.y + height)) + gap,
  );
  const left = snapStoryboardCoordinate(Math.min(0, ...cards.map(({ pos }) => pos.x))) || 0;
  let shelfX = left;

  return placements.map((placement) => {
    const { trigger } = placement;
    const scene = trigger.kind === "scene" ? scenes.get(trigger.sceneId) : undefined;
    const way = trigger.kind === "link" ? ways.get(trigger.linkId) : undefined;
    const anchor = scene
      ? { x: scene.pos.x + scene.width / 2, y: scene.pos.y + scene.height / 2 }
      : way;
    const stored = arrange ? undefined : placement.position;
    const pos = stored
      ? { ...stored }
      : scene
        ? {
            x: ceilStoryboardCoordinate(scene.pos.x + scene.width + gap),
            y: snapStoryboardCoordinate(scene.pos.y),
          }
        : way
          ? { x: snapStoryboardCoordinate(way.x + gap), y: ceilStoryboardCoordinate(way.y + gap) }
          : { x: shelfX, y: bottom };
    if (!stored) {
      if (!anchor) shelfX += placementWidth + gap;
      while (
        occupied.some(
          ({ pos: other, width, height }) =>
            pos.x < other.x + width + gap / 2 &&
            pos.x + placementWidth + gap / 2 > other.x &&
            pos.y < other.y + height + gap / 2 &&
            pos.y + placementHeight + gap / 2 > other.y,
        )
      ) {
        if (anchor) pos.y += placementHeight + gap;
        else {
          pos.x = shelfX;
          shelfX += placementWidth + gap;
        }
      }
    }
    const result = { placement, pos, width: placementWidth, height: placementHeight, anchor };
    occupied.push(result);
    return result;
  });
}
