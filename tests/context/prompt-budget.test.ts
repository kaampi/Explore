import { describe, it, expect } from "vitest";
import { inspectPromptBudget } from "@context/promptBudget";
import { DEFAULT_BUDGET } from "@context/ContextBudgetManager";
import type { Session } from "@state/StateSchema";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    schemaVersion: 2,
    id: "s1",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 0,
    characters: {
      emma: {
        name: "Emma",
        position: { value: "bar", lock: "unlocked" },
        mood: { value: "curious", lock: "unlocked" }
      }
    },
    scene: { location: "downtown bar", environment: { lighting: "dim" } },
    relationships: {},
    layers: [],
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [{ turn: 1, role: "player", content: "Hi Emma" }],
    events: [],
    snapshots: [],
    diagnostics: [],
    ...overrides
  };
}

describe("inspectPromptBudget", () => {
  it("counts Pass 1 writing rules and reports the 3500/8000 budget", () => {
    const snap = inspectPromptBudget(makeSession());
    expect(snap.targetTokens).toBe(DEFAULT_BUDGET.targetTokens);
    expect(snap.hardCeilingTokens).toBe(DEFAULT_BUDGET.hardCeilingTokens);
    expect(snap.promptTokens).toBeGreaterThan(0);
    expect(snap.parts.some((part) => part.id === "pass 1" && part.tokens > 0)).toBe(true);
    expect(snap.parts.some((part) => part.id === "state" && part.tokens > 0)).toBe(true);
    const pass1 = snap.parts.find((part) => part.id === "pass 1")?.tokens ?? 0;
    expect(pass1).toBeLessThan(1000);
    expect(snap.parts.reduce((sum, part) => sum + part.tokens, 0)).toBe(snap.promptTokens);
    expect(snap.overTarget).toBe(false);
  });

  it("grows the chat part as conversation is kept", () => {
    const empty = inspectPromptBudget(makeSession());
    const withChat = inspectPromptBudget(
      makeSession({
        conversation: [
          { turn: 1, role: "player", content: "Hello there, Emma. I wanted to talk for a while about the evening." },
          { turn: 2, role: "character", speaker: "Emma", content: "She wipes a glass. \"Go on.\"" }
        ]
      })
    );
    const emptyChat = empty.parts.find((part) => part.id === "chat")?.tokens ?? 0;
    const keptChat = withChat.parts.find((part) => part.id === "chat")?.tokens ?? 0;
    expect(keptChat).toBeGreaterThan(emptyChat);
    expect(withChat.promptTokens).toBeGreaterThan(empty.promptTokens);
  });
});
