import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ornamentVars } from "../../src/ui/play/ornament/vars";
import { PRESET_THEMES } from "../../src/ui/themes/theme";
import { chromium, launchOptions } from "./chromium";

/**
 * The sign with the name of the place, drawn by a real browser with the real stylesheets, over a
 * picture and in the empty box of a place without one. It must lie inside the box, in the middle.
 * Skipped where there is no Playwright with a Chromium.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- the browser is driven through the untyped launcher in ./chromium. */
let browser: any;
beforeAll(async () => {
  if (chromium) browser = await chromium.launch(launchOptions);
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const theme = PRESET_THEMES.find((t) => t.id === "fantasy")!;
async function measure(withPicture: boolean, width: number, name: string) {
  const vars = Object.entries(ornamentVars(theme))
    .map(([key, value]) => `${key}: ${String(value).replaceAll('"', "&quot;")};`)
    .join(" ");
  const css = ["src/ui/play/play-view.css", "src/ui/play/ornament/ornament.css"]
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  try {
    await page.setContent(`<!doctype html><style>${css}</style>
      <body style="margin:0; --panel:${theme.panel}; --text:${theme.text}; --photo-text:#fff; --scrim:#000;">
      <div style="${vars} width:${width}px; padding:16px;">
        <div class="play-view__scene orn-frame${withPicture ? "" : " play-view__scene--empty"}" data-orn-set="forged" data-orn-level="full" role="img">
          ${withPicture ? '<div style="position:absolute; inset:0; background:#456"></div>' : ""}
          <p class="play-view__scene-name orn-nameplate" data-orn-set="forged" data-orn-level="full">${name}</p>
        </div></div></body>`);
    return await page.evaluate(() => {
      const box = (el: Element) => el.getBoundingClientRect();
      const scene = box(document.querySelector(".play-view__scene")!);
      const sign = box(document.querySelector(".play-view__scene-name")!);
      return {
        left: sign.left - scene.left,
        right: scene.right - sign.right,
        bottom: scene.bottom - sign.bottom,
        top: sign.top - scene.top,
        sceneHeight: scene.height,
        sceneWidth: scene.width,
        signWidth: sign.width,
      };
    });
  } finally {
    await page.close();
  }
}

for (const [label, withPicture] of [
  ["over a picture", true],
  ["in the empty box of a place without a picture", false],
] as const)
  for (const name of ["A missing messenger", "The old watchtower at the edge of the forest road"])
    it.skipIf(!chromium)(
      `keeps the sign inside the box and in the middle, ${label}: ${name}`,
      async () => {
        const seen = await measure(withPicture, 340, name);
        expect(seen.left).toBeGreaterThanOrEqual(0);
        expect(seen.right).toBeGreaterThanOrEqual(0);
        expect(Math.abs(seen.left - seen.right)).toBeLessThanOrEqual(2);
        expect(seen.signWidth).toBeLessThanOrEqual(seen.sceneWidth);
        if (withPicture) {
          // At the foot of the picture.
          expect(seen.bottom).toBeGreaterThanOrEqual(0);
          expect(seen.bottom).toBeLessThanOrEqual(30);
        } else {
          // In the middle of the empty box.
          expect(Math.abs(seen.top - seen.bottom)).toBeLessThanOrEqual(2);
        }
      },
    );
