import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultThemeLibrary,
  PRESET_THEMES,
  ThemeLibrarySchema,
} from "../../src/ui/themes/theme";
import {
  activatePlayTheme,
  applyPlayTheme,
} from "../../src/ui/themes/conversationTheme";
import {
  loadThemeLibrary,
  saveThemeLibrary,
} from "../../src/ui/themes/themeStorage";
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());
describe("per-conversation appearance", () => {
  it("keeps a theme and custom background for each conversation across a reload", async () => {
    const forest = {
      ...PRESET_THEMES[1]!,
      backgroundMode: "custom" as const,
      backgroundDataUrl: "data:image/png;base64,aGVsbG8=",
    };
    let library = activatePlayTheme(defaultThemeLibrary(), "first");
    library = applyPlayTheme(library, forest, "first");
    library = activatePlayTheme(library, "second");
    expect(library.active.id).toBe("parchment");
    library = applyPlayTheme(library, PRESET_THEMES[2]!, "second");
    await saveThemeLibrary(library);
    const loaded = (await loadThemeLibrary())!;
    expect(activatePlayTheme(loaded, "first").active).toEqual(forest);
    expect(activatePlayTheme(loaded, "second").active.id).toBe("neon");
    expect(activatePlayTheme(loaded, null).active.id).toBe("parchment");
  });
  it("changes defaults without editing existing conversations and accepts old preference files", () => {
    const old = {
      version: 1,
      active: PRESET_THEMES[0]!,
      saved: [],
      shell: "light",
    };
    let library = ThemeLibrarySchema.parse(old);
    expect(library.conversations).toEqual({});
    library = activatePlayTheme(library, "first");
    library = applyPlayTheme(
      activatePlayTheme(library, null),
      PRESET_THEMES[3]!,
      null,
    );
    expect(activatePlayTheme(library, "first").active.id).toBe("parchment");
    expect(activatePlayTheme(library, "new").active.id).toBe("quiet");
  });
});
