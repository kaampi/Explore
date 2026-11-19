import type { StoryboardPosition as Point } from "@library/LibrarySchema";
import type { StoryboardCard } from "./storyboardLayout";

export type Side = "right" | "left" | "bottom" | "top";
export type LinkSides = { from: Side; to: Side };
type Link = { id: string; from: StoryboardCard; to: StoryboardCard };
type Route = {
  path: string;
  a: Point;
  b: Point;
  label: Point;
  sides: LinkSides;
  curve: Curve;
};
type Rect = { left: number; top: number; right: number; bottom: number };

const SIDES: Side[] = ["right", "left", "bottom", "top"];
const NORMAL: Record<Side, Point> = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  bottom: { x: 0, y: 1 },
  top: { x: 0, y: -1 },
};
const SAMPLES = 40;
const OBSTACLE_MARGIN = 8;
const HIT_COST = 120;
const ENDPOINT_WEIGHT = 0.6;
const SWITCH_FACTOR = 0.85;
const TOP_LOOP: LinkSides = { from: "top", to: "top" };
const SIDE_PAIRS = SIDES.flatMap((from) => SIDES.map((to) => ({ from, to })));
const SAMPLES_AT = Array.from({ length: SAMPLES }, (_, index) => index / (SAMPLES - 1));

function center({ pos, width, height }: StoryboardCard): Point {
  return { x: pos.x + width / 2, y: pos.y + height / 2 };
}

function faces(side: Side, dx: number, dy: number): boolean {
  return dx * NORMAL[side].x + dy * NORMAL[side].y > 0;
}

function sidePoint({ pos, width, height }: StoryboardCard, side: Side, fraction: number): Point {
  switch (side) {
    case "right":
      return { x: pos.x + width, y: pos.y + height * fraction };
    case "left":
      return { x: pos.x, y: pos.y + height * fraction };
    case "bottom":
      return { x: pos.x + width * fraction, y: pos.y + height };
    case "top":
      return { x: pos.x + width * fraction, y: pos.y };
  }
}

function curveWithOffset(a: Point, b: Point, sides: LinkSides, offset: number) {
  const p = { x: a.x + offset * NORMAL[sides.from].x, y: a.y + offset * NORMAL[sides.from].y };
  const q = { x: b.x + offset * NORMAL[sides.to].x, y: b.y + offset * NORMAL[sides.to].y };
  return { a, p, q, b };
}

type Curve = ReturnType<typeof curveWithOffset>;

function curveFor(a: Point, b: Point, sides: LinkSides, from: Rect, to: Rect): Curve {
  const offset = Math.max(36, Math.min(0.42 * Math.hypot(b.x - a.x, b.y - a.y), 140));
  const curve = curveWithOffset(a, b, sides, offset);
  const normal = NORMAL[sides.from];
  const incoming = NORMAL[sides.to];
  if (normal.x !== -incoming.x || normal.y !== -incoming.y) return curve;

  const gap = (b.x - a.x) * normal.x + (b.y - a.y) * normal.y;
  if (gap <= 0 || offset <= gap) return curve;
  const axis = normal.x ? "x" : "y";
  const [low, high] = axisBounds(a[axis], curve.p[axis], curve.q[axis], b[axis]);
  if (low >= Math.min(a[axis], b[axis]) && high <= Math.max(a[axis], b[axis])) return curve;

  // On a shared axis any overshoot is inside an end card. Otherwise check the
  // curve in two dimensions before shortening the controls.
  const cross = axis === "x" ? "y" : "x";
  if (
    a[cross] === b[cross] ||
    SAMPLES_AT.slice(1, -1).some((t) => {
      const point = pointAt(curve, t);
      return contains(from, point) || contains(to, point);
    })
  ) {
    return curveWithOffset(a, b, sides, gap);
  }
  return curve;
}

function coordinate(a: number, p: number, q: number, b: number, t: number): number {
  const s = 1 - t;
  return a + 3 * s * s * t * (p - a) + 3 * s * t * t * (q - a) + t * t * t * (b - a);
}

function pointAt({ a, p, q, b }: Curve, t: number): Point {
  return {
    x: coordinate(a.x, p.x, q.x, b.x, t),
    y: coordinate(a.y, p.y, q.y, b.y, t),
  };
}

function axisBounds(a: number, p: number, q: number, b: number): [number, number] {
  let min = Math.min(a, b);
  let max = Math.max(a, b);
  // Interior extrema are the roots of the derivative, a quadratic.
  const quadratic = b - 3 * q + 3 * p - a;
  const linear = 2 * (q - 2 * p + a);
  const constant = p - a;
  const include = (t: number) => {
    if (t <= 0 || t >= 1) return;
    const value = coordinate(a, p, q, b, t);
    min = Math.min(min, value);
    max = Math.max(max, value);
  };
  if (quadratic === 0) {
    if (linear !== 0) include(-constant / linear);
  } else {
    const discriminant = linear * linear - 4 * quadratic * constant;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      include((-linear + root) / (2 * quadratic));
      include((-linear - root) / (2 * quadratic));
    }
  }
  return [min, max];
}

function bounds({ a, p, q, b }: Curve): Rect {
  const [left, right] = axisBounds(a.x, p.x, q.x, b.x);
  const [top, bottom] = axisBounds(a.y, p.y, q.y, b.y);
  return { left, right, top, bottom };
}

function pathFor({ a, p, q, b }: Curve): string {
  return `M${a.x},${a.y} C${p.x},${p.y} ${q.x},${q.y} ${b.x},${b.y}`;
}

function cardBounds({ pos, width, height }: StoryboardCard, margin = 0): Rect {
  return {
    left: pos.x - margin,
    top: pos.y - margin,
    right: pos.x + width + margin,
    bottom: pos.y + height + margin,
  };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function contains(rect: Rect, { x, y }: Point): boolean {
  return x > rect.left && x < rect.right && y > rect.top && y < rect.bottom;
}

function routeFrom(curve: Curve, sides: LinkSides): Route {
  const { a, b } = curve;
  return { path: pathFor(curve), a, b, label: pointAt(curve, 0.5), sides, curve };
}

export function storyboardLinkBounds({ curve }: Route): Rect {
  return bounds(curve);
}

export function storyboardLinkPoint({ curve }: Route, t: number): Point {
  return pointAt(curve, t);
}

type Candidate = { sides: LinkSides; cost: number; clear: boolean };
type Obstacle = { card: StoryboardCard; rect: Rect };

function scoreCurve(
  curve: Curve,
  from: Rect,
  to: Rect,
  obstacles: Obstacle[],
  link: Link,
): Omit<Candidate, "sides"> {
  const area = bounds(curve);
  const nearby = obstacles.filter(
    ({ card, rect }) => card !== link.from && card !== link.to && intersects(rect, area),
  );
  let length = 0;
  let hits = 0;
  let endpointHits = 0;
  let last = curve.a;
  for (let i = 1; i < SAMPLES; i++) {
    const point = i === SAMPLES - 1 ? curve.b : pointAt(curve, SAMPLES_AT[i]!);
    length += Math.hypot(point.x - last.x, point.y - last.y);
    if (i < SAMPLES - 1) {
      if (contains(from, point) || contains(to, point)) endpointHits++;
      if (nearby.some(({ rect }) => contains(rect, point))) hits++;
    }
    last = point;
  }
  return {
    cost: length + HIT_COST * (hits + ENDPOINT_WEIGHT * endpointHits),
    clear: hits === 0 && endpointHits === 0,
  };
}

function chooseSides(link: Link, obstacles: Obstacle[], previous?: LinkSides): LinkSides {
  const { from, to } = link;
  const a = center(from);
  const b = center(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fromBounds = cardBounds(from);
  const toBounds = cardBounds(to);
  function score(sides: LinkSides): Candidate {
    const start = sidePoint(from, sides.from, 0.5);
    const end = sidePoint(to, sides.to, 0.5);
    const curve = curveFor(start, end, sides, fromBounds, toBounds);
    return { sides, ...scoreCurve(curve, fromBounds, toBounds, obstacles, link) };
  }
  const facing = SIDE_PAIRS.filter(
    (sides) => faces(sides.from, dx, dy) && faces(sides.to, -dx, -dy),
  );
  const scores = new Map(facing.map((sides) => [sides, score(sides)]));
  function compare(best: Candidate | undefined, candidate: Candidate): Candidate {
    if (!best || (candidate.clear && !best.clear)) return candidate;
    if (!candidate.clear && best.clear) return best;
    // Curve length is a sum of floating point distances. Keep the specified side
    // order for ties within the precision of those sums.
    const rounding = Number.EPSILON * Math.max(best.cost, candidate.cost) * SAMPLES;
    return candidate.cost < best.cost - rounding ? candidate : best;
  }
  let best: Candidate | undefined;
  if ([...scores.values()].some((candidate) => candidate.clear)) {
    for (const candidate of scores.values()) best = compare(best, candidate);
  } else {
    for (const sides of SIDE_PAIRS) best = compare(best, scores.get(sides) ?? score(sides));
  }
  if (!best) throw new Error("No storyboard side pair was evaluated");
  if (previous && (previous.from !== best.sides.from || previous.to !== best.sides.to)) {
    const old = SIDE_PAIRS.find(({ from, to }) => from === previous.from && to === previous.to);
    const previousCost = (old && scores.get(old))?.cost ?? score(previous).cost;
    if (best.cost > SWITCH_FACTOR * previousCost) return previous;
  }
  return best.sides;
}

type End = {
  route: PendingRoute;
  key: keyof LinkSides;
  order: number;
};

type PendingRoute = {
  link: Link;
  sides: LinkSides;
  points: Partial<Record<keyof LinkSides, Point>>;
};

function geometryKey({ pos, width, height }: StoryboardCard): string {
  return `${pos.x},${pos.y},${width},${height}`;
}

function spreadEnds(pending: PendingRoute[]): void {
  const byCard = new Map<string, Map<Side, End[]>>();
  for (const route of pending) {
    for (const key of ["from", "to"] as const) {
      const card = route.link[key];
      const side = route.sides[key];
      const other = center(route.link[key === "from" ? "to" : "from"]);
      const order = side === "left" || side === "right" ? other.y : other.x;
      // Identical rectangles share their visible edge, including loops between
      // distinct cards whose rectangles coincide.
      const rect = geometryKey(card);
      let bySide = byCard.get(rect);
      if (!bySide) byCard.set(rect, (bySide = new Map()));
      let ends = bySide.get(side);
      if (!ends) bySide.set(side, (ends = []));
      ends.push({ route, key, order });
    }
  }
  for (const bySide of byCard.values()) {
    for (const [side, ends] of bySide) {
      // The same link ID breaks ties at both ends, keeping reciprocal links parallel.
      ends.sort((a, b) => {
        const byPosition = a.order - b.order;
        if (byPosition) return byPosition;
        if (a.route.link.id === b.route.link.id) return 0;
        return a.route.link.id < b.route.link.id ? -1 : 1;
      });
      ends.forEach(({ route, key }, index) => {
        const fraction = ends.length === 1 ? 0.5 : 0.2 + (0.6 * index) / (ends.length - 1);
        route.points[key] = sidePoint(route.link[key], side, fraction);
      });
    }
  }
}

function routeLinks(
  cards: StoryboardCard[],
  links: Link[],
  previous?: Map<string, LinkSides>,
  movedCards?: ReadonlySet<StoryboardCard>,
): Map<string, Route> {
  const obstacles = cards.map((card) => ({ card, rect: cardBounds(card, OBSTACLE_MARGIN) }));
  const pending = links.map((link): PendingRoute => {
    const { from, to } = link;
    const old = previous?.get(link.id);
    const keepSides = old && movedCards && !movedCards.has(from) && !movedCards.has(to);
    const sides =
      geometryKey(from) === geometryKey(to)
        ? TOP_LOOP
        : keepSides
          ? old
          : chooseSides(link, obstacles, old);
    return { link, sides, points: {} };
  });

  spreadEnds(pending);
  return new Map(
    pending.map(({ link, sides, points }) => {
      const curve = curveFor(
        points.from!,
        points.to!,
        sides,
        cardBounds(link.from),
        cardBounds(link.to),
      );
      return [link.id, routeFrom(curve, sides)];
    }),
  );
}

export function routeStoryboardLinks(
  cards: StoryboardCard[],
  links: Link[],
  previous?: Map<string, LinkSides>,
): Map<string, Route> {
  return routeLinks(cards, links, previous);
}

export function routeMovingStoryboardLinks(
  cards: StoryboardCard[],
  links: Link[],
  previous: Map<string, LinkSides>,
  movedCards: ReadonlySet<StoryboardCard>,
): Map<string, Route> {
  return routeLinks(cards, links, previous, movedCards);
}

export function routeStoryboardDraft(from: StoryboardCard, point?: Point): Route {
  const mid = center(from);
  const b = point ?? { x: from.pos.x + from.width + 55, y: mid.y };
  const dx = (b.x - mid.x) / from.width;
  const dy = (b.y - mid.y) / from.height;
  const side = SIDES.reduce((best, next) => {
    const outward = (value: Side) => dx * NORMAL[value].x + dy * NORMAL[value].y;
    return outward(next) > outward(best) ? next : best;
  });
  const to = SIDES.find(
    (next) => NORMAL[next].x === -NORMAL[side].x && NORMAL[next].y === -NORMAL[side].y,
  )!;
  const sides = { from: side, to };
  const a = sidePoint(from, side, 0.5);
  const target = { left: b.x, right: b.x, top: b.y, bottom: b.y };
  return routeFrom(curveFor(a, b, sides, cardBounds(from), target), sides);
}
