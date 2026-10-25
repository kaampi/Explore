import { describe, it, expect } from "vitest";
import { rankMemories, buildMemoryBlocks } from "@memory/MemoryEngine";
import type { Session, MemoryEntry } from "@state/StateSchema";

function makeSession(overrides: Partial<Session["memory"]> = {}): Session {
  return {
    openedRoomIds: [],
    storyFlags: [],
    partyIds: [],
    partyHoldIds: [],
    partyPendingIds: [],
    schemaVersion: 2,
    id: "s1",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 100,
    characters: {},
    relationships: {},
    layers: [],
    memory: { episodic: [], semantic: [], relational: [], ...overrides },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: []
  };
}

function entry(overrides: Partial<MemoryEntry> & Pick<MemoryEntry, "id">): MemoryEntry {
  return { createdAtTurn: 0, importance: 0.5, content: "memory content", ...overrides };
}

describe("rankMemories", () => {
  it("ranks a highly important recent memory above a trivial old one", () => {
    const session = makeSession({
      episodic: [
        entry({ id: "old-trivial", createdAtTurn: 0, importance: 0.1, content: "old trivial" }),
        entry({ id: "recent-important", createdAtTurn: 99, importance: 0.9, content: "recent important" })
      ]
    });
    const ranked = rankMemories(session, 100, 5);
    expect(ranked[0]?.entry.id).toBe("recent-important");
  });

  it("respects the limit parameter", () => {
    const session = makeSession({
      episodic: [
        entry({ id: "a", createdAtTurn: 90 }),
        entry({ id: "b", createdAtTurn: 91 }),
        entry({ id: "c", createdAtTurn: 92 })
      ]
    });
    const ranked = rankMemories(session, 100, 2);
    expect(ranked).toHaveLength(2);
  });

  it("ranks across all three memory categories together", () => {
    const session = makeSession({
      episodic: [entry({ id: "ep", createdAtTurn: 99, importance: 0.9 })],
      semantic: [entry({ id: "sem", createdAtTurn: 99, importance: 0.5 })],
      relational: [entry({ id: "rel", createdAtTurn: 99, importance: 0.1 })]
    });
    const ranked = rankMemories(session, 100, 3);
    expect(ranked.map((r) => r.entry.id)).toEqual(["ep", "sem", "rel"]);
    expect(ranked.map((r) => r.type)).toEqual(["episodic", "semantic", "relational"]);
  });

  it("a very old memory scores lower than a recent one of equal importance", () => {
    const session = makeSession({
      episodic: [
        entry({ id: "ancient", createdAtTurn: 0, importance: 0.8 }),
        entry({ id: "recent", createdAtTurn: 98, importance: 0.8 })
      ]
    });
    const ranked = rankMemories(session, 100, 2);
    expect(ranked[0]?.entry.id).toBe("recent");
  });
});

describe("buildMemoryBlocks", () => {
  it("labels each block with its memory type", () => {
    const session = makeSession({
      semantic: [entry({ id: "s1", content: "Bars in this city close at 2am." })]
    });
    const blocks = buildMemoryBlocks(session, 100, 5);
    expect(blocks[0]?.content).toBe("[semantic] Bars in this city close at 2am.");
  });

  it("gives the top-ranked memory the lowest (best) priority number", () => {
    const session = makeSession({
      episodic: [
        entry({ id: "low", createdAtTurn: 0, importance: 0.1 }),
        entry({ id: "high", createdAtTurn: 99, importance: 0.9 })
      ]
    });
    const blocks = buildMemoryBlocks(session, 100, 2);
    const high = blocks.find((b) => b.id === "memory-high")!;
    const low = blocks.find((b) => b.id === "memory-low")!;
    expect(high.priority).toBeLessThan(low.priority);
  });

  it("produces no blocks when there is no memory at all", () => {
    const session = makeSession();
    expect(buildMemoryBlocks(session, 100, 5)).toEqual([]);
  });

  it("pins condensation recaps as one earlier-tonight block and does not duplicate them", () => {
    const session = makeSession({
      episodic: [
        {
          id: "c1",
          createdAtTurn: 10,
          importance: 0.85,
          content: "[condensed turns 1-10] They talked about the weather."
        },
        {
          id: "other",
          createdAtTurn: 99,
          importance: 0.9,
          content: "Emma mentioned a spare key."
        }
      ]
    });
    const blocks = buildMemoryBlocks(session, 100, 5);
    const recap = blocks.find((b) => b.id === "condensed-history");
    expect(recap).toBeDefined();
    expect(recap?.content).toContain("They talked about the weather.");
    expect(blocks.some((b) => b.id === "memory-c1")).toBe(false);
    expect(blocks.some((b) => b.id === "memory-other")).toBe(true);
  });
});

