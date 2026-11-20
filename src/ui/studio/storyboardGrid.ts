export const STORYBOARD_GRID_SIZE = 20;

export function snapStoryboardCoordinate(value: number): number {
  return Math.round(value / STORYBOARD_GRID_SIZE) * STORYBOARD_GRID_SIZE;
}

export function ceilStoryboardCoordinate(value: number): number {
  return Math.ceil(value / STORYBOARD_GRID_SIZE) * STORYBOARD_GRID_SIZE;
}
