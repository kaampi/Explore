import { CURRENT_SCHEMA_VERSION } from "@state/StateSchema";

/**
 * Migration Engine — Master Spec §43.
 * Migrations must be deterministic (§51 invariant 17): the same input at
 * a given schemaVersion always produces the same output. Each migration
 * step only knows how to go from version N to N+1; migrate() chains them.
 *
 * Migrations operate on `unknown` / loosely-typed records on purpose —
 * a v1 record does not conform to the current SessionSchema (that's the
 * whole point), so we can't type it as Session until migration completes.
 */

type MigrationStep = (record: Record<string, unknown>) => Record<string, unknown>;

/**
 * v1 -> v2: character fields used to be raw values (e.g. `mood: "angry"`).
 * v2 introduced Variable Locking (§7), wrapping every mutable field as
 * `{ value, lock }`. This migration wraps any unwrapped character field
 * as `unlocked`, preserving the original value.
 */
const migrateV1ToV2: MigrationStep = (record) => {
  const characters = (record.characters ?? {}) as Record<string, Record<string, unknown>>;

  const migratedCharacters = Object.fromEntries(
    Object.entries(characters).map(([charId, fields]) => {
      const migratedFields = Object.fromEntries(
        Object.entries(fields).map(([fieldName, fieldValue]) => {
          const alreadyWrapped =
            fieldValue !== null &&
            typeof fieldValue === "object" &&
            "value" in (fieldValue as Record<string, unknown>) &&
            "lock" in (fieldValue as Record<string, unknown>);

          return [
            fieldName,
            alreadyWrapped ? fieldValue : { value: fieldValue, lock: "unlocked" as const }
          ];
        })
      );
      return [charId, migratedFields];
    })
  );

  return {
    ...record,
    schemaVersion: 2,
    characters: migratedCharacters
  };
};

const MIGRATIONS: Record<number, MigrationStep> = {
  1: migrateV1ToV2
};

export class UnmigratableSchemaVersionError extends Error {
  constructor(fromVersion: number) {
    super(`No migration path registered from schema version ${fromVersion}.`);
    this.name = "UnmigratableSchemaVersionError";
  }
}

/**
 * Migrates a raw record up to CURRENT_SCHEMA_VERSION, applying each
 * registered step in sequence. Pure function: no I/O, no side effects,
 * same input always yields the same output (§51 invariant 17).
 */
export function migrate(rawRecord: Record<string, unknown>): Record<string, unknown> {
  let current = rawRecord;
  let version = typeof current.schemaVersion === "number" ? current.schemaVersion : 1;

  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      throw new UnmigratableSchemaVersionError(version);
    }
    current = step(current);
    version = typeof current.schemaVersion === "number" ? current.schemaVersion : version + 1;
  }

  return current;
}

export function needsMigration(rawRecord: Record<string, unknown>): boolean {
  const version = typeof rawRecord.schemaVersion === "number" ? rawRecord.schemaVersion : 1;
  return version < CURRENT_SCHEMA_VERSION;
}
