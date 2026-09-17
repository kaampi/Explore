import { describe, it, expect } from "vitest";
import { migrate, needsMigration, UnmigratableSchemaVersionError } from "@persistence/MigrationEngine";
import { safeParseSession } from "@state/StateSchema";

const v1Record = {
  schemaVersion: 1,
  id: "legacy-session",
  runtime: { model: "old-model", temperature: 0.7, seed: null, provider: "test" },
  stateVersion: 3,
  characters: {
    emma: {
      // v1 shape: raw values, no {value, lock} wrapper
      position: "table",
      mood: "reserved"
    }
  },
  relationships: {},
  layers: [],
  memory: { episodic: [], semantic: [], relational: [] },
  conversation: [],
  events: [],
  snapshots: [],
  diagnostics: []
};

describe("MigrationEngine", () => {
  it("identifies a v1 record as needing migration", () => {
    expect(needsMigration(v1Record)).toBe(true);
  });

  it("identifies a current-version record as not needing migration", () => {
    expect(needsMigration({ ...v1Record, schemaVersion: 2 })).toBe(false);
  });

  it("wraps unwrapped v1 character fields into {value, lock: unlocked}", () => {
    const migrated = migrate(v1Record);
    const characters = migrated.characters as Record<string, Record<string, unknown>>;

    expect(characters.emma?.position).toEqual({ value: "table", lock: "unlocked" });
    expect(characters.emma?.mood).toEqual({ value: "reserved", lock: "unlocked" });
    expect(migrated.schemaVersion).toBe(2);
  });

  it("produces a session that now validates against the current schema", () => {
    const migrated = migrate(v1Record);
    const result = safeParseSession(migrated);
    expect(result.success).toBe(true);
  });

  it("is deterministic: the same input always produces the same output", () => {
    const first = migrate(v1Record);
    const second = migrate(v1Record);
    expect(first).toEqual(second);
  });

  it("does not double-wrap fields that are already in the current shape", () => {
    const alreadyWrapped = {
      ...v1Record,
      characters: {
        emma: { position: { value: "bar", lock: "player_locked" } }
      }
    };
    const migrated = migrate(alreadyWrapped);
    const characters = migrated.characters as Record<string, Record<string, unknown>>;
    expect(characters.emma?.position).toEqual({ value: "bar", lock: "player_locked" });
  });

  it("throws UnmigratableSchemaVersionError for a version with no registered migration", () => {
    expect(() => migrate({ ...v1Record, schemaVersion: 0 })).toThrow(UnmigratableSchemaVersionError);
  });
});
