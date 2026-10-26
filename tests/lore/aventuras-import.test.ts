import { describe, expect, it } from "vitest";
import { importWorldData } from "../../src/lore/worldImports";

const envelope = (entries: unknown[], entity = "lorebook", version = "1.0.0") => ({
  format: "aventuras-exchange",
  formatVersion: version,
  entity,
  data: { name: "Example world", entries },
});
const entry = (overrides: Record<string, unknown> = {}) => ({
  name: "Old Keep",
  type: "location",
  description: "A stone fortress.",
  keywords: ["keep"],
  injectionMode: "keyword",
  ...overrides,
});

describe("Aventuras lorebook exchange import", () => {
  it("detects the envelope and preserves source without activating lore", () => {
    const raw = envelope([entry()]);
    const book = importWorldData(raw, "lore.json");
    expect(book.origin?.format).toBe("aventuras");
    expect(book.raw).toEqual(raw);
    expect(book.entries[0]).toMatchObject({
      title: "Old Keep", mode: "keywords", approved: false,
      entity: { kind: "location" },
    });
  });
  it("never activates disabled or private entries", () => {
    const book = importWorldData(envelope([
      entry({ injectionMode: "never" }),
      entry({ hiddenInfo: "Secret" }),
      entry({ description: "{{macro}}" }),
    ]), "lore.json");
    expect(book.entries.every(row => row.mode === "dormant" && !row.approved)).toBe(true);
  });
  it("rejects wrong entity and unsupported versions without SillyTavern fallback", () => {
    expect(importWorldData(envelope([], "character"), "char.json").origin?.format).toBe("aventuras");
    expect(() => importWorldData(envelope([], "lorebook", "2.0.0"), "lore.json")).toThrow();
  });
  it("rejects more than 5000 entries", () => {
    expect(() => importWorldData(envelope(Array.from({ length: 5001 }, () => entry())), "large.json")).toThrow();
  });
});
