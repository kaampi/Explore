import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/desktop-build.yml", "utf8");
const lines = workflow.split("\n");

/** The steps of the job, each as its own block of text, in order. */
const steps = workflow
  .slice(workflow.indexOf("    steps:"))
  .split(/\n {6}- (?=name:|uses:)/)
  .slice(1);
const publish = steps.find((step) => step.includes("alpha-latest"))!;
const at = (text: string, part: string) => {
  const index = text.indexOf(part);
  expect(index, part).toBeGreaterThanOrEqual(0);
  return index;
};

describe("the Windows build publishes the installer as a pre-release", () => {
  it("has a publishing step, and it is the last one, after the tests, the build and the upload", () => {
    expect(publish).toBeDefined();
    expect(steps.at(-1)).toBe(publish);
    const index = (part: string) => steps.findIndex((step) => step.includes(part));
    expect(index("npm test")).toBeLessThan(steps.indexOf(publish));
    expect(index("npm run desktop:build")).toBeLessThan(steps.indexOf(publish));
    expect(index("actions/upload-artifact")).toBeLessThan(steps.indexOf(publish));
  });

  it("publishes only from main", () => {
    expect(publish).toContain("if: github.ref == 'refs/heads/main'");
    // No other step publishes: nothing else calls `gh release` or pushes a tag.
    for (const step of steps.filter((item) => item !== publish)) {
      expect(step).not.toContain("gh release");
      expect(step).not.toContain("git push");
    }
  });

  it("lets only this job write, and the rest of the flow only read", () => {
    const beforeJobs = workflow.slice(0, workflow.indexOf("\njobs:"));
    expect(beforeJobs).toMatch(/\npermissions:\n {2}contents: read\n/);
    expect(beforeJobs).not.toContain("write");
    expect(workflow.match(/contents: write/g)).toHaveLength(1);
    const job = workflow.slice(workflow.indexOf("  build-windows:"));
    expect(job).toMatch(/\n {4}permissions:\n {6}contents: write\n/);
    expect(lines.filter((line) => /^permissions:/.test(line))).toHaveLength(1);
  });

  it("uploads the file before the tag is moved, and creates the release before either", () => {
    const create = at(publish, "gh release create");
    const upload = at(publish, "gh release upload");
    const edit = at(publish, "gh release edit");
    const tag = at(publish, "git tag -f");
    const push = at(publish, "git push -f origin");
    expect(create).toBeLessThan(upload);
    expect(upload).toBeLessThan(edit);
    expect(edit).toBeLessThan(tag);
    expect(tag).toBeLessThan(push);
    expect(publish).toContain("--clobber");
  });

  it("makes a pre-release called 'Senaste alfa' with the fixed tag, and says which commit it was built from", () => {
    expect(publish).toContain('$tag = "alpha-latest"');
    expect(publish).toContain("--prerelease");
    expect(publish).toContain('--title "Senaste alfa"');
    expect(publish).toContain("Revision: ${{ github.sha }}");
    expect(publish).toContain("Built: $date");
    expect(publish).toMatch(/not signed/i);
    expect(publish).toContain("installer-output/kaampi-Explore-Setup.exe");
    expect(publish).toContain("GH_TOKEN: ${{ github.token }}");
    expect(publish).toContain("shell: pwsh");
  });

  it("stops at the first command that fails, so a half-published release is not called done", () => {
    expect(publish).toContain('$ErrorActionPreference = "Stop"');
    expect(publish).toContain("$LASTEXITCODE");
    expect(publish).not.toMatch(/releases\/latest/);
  });

  it("keeps the artifact for 14 days, for troubleshooting only", () => {
    expect(workflow).toContain("retention-days: 14");
    expect(workflow).not.toContain("retention-days: 90");
  });

  it("uses versions of the actions that run on Node 24", () => {
    const used = Array.from(
      workflow.matchAll(/uses: actions\/(checkout|setup-node|upload-artifact)@v(\d+)/g),
    );
    expect(used.map((match) => match[1])).toEqual(["checkout", "setup-node", "upload-artifact"]);
    for (const match of used) expect(Number(match[2]), match[1]).toBeGreaterThanOrEqual(6);
  });
});
