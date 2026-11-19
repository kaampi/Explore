import { describe, expect, it } from "vitest";
import { PlayThemeSchema, PRESET_THEMES, contrastRatio } from "../../src/ui/themes/theme";
import {
  ORNAMENT_PARTS,
  SET_PARTS,
  effectiveOrnament,
  setForPart,
} from "../../src/ui/play/ornament/sets";
import {
  NOTE_COLORS,
  inkOn,
  mixHex,
  ornamentColors,
  ornamentVars,
  plateColors,
} from "../../src/ui/play/ornament/vars";

describe("the theme's ornament fields", () => {
  it("are plain, full and Newsreader in a theme saved before they existed", () => {
    const old = { ...PRESET_THEMES[0]! } as Record<string, unknown>;
    delete old.ornament;
    delete old.ornamentLevel;
    delete old.headingFont;

    const read = PlayThemeSchema.parse(old);

    expect(read).toMatchObject({
      ornament: "plain",
      ornamentLevel: "full",
      headingFont: "newsreader",
    });
  });

  it("refuse a set, a level or a typeface that does not exist", () => {
    const base = PRESET_THEMES[0]!;
    expect(() => PlayThemeSchema.parse({ ...base, ornament: "gothic" })).toThrow();
    expect(() => PlayThemeSchema.parse({ ...base, ornamentLevel: "lots" })).toThrow();
    expect(() => PlayThemeSchema.parse({ ...base, headingFont: "comic" })).toThrow();
  });

  it("are kept in the themes that come with the app, and Fantasy uses the forged set", () => {
    for (const theme of PRESET_THEMES) expect(PlayThemeSchema.parse(theme)).toEqual(theme);
    const fantasy = PRESET_THEMES.find((theme) => theme.id === "fantasy")!;
    expect(fantasy).toMatchObject({ ornament: "forged", headingFont: "cinzel" });
    // The colours of the sketch.
    expect(fantasy).toMatchObject({
      background: "#101217",
      panel: "#1a1d24",
      text: "#ece7dd",
      accent: "#c9a66b",
    });
    // The four themes that were there before are still plain.
    for (const id of ["parchment", "forest", "neon", "quiet"])
      expect(PRESET_THEMES.find((theme) => theme.id === id)!.ornament).toBe("plain");
  });
});

describe("ornament sets", () => {
  it("have all eight parts, or fall back on plain for a part they do not have", () => {
    expect(ORNAMENT_PARTS).toHaveLength(8);
    for (const set of ["plain", "forged", "hull"] as const)
      for (const part of ORNAMENT_PARTS) {
        const drawn = setForPart(set, part);
        expect(drawn === set || drawn === "plain", `${set}/${part}`).toBe(true);
        if (!SET_PARTS[set].includes(part)) expect(drawn).toBe("plain");
      }
    // Forged draws every part itself.
    expect(SET_PARTS.forged).toEqual(ORNAMENT_PARTS);
    // Plain draws none: it is the quiet look the parts fall back on.
    expect(SET_PARTS.plain).toEqual([]);
  });

  it("draw plain at level none, and when the player asks for plain frames", () => {
    expect(effectiveOrnament({ ornament: "forged", ornamentLevel: "none" })).toEqual({
      set: "plain",
      level: "none",
    });
    expect(
      effectiveOrnament({ ornament: "forged", ornamentLevel: "full" }, { simple: true }),
    ).toEqual({ set: "plain", level: "none" });
    expect(effectiveOrnament({ ornament: "forged", ornamentLevel: "light" })).toEqual({
      set: "forged",
      level: "light",
    });
    expect(effectiveOrnament({})).toEqual({ set: "plain", level: "none" });
  });
});

describe("the variables of a theme's ornaments", () => {
  const fantasy = PRESET_THEMES.find((theme) => theme.id === "fantasy")!;
  const frame = (theme: Parameters<typeof ornamentVars>[0], simple = false) =>
    String((ornamentVars(theme, { simple }) as Record<string, string>)["--ornament-frame"]);

  it("make no pictures for plain, for level none, or for plain frames", () => {
    expect(frame({ ...fantasy, ornament: "plain" })).toBe("none");
    expect(frame({ ...fantasy, ornamentLevel: "none" })).toBe("none");
    expect(frame(fantasy, true)).toBe("none");
    // Level none and plain frames look the same as plain: the same variables, every one.
    const plain = ornamentVars({ ...fantasy, ornament: "plain" }) as Record<string, string>;
    const none = ornamentVars({ ...fantasy, ornamentLevel: "none" }) as Record<string, string>;
    const simple = ornamentVars(fantasy, { simple: true }) as Record<string, string>;
    expect(none).toEqual(plain);
    expect(simple).toEqual(plain);
  });

  it("draw the frame in the theme's own colours, with the vine only at full", () => {
    const full = decodeURIComponent(frame(fantasy));
    const light = decodeURIComponent(frame({ ...fantasy, ornamentLevel: "light" }));
    const colors = ornamentColors(fantasy);

    expect(full).toContain(colors.ornament);
    expect(full).toContain(colors.hi);
    expect(full).toContain("<circle"); // the vine's leaves
    expect(light).toContain(colors.ornament);
    expect(light).not.toContain("<circle");
    // Another theme gives another colour, so none is written into the parts.
    const other = decodeURIComponent(frame({ ...fantasy, accent: "#336699" }));
    expect(other).toContain("#336699");
    expect(other).not.toContain(colors.ornament);
  });

  it("make a frame of nine parts: one corner drawn once and mirrored", () => {
    const svg = decodeURIComponent(frame(fantasy));
    expect(svg.match(/<use /g)).toHaveLength(4);
    expect(svg.match(/<g id="c">/g)).toHaveLength(1);
  });

  it("falls back on a colour of its own for a theme read from an old file with none", () => {
    const vars = ornamentVars({ ornament: "forged" }) as Record<string, string>;
    expect(vars["--ornament"]).toMatch(/^#[\da-f]{6}$/i);
  });
});

describe("the contrast of text on the ornaments", () => {
  const samples = [
    ...PRESET_THEMES.map((theme) => ({ name: theme.id, accent: theme.accent })),
    { name: "dark brown", accent: "#4a3418" },
    { name: "pale", accent: "#f2e6c0" },
    { name: "blue", accent: "#2f5f9f" },
  ];

  it("is at least 4.5 : 1 for lettering on a sign, in every theme", () => {
    for (const sample of samples) {
      const { bg, text } = plateColors({ accent: sample.accent });
      expect(contrastRatio(text, bg), sample.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("is at least 4.5 : 1 for the number in a seal, in the themes that come with the app", () => {
    for (const theme of PRESET_THEMES)
      expect(contrastRatio(inkOn(theme.accent), theme.accent), theme.id).toBeGreaterThanOrEqual(
        4.5,
      );
  });

  it("is at least 4.5 : 1 for text on a note, which is the same in every theme", () => {
    expect(contrastRatio(NOTE_COLORS.text, NOTE_COLORS.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("mixes colours as hex", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#102030", "#102030", 0.7)).toBe("#102030");
  });
});
