import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PlayThemeSchema,
  PRESET_THEMES,
  contrastRatio,
  defaultThemeLibrary,
} from "../../src/ui/themes/theme";
import {
  loadThemeLibrary,
  saveThemeLibrary,
} from "../../src/ui/themes/themeStorage";

describe("local appearance library", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory());
  });
  it("starts without a saved preference and persists a custom image and named theme", async () => {
    expect(await loadThemeLibrary()).toBeNull();
    const library = defaultThemeLibrary();
    library.active = {
      ...library.active,
      id: "my-theme",
      name: "Moonlight",
      backgroundMode: "custom",
      backgroundDataUrl: "data:image/png;base64,aGVsbG8=",
    };
    library.saved = [{ ...library.active }];
    library.shell = "dark";
    await saveThemeLibrary(library);
    expect(await loadThemeLibrary()).toEqual(library);
  });
  it("keeps the last saved preference when a later update is invalid", async () => {
    const library = defaultThemeLibrary();
    await saveThemeLibrary(library);
    await expect(
      saveThemeLibrary({
        ...library,
        active: { ...library.active, panelOpacity: 0 },
      }),
    ).rejects.toThrow();
    expect(await loadThemeLibrary()).toEqual(library);
  });
  it("rejects executable and remote backgrounds and out-of-range reading controls", () => {
    const theme = PRESET_THEMES[0]!;
    for (const backgroundDataUrl of [
      "javascript:alert(1)",
      "https://example.com/background.png",
      "data:image/svg+xml;base64,PHN2Zz4=",
    ]) {
      expect(
        PlayThemeSchema.safeParse({ ...theme, backgroundDataUrl }).success,
      ).toBe(false);
    }
    expect(
      PlayThemeSchema.safeParse({ ...theme, textSize: 1000 }).success,
    ).toBe(false);
    expect(
      PlayThemeSchema.safeParse({ ...theme, accent: "red; display:none" })
        .success,
    ).toBe(false);
  });
  it("ships readable preset color pairs and identifies low contrast", () => {
    for (const theme of PRESET_THEMES) {
      expect(PlayThemeSchema.safeParse(theme).success).toBe(true);
      expect(contrastRatio(theme.panel, theme.text)).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
  });
});
