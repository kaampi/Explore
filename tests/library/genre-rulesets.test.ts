import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { exampleRulesetTemplates } from "../../src/library/exampleTemplates";
import { skillIdFor } from "../../src/library/sceneSync";

it("pairs each genre with a shipped cover and meaningful stats", () => {
  const sets = exampleRulesetTemplates();
  const expected = [
    ["fantasy", "fantasy", "strength"],
    ["scifi", "sci-fi", "piloting"],
    ["noir", "noir", "perception"],
    ["horror", "horror", "sanity"],
    ["cozy", "cozy", "care"],
    ["romance", "romance", "empathy"],
    ["reality", "contemporary", "practical-skills"],
  ];
  expect(sets.filter((set) => set.imageDataUrl)).toHaveLength(expected.length);
  for (const [id, file, keyStat] of expected) {
    const set = sets.find((row) => row.id === `example-ruleset-${id}`)!;
    const url = `/rulesets/${file}.webp`;
    expect(set.imageDataUrl).toBe(url);
    expect(
      readFileSync(resolve("public", url.slice(1)))
        .subarray(8, 12)
        .toString(),
    ).toBe("WEBP");
    expect(set.attributes.some((value) => value.id === keyStat)).toBe(true);
    for (const value of set.attributes) {
      expect([value.min, value.max]).toEqual(id === "fantasy" ? [1, 18] : [0, 100]);
      expect(value.highMeaning).not.toBe("");
      expect(value.lowMeaning).not.toBe("");
    }
  }
  expect(
    sets
      .find((set) => set.id === "example-ruleset-horror")
      ?.attributes.find((a) => a.id === "sanity")?.maxShift,
  ).toBe(10);
});

it("keeps skill ids and cover paths consistent across translations", () => {
  const english = exampleRulesetTemplates();
  for (const [language, contemporary, horror] of [
    ["sv", "Nutid", "Skräck"],
    ["nb", "Samtid", "Skrekk"],
  ] as const) {
    const sets = exampleRulesetTemplates(language);
    expect(sets.find((row) => row.id === "example-ruleset-reality")?.name).toBe(contemporary);
    expect(sets.find((row) => row.id === "example-ruleset-horror")?.name).toBe(horror);
    expect(
      sets.map(({ id, imageDataUrl, attributes }) => [
        id,
        imageDataUrl,
        attributes.map((a) => a.id),
      ]),
    ).toEqual(
      english.map(({ id, imageDataUrl, attributes }) => [
        id,
        imageDataUrl,
        attributes.map((a) => a.id),
      ]),
    );
    const noir = sets.find((row) => row.id === "example-ruleset-noir")!;
    expect(skillIdFor("Melee", { scales: noir.attributes })).toBe("melee");
  }
});
