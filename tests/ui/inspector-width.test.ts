// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INSPECTOR_DEFAULT,
  INSPECTOR_MAX,
  INSPECTOR_MIN,
  clampInspectorWidth,
  loadInspectorWidth,
  saveInspectorWidth,
  widthForKey,
} from "../../src/ui/studio/inspectorWidth";

afterEach(() => vi.restoreAllMocks());

describe("clampInspectorWidth", () => {
  it("never goes below the original width", () => {
    expect(clampInspectorWidth(100)).toBe(INSPECTOR_MIN);
  });

  it("never goes above the maximum", () => {
    expect(clampInspectorWidth(5000)).toBe(INSPECTOR_MAX);
  });

  it("leaves room for the outline and the board when the layout is narrow", () => {
    expect(clampInspectorWidth(700, 900)).toBe(900 - 200 - 230 - 36);
  });

  it("still allows the minimum in a very narrow layout", () => {
    expect(clampInspectorWidth(600, 400)).toBe(INSPECTOR_MIN);
  });

  it("falls back to the default for nonsense", () => {
    expect(clampInspectorWidth(Number.NaN)).toBe(INSPECTOR_DEFAULT);
  });
});

describe("widthForKey", () => {
  it("makes the panel wider on ArrowLeft and narrower on ArrowRight", () => {
    expect(widthForKey("ArrowLeft", 400)).toBeGreaterThan(400);
    expect(widthForKey("ArrowRight", 400)).toBeLessThan(400);
  });

  it("goes back to the default on Home and to the widest on End", () => {
    expect(widthForKey("Home", 600)).toBe(INSPECTOR_DEFAULT);
    expect(widthForKey("End", 400)).toBe(INSPECTOR_MAX);
  });

  it("ignores other keys", () => {
    expect(widthForKey("a", 400)).toBeUndefined();
  });
});

describe("remembering the width", () => {
  it("saves and loads it", () => {
    window.localStorage.clear();
    saveInspectorWidth(512);

    expect(loadInspectorWidth()).toBe(512);
  });

  it("gives the default when nothing was saved", () => {
    window.localStorage.clear();

    expect(loadInspectorWidth()).toBe(INSPECTOR_DEFAULT);
  });

  it("gives the default when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(loadInspectorWidth()).toBe(INSPECTOR_DEFAULT);
  });

  it("does not fail when storage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => saveInspectorWidth(500)).not.toThrow();
  });

  it("ignores a stored value that is out of range", () => {
    window.localStorage.setItem("kaampi-storyboard-inspector-width", "99999");

    expect(loadInspectorWidth()).toBe(INSPECTOR_MAX);
  });
});
