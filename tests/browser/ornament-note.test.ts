import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { NOTE_COLORS, ornamentVars } from "../../src/ui/play/ornament/vars";
import { PRESET_THEMES, contrastRatio } from "../../src/ui/themes/theme";
import { chromium, launchOptions } from "./chromium";

/**
 * The note in the pack, drawn by a real browser with the real stylesheets: the words must lie on
 * the parchment in the note's colour, not in the old dark box of the pack. Skipped where there is
 * no Playwright with a Chromium.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- the browser is driven through the untyped launcher in ./chromium. */
let browser: any;
beforeAll(async () => {
  if (chromium) browser = await chromium.launch(launchOptions);
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const rgb = (css: string) => {
  const [r = 0, g = 0, b = 0] = (css.match(/[\d.]+/g) ?? []).map(Number);
  return `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;
};

for (const id of ["fantasy"]) {
  it.skipIf(!chromium)(`reads on the parchment in the ${id} theme`, async () => {
    const theme = PRESET_THEMES.find((t) => t.id === id)!;
    const vars = Object.entries(ornamentVars(theme))
      .map(([name, value]) => `${name}: ${String(value).replaceAll('"', "&quot;")};`)
      .join(" ");
    const css = ["src/ui/components/playerInventory.css", "src/ui/play/ornament/ornament.css"]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html><style>${css}</style>
        <body style="background:${theme.panel}; color:${theme.text}; --panel:${theme.panel};">
        <div style="${vars}">
          <div class="orn-note inventory-detail__reading" data-orn-set="forged" data-orn-level="full">
            <h3>Read</h3><p>Meet me at the old watchtower at dawn.</p>
          </div></div></body>`);
      const seen = await page.evaluate(() => {
        const note = document.querySelector(".orn-note")!;
        const words = note.querySelector("p")!;
        const heading = note.querySelector("h3")!;
        return {
          noteBg: getComputedStyle(note).backgroundColor,
          wordsBg: getComputedStyle(words).backgroundColor,
          wordsColor: getComputedStyle(words).color,
          wordsPadding: getComputedStyle(words).padding,
          headingColor: getComputedStyle(heading).color,
        };
      });
      // No box of its own, and the colours are the note's.
      expect(seen.wordsBg).toBe("rgba(0, 0, 0, 0)");
      expect(seen.wordsPadding).toBe("0px");
      expect(rgb(seen.noteBg)).toBe(NOTE_COLORS.bg);
      expect(rgb(seen.wordsColor)).toBe(NOTE_COLORS.text);
      expect(rgb(seen.headingColor)).toBe(NOTE_COLORS.text);
      expect(contrastRatio(rgb(seen.wordsColor), rgb(seen.noteBg))).toBeGreaterThanOrEqual(4.5);
    } finally {
      await page.close();
    }
  });
}
