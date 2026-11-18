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

  it(`a main button still reads when hovered, and a filled danger button reads, in the ${mode} palette`, () => {
    expect(
      contrastRatio(set["--on-accent"]!, set["--accent-strong-hover"]!),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(set["--on-danger"]!, set["--accent-danger"]!)).toBeGreaterThanOrEqual(4.5);
  });
}

it("applies the dark palette to the page itself as well as to the app frame", () => {
  expect(css("tokens.css")).toMatch(
    /:root\[data-shell="dark"\],\s*\.sandbox-root\[data-shell="dark"\]\s*\{/,
  );
});

it("writes no fallback colour inside a variable, since the variables always exist", () => {
  expect(css("experience.css")).not.toMatch(/\.message-context-menu[^}]*var\(--[\w-]+,\s*#/);
});

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
const DIRECT_COLOUR_LIMIT = 134;

/** Stylesheets whose colours are their own, as the palette decision allows: dice and combat effects. */
const OWN_COLOURS = new Set(["dice.css", "combat-stage.css", "roll-result.css"]);

it("counts the colours written directly in stylesheets, and lets the number only go down", () => {
  let count = 0;
  for (const path of stylesheets("src/ui").filter((file) => !OWN_COLOURS.has(basename(file))))
    count += (
      readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? []
    ).length;
  expect(count).toBeLessThanOrEqual(DIRECT_COLOUR_LIMIT);
});

it("keeps the hover colour of the main button in tokens.css, as a fixed value", () => {
  expect(css("tokens.css")).toMatch(/--accent-strong-hover:\s*#[0-9a-f]{6}/i);
  expect(css("page-system.css")).toMatch(/--page-accent-hover:\s*var\(--accent-strong-hover\)/);
});

/** Old button class names still used in the views. Lowered as views move to <Button>; never raised. */
const OLD_BUTTON_CLASS_LIMIT = 175;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith(".tsx") ? [path] : [];
  });
}

it("counts the old button classes in the views, and lets the number only go down", () => {
  const old =
    /\b(sb-button(?:--\w+)?|setup-start|storyboard-primary|anatomy-primary|anatomy-button|studio-list__btn|setup-text-btn|sb-link|anatomy-danger)\b/g;
  let count = 0;
  for (const path of sources("src/ui"))
    count += (readFileSync(path, "utf8").match(old) ?? []).length;
  expect(count).toBeLessThanOrEqual(OLD_BUTTON_CLASS_LIMIT);
});

it("gives the old button classes one rule each in controls.css, not one per view", () => {
  for (const name of [
    "sb-button",
    "setup-start",
    "storyboard-primary",
    "anatomy-primary",
    "anatomy-button",
    "studio-list__btn",
    "sb-link",
    "setup-text-btn",
  ]) {
    const rules = stylesheets("src/ui")
      .filter((path) => basename(path) !== "controls.css")
      .flatMap((path) =>
        (
          readFileSync(path, "utf8").match(
            new RegExp(`\\.${name}(?![\\w-])[^{]*\\{[^}]*\\}`, "g"),
          ) ?? []
        ).filter((rule) =>
          /(background|border|color|padding|font)/.test(rule.slice(rule.indexOf("{"))),
        ),
      );
    // What is left outside controls.css is layout or a view's own override, never the look of the button.
    for (const rule of rules)
      expect(rule, name).not.toMatch(/background:\s*var\(--(accent-active|page-accent)\)/);
  }
});

it("keeps colours out of the frame stylesheets and the map studio, except the play themes' own variables", () => {
  for (const name of ["experience.css", "styles.css", "page-system.css", "studio/worldMap.css"]) {
    const direct = css(name)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(line))
      // The play view's theme works in channels of the theme's own colours (the next step).
      .filter((line) => !/--play-/.test(line));
    expect(direct, name).toEqual([]);
  }
});

it("has no green button left in the frame: the old green is not used as a button surface", () => {
  for (const name of ["experience.css", "styles.css", "page-system.css"])
    expect(css(name), name).not.toMatch(/background:\s*var\(--accent-active\);\s*\n\s*color:\s*#/);
});

it("gives the Save map button the main button's colours", () => {
  const map = readFileSync("src/ui/studio/worldMap.css", "utf8");
  expect(map).toMatch(/button\.world-map__primary\s*\{[^}]*background:\s*var\(--accent-strong\)/);
  expect(map).not.toMatch(/--map-accent:\s*#/);
});

it("does not give the hero's update button a colour of its own", () => {
  expect(css("experience.css")).not.toMatch(/sb-update-check > \.sb-button\s*\{[^}]*background/);
});
