import type { EncounterDefinition, EncounterState } from './EncounterSchema';
type World = Pick<EncounterDefinition, 'places' | 'connections' | 'sightLines'>;
type State = Pick<EncounterState, 'barriers'>;
export function barrierPassable(s: State, id?: string) {
  if (!id) return true;
  const barrier = s.barriers[id];
  return !!barrier && barrier.open && !barrier.locked && !barrier.blocked;
}
export function connected(d: World, from: string, to: string) {
  return d.connections.find(link => (link.from === from && link.to === to) || (link.from === to && link.to === from));
}
export function canMove(d: World, s: State, from: string, to: string) {
  const link = connected(d, from, to);
  return !!link && barrierPassable(s, link.barrierId);
}
export function lineOfSight(d: World, s: State, from: string, to: string) {
  if (from === to) return true;
  return d.sightLines.some(link => ((link.from === from && link.to === to) || (link.from === to && link.to === from)) && barrierPassable(s, link.barrierId));
}
export function distance(d: World, from: string, to: string) {
  const a = d.places.find(p => p.id === from), b = d.places.find(p => p.id === to);
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.elevation - b.elevation) : Infinity;
}
/** Closed but operable doors may be included only when planning how to approach a barrier. */
export function findPath(d: World, s: State, from: string, to: string, planDoors = false): string[] {
  if (!d.places.some(p => p.id === from) || !d.places.some(p => p.id === to)) return [];
  const queue = [[from]], seen = new Set([from]);
  while (queue.length) {
    const path = queue.shift()!, last = path.at(-1)!;
    if (last === to) return path;
    for (const link of d.connections) {
      const next = link.from === last ? link.to : link.to === last ? link.from : undefined;
      if (!next || seen.has(next)) continue;
      if (!barrierPassable(s, link.barrierId) && !(planDoors && link.barrierId && s.barriers[link.barrierId] && !s.barriers[link.barrierId]!.blocked)) continue;
      seen.add(next); queue.push([...path, next]);
    }
  }
  return [];
}
