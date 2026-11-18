import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, it } from "vitest";
import { contrastRatio } from "../../src/ui/themes/theme";

const css = (path: string) => readFileSync(join("src/ui", path), "utf8");

/** The variables a rule block sets: `--name: value;` pairs. */
function variables(block: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
    found[match[1]!] = match[2]!.trim();
  return found;
}

/** Light is the base; dark is the base with what the dark block changes. */
function modes() {
  const text = css("tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const light = text.slice(text.indexOf("{") + 1, text.indexOf("}"));
  const darkStart = text.indexOf('.sandbox-root[data-shell="dark"]');
  const dark = text.slice(text.indexOf("{", darkStart) + 1, text.indexOf("}", darkStart));
  const base = variables(light);
  return { light: base, dark: { ...base, ...variables(dark) } };
}

const TEXT_COLOURS = [
  "--text",
  "--text-dim",
  "--text-faint",
  "--accent",
  "--highlight",
  "--success",
  "--accent-player",
  "--accent-ai",
  "--accent-locked",
  "--accent-danger",
];
const SURFACES = ["--bg", "--panel", "--panel-raised"];

for (const [mode, set] of Object.entries(modes())) {
  it(`every text colour reads on every surface in the ${mode} palette`, () => {
    const failures: string[] = [];
    for (const colour of TEXT_COLOURS)
      for (const surface of SURFACES) {
        const ratio = contrastRatio(set[colour]!, set[surface]!);
        if (ratio < 4.5) failures.push(`${colour} on ${surface}: ${ratio.toFixed(2)}`);
      }
    expect(failures).toEqual([]);
  });

  it(`text on a plum or brass surface reads in the ${mode} palette`, () => {
    expect(contrastRatio(set["--on-accent"]!, set["--accent-strong"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(set["--on-highlight"]!, set["--highlight"]!)).toBeGreaterThanOrEqual(4.5);
  });
}

it("keeps the palette in one place: the old colour sets are gone", () => {
  expect(css("styles.css")).not.toMatch(/:root\s*\{/);
  expect(css("styles.css")).not.toMatch(/--(bg|panel|text|border|accent[\w-]*)\s*:/);
  expect(css("experience.css")).not.toMatch(
    /\.sandbox-root(\[data-shell="dark"\])?\s*\{[^}]*--[\w-]+\s*:/,
  );
  expect(css("page-system.css")).not.toMatch(/--page-accent(-hover)?:\s*#/);
});

function stylesheets(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return stylesheets(path);
    return name.endsWith(".css") && basename(path) !== "tokens.css" ? [path] : [];
  });
}

/**
 * Colours written straight into a component's styles. The target is none (terrain, illustrations,
 * dice and combat effects aside); this limit is lowered as the stylesheets are moved to the
 * variables, and must never be raised.
 */
const DIRECT_COLOUR_LIMIT = 412;

it("counts the colours written directly in stylesheets, and lets the number only go down", () => {
  let count = 0;
  for (const path of stylesheets("src/ui"))
    count += (
      readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? []
    ).length;
  expect(count).toBeLessThanOrEqual(DIRECT_COLOUR_LIMIT);
});
