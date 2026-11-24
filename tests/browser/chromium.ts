import { existsSync } from "node:fs";
import { createRequire } from "node:module";

/* eslint-disable @typescript-eslint/no-explicit-any -- Playwright's types are not needed by the tests. */
export type ChromiumLauncher = { launch: (options?: any) => Promise<any> };

type Env = Record<string, string | undefined>;

/**
 * Finds Chromium for the browser tests, or returns undefined when there is none.
 *
 * - `CHROMIUM_EXECUTABLE` names a Chromium that is already installed some other way, for example
 *   `/opt/pw-browsers/chromium`. Without it, the one Playwright installed is used.
 * - With `REQUIRE_BROWSER_TESTS=1` a missing Chromium is an error, so that CI cannot skip the
 *   browser tests without anyone noticing. Elsewhere they are skipped.
 */
export function findChromium(env: Env = process.env): {
  chromium?: ChromiumLauncher;
  executablePath?: string;
} {
  const require = createRequire(import.meta.url);
  const wanted = env.CHROMIUM_EXECUTABLE?.trim();
  let chromium: ChromiumLauncher | undefined;
  let executablePath: string | undefined;
  try {
    const playwright = require("playwright") as {
      chromium: ChromiumLauncher & { executablePath(): string };
    };
    executablePath = wanted || playwright.chromium.executablePath();
    if (existsSync(executablePath)) chromium = playwright.chromium;
  } catch {
    chromium = undefined;
  }
  if (!chromium && env.REQUIRE_BROWSER_TESTS === "1")
    throw new Error(
      `REQUIRE_BROWSER_TESTS=1, but there is no Chromium to run the browser tests${
        executablePath ? ` (looked for ${executablePath})` : ""
      }. Run "npx playwright install --with-deps chromium" or set CHROMIUM_EXECUTABLE.`,
    );
  return { ...(chromium ? { chromium } : {}), ...(executablePath ? { executablePath } : {}) };
}

const found = findChromium();

/** Chromium, or undefined where there is none (the tests then skip themselves). */
export const chromium = found.chromium;

/** What to pass to `chromium.launch(...)`. */
export const launchOptions = {
  args: ["--no-sandbox"],
  ...(process.env.CHROMIUM_EXECUTABLE?.trim() ? { executablePath: found.executablePath } : {}),
};
