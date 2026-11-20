import { describe, expect, it } from "vitest";
import {
  emptyCampaignScene,
  type CampaignScene,
  type StoryboardLink,
  type StoryboardSection,
} from "@library/LibrarySchema";
import { arrangeStoryboard } from "../../src/ui/studio/storyboardArrange";
import { layoutStoryboard } from "../../src/ui/studio/storyboardLayout";

function scene(id: string, x = 813, y = 517): CampaignScene {
  return { ...emptyCampaignScene(), id, position: { x, y } };
}

function links(...pairs: [string, string][]): StoryboardLink[] {
  return pairs.map(([fromSceneId, toSceneId], id) => ({
    id: String(id),
    fromSceneId,
    toSceneId,
    requiresFlags: [],
    requiresAbsentFlags: [],
    setsFlags: [],
    label: "",
  }));
}

describe("arrangeStoryboard", () => {
  it("places scenes after their longest path from the specified start", () => {
    const scenes = ["unused", "a", "b", "c", "d"].map((id) => scene(id));
    const result = arrangeStoryboard(
      scenes,
      [],
      links(["a", "c"], ["a", "b"], ["b", "d"], ["d", "c"]),
      "a",
    );
    expect(["a", "b", "d", "c"].map((id) => result.scenes.get(id)?.x)).toEqual([0, 280, 560, 840]);
  });

  it("ignores self-links and back edges when ranking a cycle", () => {
    const scenes = ["a", "b", "c"].map((id) => scene(id));
    const result = arrangeStoryboard(
      scenes,
      [],
      links(["a", "b"], ["b", "c"], ["c", "a"], ["b", "b"]),
    );
    expect(scenes.map(({ id }) => result.scenes.get(id)?.x)).toEqual([0, 280, 560]);
  });

  it.each([false, true])(
    "translates the whole group, preserving offsets (folded: %s)",
    (collapsed) => {
      const sections: StoryboardSection[] = [
        { id: "group", title: "Rooms", kind: "group", collapsed },
      ];
      const scenes = [
        scene("start"),
        { ...scene("a", 935, 217), storyboardSectionId: "group" },
        { ...scene("b", 1152, 453), storyboardSectionId: "group" },
      ];
      const result = arrangeStoryboard(scenes, sections, links(["start", "b"], ["b", "a"]));
      const a = result.scenes.get("a")!;
      const b = result.scenes.get("b")!;
      expect({ x: b.x - a.x, y: b.y - a.y }).toEqual({ x: 217, y: 236 });
      const next = scenes.map((scene) => ({ ...scene, position: result.scenes.get(scene.id) }));
      const arranged = layoutStoryboard(next, sections);
      expect([...arranged.folded, ...arranged.frames][0]?.pos).toEqual(
        result.sections.get("group"),
      );
    },
  );

  it("puts unreachable scenes together on their own row below the reachable scenes", () => {
    const scenes = ["a", "b", "c", "x", "y"].map((id) => scene(id));
    const result = arrangeStoryboard(scenes, [], links(["a", "b"], ["a", "c"], ["x", "y"]));
    const below = Math.max(...["a", "b", "c"].map((id) => result.scenes.get(id)!.y));
    const x = result.scenes.get("x")!;
    const y = result.scenes.get("y")!;
    expect(x.y).toBeGreaterThan(below);
    expect(y.y).toBe(x.y);
    expect(Math.abs(x.x - y.x)).toBe(280);
  });

  it("places independent scenes and group anchors on the 20 px grid", () => {
    const sections: StoryboardSection[] = [
      { id: "g", title: "Rooms", kind: "group", position: { x: 11, y: 19 } },
    ];
    const scenes = [scene("a"), scene("b"), scene("c")];
    const result = arrangeStoryboard(scenes, sections, links(["a", "b"], ["a", "c"]));
    for (const { x, y } of [...result.scenes.values(), ...result.sections.values()]) {
      expect(x % 20).toBe(0);
      expect(y % 20).toBe(0);
    }
    expect(Math.abs(result.scenes.get("b")!.y - result.scenes.get("c")!.y)).toBe(140);
  });

  it("orders each column to follow the heights of its predecessors", () => {
    const scenes = ["a", "b", "c", "d", "e"].map((id) => scene(id));
    const result = arrangeStoryboard(
      scenes,
      [],
      links(["a", "b"], ["a", "c"], ["c", "e"], ["b", "d"]),
    );
    expect(result.scenes.get("d")?.y).toBe(result.scenes.get("b")?.y);
    expect(result.scenes.get("e")?.y).toBe(result.scenes.get("c")?.y);
  });
});
