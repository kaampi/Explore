import { describe, it, expect } from "vitest";
import {
  compactionIsUseful,
  flagsForCompactedGroup,
  groupLayersForCompaction,
  keywordsForCompactedGroup,
  parseCompactedContents,
  selectPendingForCompaction
} from "@layers/LayerCompaction";
import type { Layer } from "@state/StateSchema";

function layer(overrides: Partial<Layer> & Pick<Layer, "id" | "type" | "content">): Layer {
  return { priority: 5, active: false, aiGenerated: true, once: false, spent: false, ...overrides };
}

describe("groupLayersForCompaction", () => {
  it("groups two or more notes of the same display type", () => {
    const groups = groupLayersForCompaction(
      [
        layer({ id: "a", type: "core", content: "Emma is reserved." }),
        layer({ id: "b", type: "core", content: "Emma stays composed." }),
        layer({ id: "c", type: "relationship", content: "She is warming to the player." })
      ],
      ["emma"]
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.type).toBe("core");
    expect(groups[0]?.layers).toHaveLength(2);
  });

  it("treats mis-tagged personality notes as core", () => {
    const groups = groupLayersForCompaction(
      [
        layer({
          id: "a",
          type: "environment",
          content: "Emma maintains a reserved demeanor in public."
        }),
        layer({ id: "b", type: "core", content: "Emma is slow to trust." })
      ],
      ["emma"]
    );
    expect(groups).toEqual([expect.objectContaining({ type: "core" })]);
    expect(groups[0]?.layers).toHaveLength(2);
  });
});

describe("parseCompactedContents", () => {
  it("accepts a tighter list than the input", () => {
    expect(parseCompactedContents('{"contents": ["Emma is a reserved bartender."]}', 4)).toEqual([
      "Emma is a reserved bartender."
    ]);
  });

  it("rejects expanding the pile", () => {
    expect(
      parseCompactedContents('{"contents": ["one", "two", "three"]}', 2)
    ).toBeNull();
  });
});

describe("compactionIsUseful / flags", () => {
  it("counts fewer notes as useful", () => {
    expect(compactionIsUseful(["a long note", "another long note"], ["short"])).toBe(true);
  });

  it("keeps pending flags when every source was a proposal", () => {
    expect(
      flagsForCompactedGroup([
        layer({ id: "a", type: "core", content: "x", aiGenerated: true, active: false }),
        layer({ id: "b", type: "core", content: "y", aiGenerated: true, active: false })
      ])
    ).toEqual({ active: false, aiGenerated: true });
  });

  it("selects only pending AI notes", () => {
    const pending = selectPendingForCompaction(
      [
        layer({ id: "a", type: "core", content: "Emma is reserved.", aiGenerated: true, active: false }),
        layer({ id: "b", type: "core", content: "Emma is composed.", aiGenerated: true, active: false }),
        layer({ id: "c", type: "core", content: "Player-written.", aiGenerated: false, active: true })
      ],
      ["emma"]
    );
    expect(pending[0]?.layers.map((item) => item.id).sort()).toEqual(["a", "b"]);
  });
});

describe("keywordsForCompactedGroup", () => {
  it("unions keywords when every source layer is gated", () => {
    expect(
      keywordsForCompactedGroup([
        layer({ id: "a", type: "environment", content: "a", keywords: ["ring"] }),
        layer({ id: "b", type: "environment", content: "b", keywords: ["precious", "ring"] })
      ])
    ).toEqual(["ring", "precious"]);
  });

  it("drops the gate when any source layer is always-on", () => {
    expect(
      keywordsForCompactedGroup([
        layer({ id: "a", type: "environment", content: "a", keywords: ["ring"] }),
        layer({ id: "b", type: "environment", content: "always on" })
      ])
    ).toEqual([]);
  });
});
