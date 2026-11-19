import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../src/ui/themes/theme";

/*
  jsdom cannot hover, so this reads controls.css the way a browser would: for a button with these
  classes, which rule wins each property at rest and when hovered (the most specific rule, and the
  later one when they tie). Then it checks that the text reads against the background.
*/
type Rule = { selector: string; body: Record<string, string>; order: number };

function parseRules(css: string): Rule[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  let order = 0;
  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1]!.trim();
    if (selector.startsWith("@") || /^(to|from|\d+%)$/.test(selector)) continue;
    const body: Record<string, string> = {};
    for (const declaration of match[2]!.split(";")) {
      const at = declaration.indexOf(":");
      if (at > 0) body[declaration.slice(0, at).trim()] = declaration.slice(at + 1).trim();
    }
    rules.push({ selector, body, order: order++ });
  }
  return rules;
}

function classesOutsideIs(selector: string) {
  return Array.from(selector.replace(/:is\([^)]*\)/g, "").matchAll(/\.([\w-]+)/g)).map(
    (m) => m[1]!,
  );
}
function isList(selector: string): string[] | undefined {
  const list = selector.match(/:is\(([^)]*)\)/)?.[1];
  return list?.split(",").map((part) => part.trim().replace(/^\./, ""));
}
function specificity(selector: string) {
  const plain = classesOutsideIs(selector).length;
  const pseudo = (selector.match(/:(root|hover|focus-visible|disabled)\b/g) ?? []).length;
  return plain + (isList(selector) ? 1 : 0) + pseudo;
}
function applies(rule: Rule, classes: string[], hovered: boolean) {
  const { selector } = rule;
  // A hovered button is still a button at rest: the rules without :hover apply to it too.
  if (selector.includes(":hover") && !hovered) return false;
  if (/:(focus-visible|disabled)\b/.test(selector.replace(":not(:disabled)", ""))) return false;
  if (!classesOutsideIs(selector).every((name) => classes.includes(name))) return false;
  const list = isList(selector);
  return !list || list.some((name) => classes.includes(name));
}
function computed(rules: Rule[], classes: string[], hovered: boolean) {
  const result: Record<string, string> = {};
  const winners: Record<string, Rule> = {};
  for (const rule of rules) {
    if (!applies(rule, classes, hovered)) continue;
    for (const [property, value] of Object.entries(rule.body)) {
      const best = winners[property];
      if (
        !best ||
        specificity(rule.selector) > specificity(best.selector) ||
        (specificity(rule.selector) === specificity(best.selector) && rule.order > best.order)
      ) {
        winners[property] = rule;
        result[property] = value;
      }
    }
  }
  return result;
}

/** The two palettes of tokens.css, as plain colour values. */
function palettes() {
  const text = readFileSync("src/ui/tokens.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const read = (block: string) =>
    Object.fromEntries(
      Array.from(block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)).map((m) => [
        m[1]!,
        m[2]!,
      ]),
    );
  const light = read(text.slice(text.indexOf("{") + 1, text.indexOf("}")));
  const darkAt = text.indexOf('.sandbox-root[data-shell="dark"]');
  const dark = read(text.slice(text.indexOf("{", darkAt) + 1, text.indexOf("}", darkAt)));
  return { light, dark: { ...light, ...dark } };
}
function resolve(value: string | undefined, palette: Record<string, string>) {
  const name = value?.match(/^var\((--[\w-]+)\)$/)?.[1];
  return name ? palette[name] : undefined;
}

const rules = parseRules(readFileSync("src/ui/controls.css", "utf8"));

/** Every way the old and new button classes are used together in the views. */
const FILLED: string[][] = [
  ["ui-button", "ui-button--primary"],
  ["sb-button"],
  ["sb-button", "sb-button--primary"],
  ["setup-start"],
  ["storyboard-primary"],
  ["anatomy-primary"],
  ["anatomy-button", "anatomy-primary"],
];
const PLAIN: string[][] = [
  ["ui-button", "ui-button--secondary"],
  ["sb-button", "sb-button--secondary"],
  ["sb-button", "sb-button--cream"],
  ["studio-list__btn"],
  ["anatomy-button"],
];
const DANGER: string[][] = [
  ["ui-button", "ui-button--danger"],
  ["sb-button", "sb-button--danger"],
  ["anatomy-danger"],
  ["anatomy-button", "anatomy-danger"],
];

describe("every button reads, at rest and when hovered, in both palettes", () => {
  for (const [mode, palette] of Object.entries(palettes())) {
    for (const [group, combos, textColour] of [
      ["main", FILLED, "--on-accent"],
      ["plain", PLAIN, "--text"],
      ["danger", DANGER, "--accent-danger"],
    ] as const)
      for (const combo of combos)
        for (const hovered of [false, true])
          it(`${group}: ${combo.join(" + ")} ${hovered ? "hovered" : "at rest"} (${mode})`, () => {
            const style = computed(rules, combo, hovered);
            const background = resolve(style.background, palette);
            const colour = resolve(style.color, palette);
            expect(background, "background").toBeDefined();
            expect(colour, "text colour").toBe(palette[textColour]);
            expect(contrastRatio(colour!, background!)).toBeGreaterThanOrEqual(4.5);
          });
  }

  it("keeps the main button plum when it is hovered, and a plain one off plum", () => {
    expect(computed(rules, ["sb-button"], true).background).toBe("var(--accent-strong-hover)");
    expect(computed(rules, ["sb-button", "sb-button--secondary"], true).background).toBe(
      "var(--panel-raised)",
    );
    expect(computed(rules, ["sb-button", "sb-button--danger"], true).background).toBe(
      "var(--panel-raised)",
    );
    expect(computed(rules, ["sb-button", "sb-button--cream"], true).background).toBe(
      "var(--panel-raised)",
    );
  });

  it("reads a filled danger button too, at rest and hovered", () => {
    for (const [mode, palette] of Object.entries(palettes()))
      for (const hovered of [false, true]) {
        const style = computed(
          rules,
          ["ui-button", "ui-button--danger", "ui-button--filled"],
          hovered,
        );
        const colour = resolve(style.color, palette);
        expect(colour, mode).toBe(palette["--on-danger"]);
        if (!hovered)
          expect(
            contrastRatio(colour!, resolve(style.background, palette)!),
          ).toBeGreaterThanOrEqual(4.5);
      }
  });
});
