import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

/** Words that only Swedish uses. Texts in these files must come from the language lists. */
const SWEDISH =
  /[åäöÅÄÖ]|\b(?:Visa|bildarkiv|Bildarkiv|Spara|Avbryt|Stäng|Ändra|Inga bilder|Klicka|Spelledare)\b/;

/** Lines that are allowed to be Swedish, and why. */
const ALLOWED: { file: string; contains: string; why: string }[] = [
  {
    file: "EngineStore.tsx",
    contains: "gå|head|leave",
    why: "recognises Swedish walking words in what the player types",
  },
  {
    file: "EmmaInnExampleDialog.tsx",
    contains: "värdshussalen",
    why: "finds a room in a Swedish example by name",
  },
  {
    file: "CodexConnection.tsx",
    contains: "Anslut appar",
    why: "names a button in the Codex app, which is Swedish",
  },
  {
    file: "CodexConnection.tsx",
    contains: "Tillåt",
    why: "names a button in the Codex app, which is Swedish",
  },
  {
    file: "CampaignStudio.tsx",
    contains: "Emma och Einar",
    why: "the title of the bundled Swedish example",
  },
  { file: "AdventureStudio.tsx", contains: "Midgård", why: "a place name used as an example" },
  { file: "LanguageProvider.tsx", contains: "", why: "this is where the Swedish texts belong" },
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx|ts)$/.test(name) ? [path] : [];
  });
}

it("keeps Swedish text out of the interface unless a language list or a listed exception has it", () => {
  const found: string[] = [];
  for (const path of files("src/ui")) {
    const name = path.split("/").at(-1)!;
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((text, index) => {
        if (/^\s*(\/\/|\/\*|\*)/.test(text) || !SWEDISH.test(text)) return;
        const allowed = ALLOWED.some((rule) => rule.file === name && text.includes(rule.contains));
        if (!allowed) found.push(`${path}:${index + 1}: ${text.trim().slice(0, 120)}`);
      });
  }
  expect(found).toEqual([]);
});
