import { describe, it, expect } from "vitest";
import { resolveLockChange } from "@state/LockManager";

describe("LockManager", () => {
  it("allows the player to lock an unlocked field", () => {
    const decision = resolveLockChange({
      currentLock: "unlocked",
      requestedLock: "player_locked",
      requestedBy: "player_manual_state"
    });
    expect(decision.allowed).toBe(true);
  });

  it("allows the player to unlock a field they had locked", () => {
    const decision = resolveLockChange({
      currentLock: "player_locked",
      requestedLock: "unlocked",
      requestedBy: "player_manual_state"
    });
    expect(decision.allowed).toBe(true);
  });

  it("rejects AI attempts to change any lock, even on unlocked fields", () => {
    const decision = resolveLockChange({
      currentLock: "unlocked",
      requestedLock: "player_locked",
      requestedBy: "ai_approved_state_mutation"
    });
    expect(decision.allowed).toBe(false);
  });

  it("rejects non-system sources changing a system_locked field", () => {
    const decision = resolveLockChange({
      currentLock: "system_locked",
      requestedLock: "unlocked",
      requestedBy: "player_manual_state"
    });
    expect(decision.allowed).toBe(false);
  });

  it("rejects non-system sources attempting to set system_locked", () => {
    const decision = resolveLockChange({
      currentLock: "unlocked",
      requestedLock: "system_locked",
      requestedBy: "player_manual_state"
    });
    expect(decision.allowed).toBe(false);
  });

  it("allows the system to change a system_locked field", () => {
    const decision = resolveLockChange({
      currentLock: "system_locked",
      requestedLock: "unlocked",
      requestedBy: "immutable_system_constraint"
    });
    expect(decision.allowed).toBe(true);
  });
});
