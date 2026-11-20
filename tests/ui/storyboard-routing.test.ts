import { describe, expect, it } from "vitest";
import { emptyCampaignScene } from "@library/LibrarySchema";
import type { SceneCard } from "../../src/ui/studio/storyboardLayout";
import {
  routeStoryboardLinks,
  storyboardLinkPoint,
  type LinkSides,
  type Side,
} from "../../src/ui/studio/storyboardRouting";

function card(id: string, x: number, y: number, width = 200, height = 124): SceneCard {
  return { scene: { ...emptyCampaignScene(), id }, pos: { x, y }, width, height };
}

function route(from: SceneCard, to: SceneCard, obstacles: SceneCard[] = [], previous?: LinkSides) {
  return routeStoryboardLinks(
    from === to ? [from, ...obstacles] : [from, to, ...obstacles],
    [{ id: "link", from, to }],
    previous ? new Map([["link", previous]]) : undefined,
  ).get("link")!;
}

function passesThrough(
  curve: ReturnType<typeof route>,
  { pos, width, height }: SceneCard,
  margin = 0,
) {
  return Array.from({ length: 99 }, (_, i) => storyboardLinkPoint(curve, (i + 1) / 100)).some(
    ({ x, y }) =>
      x > pos.x - margin &&
      x < pos.x + width + margin &&
      y > pos.y - margin &&
      y < pos.y + height + margin,
  );
}

describe("routeStoryboardLinks", () => {
  it.each<[number, number, Side, Side]>([
    [350, 0, "right", "left"],
    [-350, 0, "left", "right"],
    [0, -250, "top", "bottom"],
    [0, 250, "bottom", "top"],
  ])("connects to the facing sides for a target at (%i, %i)", (x, y, from, to) => {
    expect(route(card("a", 0, 0), card("b", x, y)).sides).toEqual({ from, to });
  });

  it.each([
    [210, 0],
    [0, -130],
    [260, 155],
    [-260, -150],
  ])("avoids the source and target interiors at (%i, %i)", (x, y) => {
    const from = card("a", 0, 0);
    const to = card("b", x, y);
    const curve = route(from, to);
    expect(passesThrough(curve, from)).toBe(false);
    expect(passesThrough(curve, to)).toBe(false);
  });

  it("goes around a card in the middle when another facing pair is clear", () => {
    const from = card("a", 0, 0);
    const to = card("b", 400, 320);
    const obstacle = card("c", 260, 180, 80, 80);
    const unobstructed = route(from, to);
    expect(passesThrough(unobstructed, obstacle, 8)).toBe(true);
    const detour = route(from, to, [obstacle]);
    expect(passesThrough(detour, obstacle, 8)).toBe(false);
  });

  it("detours around an intervening card on the same row", () => {
    const from = card("a", 0, 0);
    const to = card("b", 560, 0);
    const obstacle = card("c", 280, 0, 80, 124);
    const clearTopRoute = route(from, to, [obstacle], { from: "top", to: "top" });
    expect(passesThrough(clearTopRoute, obstacle, 8)).toBe(false);
    expect(passesThrough(route(from, to, [obstacle]), obstacle, 8)).toBe(false);
  });

  it("spreads three ends across the middle 60% in destination order", () => {
    const from = card("a", 0, 0);
    const high = card("high", 360, -150);
    const middle = card("middle", 360, 0);
    const low = card("low", 360, 150);
    const routes = routeStoryboardLinks(
      [from, high, middle, low],
      [low, high, middle].map((to) => ({ id: to.scene.id, from, to })),
    );
    expect(["high", "middle", "low"].map((id) => routes.get(id)!.a)).toEqual([
      { x: 200, y: 124 * 0.2 },
      { x: 200, y: 124 * 0.5 },
      { x: 200, y: 124 * 0.8 },
    ]);
    for (const t of [0.01, 0.05, 0.1]) {
      const ends = ["high", "middle", "low"].map((id) => storyboardLinkPoint(routes.get(id)!, t).y);
      expect(ends[0]).toBeLessThan(ends[1]!);
      expect(ends[1]).toBeLessThan(ends[2]!);
    }
  });

  it("keeps reciprocal links apart at both ends and the middle", () => {
    const a = card("a", 0, 0);
    const b = card("b", 400, 0);
    const routes = routeStoryboardLinks(
      [a, b],
      [
        { id: "ab", from: a, to: b },
        { id: "ba", from: b, to: a },
      ],
    );
    const forward = routes.get("ab")!;
    const back = routes.get("ba")!;
    expect(forward.a.y).toBeLessThan(back.b.y);
    expect(forward.b.y).toBeLessThan(back.a.y);
    expect(forward.label.y).toBeLessThan(back.label.y);
  });

  it("draws a self-link above the scene between two distinct top ports", () => {
    const a = card("a", 100, 100);
    const loop = route(a, a);
    expect(loop.sides).toEqual({ from: "top", to: "top" });
    expect(loop.a.x).not.toBe(loop.b.x);
    expect(loop.a.y).toBe(a.pos.y);
    expect(loop.b.y).toBe(a.pos.y);
    expect(loop.label.y).toBeLessThan(a.pos.y);
    expect(passesThrough(loop, a)).toBe(false);
  });

  it("keeps the original sides and shortens the controls for a 10 px gap", () => {
    const curve = route(card("a", 0, 0), card("b", 210, 0));
    expect(curve.sides).toEqual({ from: "right", to: "left" });
    expect(curve.path).toBe("M200,62 C210,62 200,62 210,62");
  });

  it("connects two coincident rectangles with different ports along their top", () => {
    const a = card("a", 100, 100);
    const b = card("b", 100, 100);
    const loop = route(a, b);
    expect(loop.a).toEqual({ x: 140, y: 100 });
    expect(loop.b).toEqual({ x: 260, y: 100 });
    expect(loop.label.y).toBeLessThan(100);
  });

  it("still routes between cards with the same center and different sizes", () => {
    const outer = card("a", 0, 0, 200, 200);
    const inner = card("b", 50, 50, 100, 100);
    const curve = route(outer, inner);
    expect(curve.a).not.toEqual(curve.b);
    expect(route(outer, inner)).toEqual(curve);
  });

  it("is deterministic for identical input, including cost ties", () => {
    const a = card("a", 0, 0, 100, 100);
    const b = card("b", 260, 260, 100, 100);
    const links = [{ id: "a-b", from: a, to: b }];
    const routed = routeStoryboardLinks([a, b], links);
    expect(routed.get("a-b")?.sides).toEqual({ from: "right", to: "top" });
    expect(routeStoryboardLinks([a, b], links)).toEqual(routed);
  });

  it("retains the previous sides below the 15% improvement threshold and switches above it", () => {
    const from = card("a", 0, 0, 100, 100);
    const previous: LinkSides = { from: "bottom", to: "left" };
    const barelyBetter = card("b", 260, 270, 100, 100);
    const clearlyBetter = card("b", 40, 270, 100, 100);
    expect(route(from, barelyBetter).sides).toEqual({ from: "right", to: "top" });
    expect(route(from, barelyBetter, [], previous).sides).toEqual(previous);
    expect(route(from, clearlyBetter, [], previous).sides).toEqual({ from: "bottom", to: "top" });
  });

  it("routes 200 scenes and 300 connections in under 200 ms", () => {
    const cards = Array.from({ length: 200 }, (_, index) =>
      card(String(index), (index % 20) * 280, Math.floor(index / 20) * 140),
    );
    const links = Array.from({ length: 300 }, (_, index) => ({
      id: String(index),
      from: cards[index % cards.length]!,
      to: cards[(index * 79 + 31) % cards.length]!,
    }));
    const start = performance.now();
    const routes = routeStoryboardLinks(cards, links);
    const elapsed = performance.now() - start;
    expect(routes.size).toBe(300);
    expect(elapsed).toBeLessThan(200);
  });
});
