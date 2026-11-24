import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, launchOptions } from "./chromium";

/**
 * The play view in a real browser at the size of a phone. jsdom has no layout, so what has to be
 * seen in pixels is checked here. Needs Playwright with a Chromium; where there is none (a plain
 * install, the build server) the test is skipped, not failed.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- the browser is driven through the untyped launcher in ./chromium. */
type Browser = any;

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let url = "";
beforeAll(async () => {
  if (!chromium) return;
  server = await createServer({ logLevel: "silent", server: { port: 0, host: "127.0.0.1" } });
  await server.listen();
  const address = server.httpServer!.address();
  url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 5173}/`;
  browser = await chromium.launch(launchOptions);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

it.skipIf(!chromium)(
  "at 390 × 844 the field of What do you do? is on the screen, the story scrolls by itself, and To latest works",
  async () => {
    const page = await browser!.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(url);
      await page.waitForTimeout(1500);
      await page.getByRole("button", { name: "Build", exact: true }).click();
      await page.getByRole("menuitem", { name: "Adventures", exact: true }).click();
      await page.getByText("Connected adventure example").first().click();
      await page.locator(".storyboard-card").first().click({ button: "right" });
      await page.locator('[role="menuitem"]', { hasText: "Test this scene" }).click();
      await page.waitForSelector(".play-view");

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForSelector(".play-view--narrow");
      // Enough has happened for the story to be longer than its room.
      for (let i = 0; i < 5; i++) {
        await page.getByRole("button", { name: "Look around" }).first().click();
        await page.waitForTimeout(200);
      }

      const seen = await page.evaluate(() => {
        const box = (selector: string) => {
          const rect = document.querySelector(selector)!.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, height: rect.height };
        };
        const log = document.querySelector(".play-story__log")!;
        return {
          field: box(".play-do textarea"),
          story: box(".play-story"),
          page: document.documentElement.scrollHeight,
          screen: window.innerHeight,
          logScrolls: log.scrollHeight > log.clientHeight,
        };
      });
      // The field is on the screen, not far below it, and the page itself does not scroll.
      expect(seen.field.top).toBeGreaterThanOrEqual(0);
      expect(seen.field.bottom).toBeLessThanOrEqual(seen.screen);
      expect(seen.page).toBeLessThanOrEqual(seen.screen + 1);
      // The story has real room, and scrolls inside itself.
      expect(seen.story.height).toBeGreaterThan(120);
      expect(seen.logScrolls).toBe(true);

      // Scrolled up, To latest shows; pressed, it takes the story down again.
      await page.evaluate(() => document.querySelector(".play-story__log")!.scrollTo({ top: 0 }));
      await page.waitForSelector(".play-story__latest");
      await page.locator(".play-story__latest").click();
      await page.waitForFunction(() => {
        const log = document.querySelector(".play-story__log")!;
        return log.scrollHeight - log.scrollTop - log.clientHeight < 80;
      });
      expect(await page.locator(".play-story__latest").count()).toBe(0);
      // The field is still on the screen after all that.
      const after = await page.evaluate(
        () => document.querySelector(".play-do textarea")!.getBoundingClientRect().bottom,
      );
      expect(after).toBeLessThanOrEqual(844);
    } finally {
      await page.close();
    }
  },
  120_000,
);
