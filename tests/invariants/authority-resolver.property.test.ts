import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { resolveAuthority, AUTHORITY_ORDER, type AuthoritySource } from "@state/AuthorityResolver";
import { LockStateSchema } from "@state/StateSchema";

const authoritySourceArb = fc.constantFrom(...AUTHORITY_ORDER);
const lockStateArb = fc.constantFrom(...LockStateSchema.options);

describe("Property: resolveAuthority never allows AI to write player_locked state", () => {
  it("holds for every (source, lock) combination", () => {
    fc.assert(
      fc.property(authoritySourceArb, lockStateArb, (source: AuthoritySource, fieldLock) => {
        const decision = resolveAuthority({ source, fieldLock });
        const isAiSource = source === "ai_approved_state_mutation" || source === "ai_inference";

        if (isAiSource && fieldLock === "player_locked") {
          expect(decision.allowed).toBe(false);
        }
      })
    );
  });

  it("never allows a non-system source to write a system_locked field", () => {
    fc.assert(
      fc.property(authoritySourceArb, (source: AuthoritySource) => {
        const decision = resolveAuthority({ source, fieldLock: "system_locked" });
        if (source !== "immutable_system_constraint") {
          expect(decision.allowed).toBe(false);
        }
      })
    );
  });
});
