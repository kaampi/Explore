import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const cssFiles = [
  "public/fonts/barlow/barlow.css",
  "public/fonts/ornament-fonts.css",
  "public/fonts/app-fonts.css",
];

it("has every typeface file that a font stylesheet points to, so the app works without a network", () => {
  for (const css of cssFiles) {
    const urls = [...read(css).matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((m) => m[1]!);
    expect(urls.length, css).toBeGreaterThan(0);
    for (const url of urls) expect(existsSync(join("public", url)), url).toBe(true);
  }
});

it("keeps the licence of every typeface next to it, and every one is under the Open Font License", () => {
  for (const dir of readdirSync("public/fonts", { withFileTypes: true }).filter((e) =>
    e.isDirectory(),
  )) {
    const licence = join("public/fonts", dir.name, "OFL.txt");
    expect(existsSync(licence), licence).toBe(true);
    expect(read(licence)).toContain("SIL OPEN FONT LICENSE");
  }
  // Every typeface file sits in a directory with a licence.
  for (const css of cssFiles)
    for (const m of read(css).matchAll(/url\((\/fonts\/[^)]+)\)/g))
      expect(existsSync(join("public", dirname(m[1]!), "OFL.txt")), m[1]).toBe(true);
});

it("loads the typefaces from the app and fetches nothing from a font service", () => {
  const page = read("index.html");
  for (const css of cssFiles) expect(page).toContain(css.replace("public", ""));
  expect(page).not.toMatch(/googleapis|gstatic/);
  expect(read("src-tauri/tauri.conf.json")).not.toMatch(/googleapis|gstatic/);
});

it("bundles the typefaces of the ornament sets and the app's own", () => {
  const families = cssFiles.flatMap((css) =>
    [...read(css).matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]),
  );
  for (const family of [
    "Barlow",
    "Cinzel",
    "IM Fell English",
    "Oxanium",
    "JetBrains Mono",
    "Newsreader",
    "IBM Plex Mono",
  ])
    expect(families, family).toContain(family);
});
