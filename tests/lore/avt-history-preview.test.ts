import { describe, expect, it } from "vitest";
import { previewAvtHistory } from "../../src/lore/avtHistoryPreview";

const sample = () => ({
  version: "1.11.0", story: { id: "story-old", title: "Harbor" },
  branches: [{ id: "branch-old" }],
  entries: [
    { id: "entry-a", type: "user", content: "Hello", branchId: "branch-old" },
    { id: "entry-b", type: "assistant", content: "Welcome", parentId: "entry-a", branchId: "branch-old" },
  ],
});
describe("AVT transcript preview", () => {
  it("preserves source text and remaps parent and branch references", () => {
    const input = sample();
    let counter = 0;
    const preview = previewAvtHistory(input, () => `mapped-${++counter}`);
    expect(preview.lines).toHaveLength(2);
    expect(preview.lines[0]?.content).toBe("Hello");
    expect(preview.lines[1]?.parentTargetId).toBe(preview.lines[0]?.targetId);
    expect(preview.lines[1]?.branchTargetId).toBe(preview.lines[0]?.branchTargetId);
    expect(input.entries[0]?.id).toBe("entry-a");
  });
  it("warns on dangling links without making up a target", () => {
    const input = sample();
    input.entries[1]!.parentId = "missing";
    const preview = previewAvtHistory(input);
    expect(preview.lines[1]?.parentTargetId).toBeNull();
    expect(preview.warnings.some(w => w.includes("unknown parent"))).toBe(true);
  });
});
