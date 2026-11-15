import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

/** Words for how the AI turn is built inside. Players should never read them in the interface. */
const INTERNAL_WORDS = [/\bPass ?[12]\b/, /\bhonou?rs this\b/, /\bmutation chain\b/i];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx|ts)$/.test(name) ? [path] : [];
  });
}

/** Lines that are not comments. A word inside a comment is for developers. */
function codeLines(path: string): { line: number; text: string }[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((text, index) => ({ line: index + 1, text }))
    .filter(({ text }) => !/^\s*(\/\/|\/\*|\*)/.test(text));
}

it("keeps internal turn-building words out of the interface text", () => {
  const found: string[] = [];
  for (const path of sourceFiles("src/ui")) {
    for (const { line, text } of codeLines(path)) {
      if (INTERNAL_WORDS.some((word) => word.test(text)))
        found.push(`${path}:${line}: ${text.trim()}`);
    }
  }
  expect(found).toEqual([]);
});
