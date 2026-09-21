import { describe, it, expect } from "vitest";
import {
  danglingLinkIds,
  linksFromScene,
  linksToScene,
  removeLinksForScene,
  removeSceneLink,
  sceneIsAvailable,
  setScenePosition,
  upsertSceneLink
} from "@library/storyboardLinks";
import { emptyCampaignScene, type StoryboardLink } from "@library/LibrarySchema";

function link(overrides: Partial<StoryboardLink> & Pick<StoryboardLink, "id" | "fromSceneId" | "toSceneId">): StoryboardLink {
  return { requiresFlags: [], requiresAbsentFlags: [], setsFlags: [], label: "", ...overrides };
}

describe("linksFromScene / linksToScene", () => {
  const links = [
    link({ id: "l1", fromSceneId: "bar", toSceneId: "morning" }),
    link({ id: "l2", fromSceneId: "bar", toSceneId: "fight" }),
    link({ id: "l3", fromSceneId: "fight", toSceneId: "morning" })
  ];

  it("filters by source scene", () => {
    expect(linksFromScene(links, "bar").map((l) => l.id)).toEqual(["l1", "l2"]);
  });

  it("filters by destination scene", () => {
    expect(linksToScene(links, "morning").map((l) => l.id)).toEqual(["l1", "l3"]);
  });
});

describe("sceneIsAvailable", () => {
  it("a scene with no incoming links is always open", () => {
    expect(sceneIsAvailable([], "bar", [])).toBe(true);
  });

  it("stays closed until a satisfied incoming link exists", () => {
    const links = [link({ id: "l1", fromSceneId: "bar", toSceneId: "epilogue", requiresFlags: ["fienden_dod"] })];
    expect(sceneIsAvailable(links, "epilogue", [])).toBe(false);
    expect(sceneIsAvailable(links, "epilogue", ["fienden_dod"])).toBe(true);
  });

  it("respects requiresAbsentFlags — the Förhandla/Attackera exclusion", () => {
    const links = [link({ id: "l1", fromSceneId: "meeting", toSceneId: "negotiate", requiresAbsentFlags: ["fienden_dod"] })];
    expect(sceneIsAvailable(links, "negotiate", [])).toBe(true);
    expect(sceneIsAvailable(links, "negotiate", ["fienden_dod"])).toBe(false);
  });

  it("several incoming links are alternative paths — one satisfied is enough", () => {
    const links = [
      link({ id: "l1", fromSceneId: "bar", toSceneId: "morning", requiresFlags: ["slept"] }),
      link({ id: "l2", fromSceneId: "room", toSceneId: "morning", requiresFlags: ["stayed_over"] })
    ];
    expect(sceneIsAvailable(links, "morning", [])).toBe(false);
    expect(sceneIsAvailable(links, "morning", ["stayed_over"])).toBe(true);
  });
});

describe("upsertSceneLink / removeSceneLink", () => {
  it("adds a new link", () => {
    const links = upsertSceneLink([], link({ id: "l1", fromSceneId: "a", toSceneId: "b" }));
    expect(links).toHaveLength(1);
  });

  it("replaces a link with the same id instead of duplicating it", () => {
    const original = link({ id: "l1", fromSceneId: "a", toSceneId: "b", label: "old" });
    const updated = link({ id: "l1", fromSceneId: "a", toSceneId: "b", label: "new" });
    const links = upsertSceneLink([original], updated);
    expect(links).toHaveLength(1);
    expect(links[0]?.label).toBe("new");
  });

  it("removes a link by id", () => {
    const links = removeSceneLink([link({ id: "l1", fromSceneId: "a", toSceneId: "b" })], "l1");
    expect(links).toEqual([]);
  });
});

describe("removeLinksForScene", () => {
  it("drops every link touching a deleted scene, both directions", () => {
    const links = [
      link({ id: "l1", fromSceneId: "bar", toSceneId: "morning" }),
      link({ id: "l2", fromSceneId: "morning", toSceneId: "epilogue" }),
      link({ id: "l3", fromSceneId: "fight", toSceneId: "epilogue" })
    ];
    expect(removeLinksForScene(links, "morning").map((l) => l.id)).toEqual(["l3"]);
  });
});

describe("danglingLinkIds", () => {
  it("finds links pointing at a scene id that no longer exists", () => {
    const scenes = [{ ...emptyCampaignScene(), id: "bar" }];
    const sceneLinks = [
      link({ id: "l1", fromSceneId: "bar", toSceneId: "bar" }),
      link({ id: "l2", fromSceneId: "bar", toSceneId: "deleted-scene" })
    ];
    expect(danglingLinkIds({ scenes, sceneLinks })).toEqual(["l2"]);
  });
});

describe("setScenePosition", () => {
  it("sets one scene's position and leaves the others untouched", () => {
    const scenes = [
      { ...emptyCampaignScene(), id: "a" },
      { ...emptyCampaignScene(), id: "b" }
    ];
    const moved = setScenePosition(scenes, "b", { x: 100, y: 200 });
    expect(moved.find((s) => s.id === "a")?.position).toBeUndefined();
    expect(moved.find((s) => s.id === "b")?.position).toEqual({ x: 100, y: 200 });
  });
});
