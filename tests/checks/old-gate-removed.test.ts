import { expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const removed = [
  "src/checks/gateEncounter.ts",
  "src/checks/gateCombat.ts",
  "src/checks/gateGeometry.ts",
  "src/checks/gateIntent.ts",
  "src/scenarios/gateWorld.ts",
  "src/ui/components/GateScenePanel.tsx",
  "src/ui/home/gateScenario.ts",
];
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });

it("has no old gatehouse engine files left", () => {
  expect(removed.filter((file) => existsSync(file))).toEqual([]);
});

it("imports nothing from the removed gatehouse files", () => {
  const pattern =
    /from\s+["'][^"']*(gateEncounter|gateCombat|gateGeometry|gateIntent|gateWorld|GateScenePanel|gateScenario)["']/;
  const offenders = [...sources("src"), ...sources("tests")].filter(
    (file) =>
      !file.endsWith("old-gate-removed.test.ts") && pattern.test(readFileSync(file, "utf8")),
  );

  expect(offenders).toEqual([]);
});
