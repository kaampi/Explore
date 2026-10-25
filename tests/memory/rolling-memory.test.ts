import { describe, it, expect, vi } from "vitest";
import {
  getHighestCondensedTurnEnd,
  selectBatchToCondense,
  selectPlaceChangeBatch,
  selectTurnsDroppedByBudget,
  standingNotesForSummarizer,
  createLLMConversationSummarizer,
  runRollingMemoryCondensation,
  runRollingMemoryUntilQuiet,
  CONVERSATION_SUMMARIZER_SYSTEM,
  DEFAULT_ROLLING_MEMORY_OPTIONS
} from "@memory/RollingMemory";
import { StateEngine } from "@state/StateEngine";
import { EventLog } from "@events/EventLog";
import { LLMAdapter } from "@llm/LLMAdapter";
import type { Session } from "@state/StateSchema";
import type { CompletionRequest, LLMProvider, StreamChunk } from "@llm/types";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    openedRoomIds: [],
    storyFlags: [],
    partyIds: [],
    partyHoldIds: [],
    partyPendingIds: [],
    schemaVersion: 2,
    id: "s1",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 0,
    characters: {},
    relationships: {},
    layers: [],
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: [],
    ...overrides
  };
}

function turns(count: number, startAt = 1) {
  return Array.from({ length: count }, (_, i) => ({
    turn: startAt + i,
    role: "player" as const,
    content: `message ${startAt + i}`
  }));
}

describe("getHighestCondensedTurnEnd", () => {
  it("returns 0 when no condensation has happened yet", () => {
    expect(getHighestCondensedTurnEnd(makeSession())).toBe(0);
  });

  it("returns the highest end-turn across multiple condensation markers", () => {
    const session = makeSession({
      memory: {
        episodic: [
          { id: "m1", createdAtTurn: 10, importance: 0.6, content: "[condensed turns 1-10] Talked about the weather." },
          { id: "m2", createdAtTurn: 20, importance: 0.6, content: "[condensed turns 11-20] Discussed the job offer." }
        ],
        semantic: [],
        relational: []
      }
    });
    expect(getHighestCondensedTurnEnd(session)).toBe(20);
  });

  it("ignores unrelated memory entries", () => {
    const session = makeSession({
      memory: {
        episodic: [{ id: "m1", createdAtTurn: 5, importance: 0.5, content: "Just a regular memory." }],
        semantic: [],
        relational: []
      }
    });
    expect(getHighestCondensedTurnEnd(session)).toBe(0);
  });
});

describe("selectBatchToCondense", () => {
  it("returns null when there aren't enough turns beyond the recent window", () => {
    const session = makeSession({ conversation: turns(15) }); // fewer than keepRecentTurns(20)+batchSize(10)
    expect(selectBatchToCondense(session)).toBeNull();
  });

  it("returns the oldest full batch once enough turns have accumulated", () => {
    const session = makeSession({ conversation: turns(30) }); // 30 turns: 10 eligible, exactly one batch
    const batch = selectBatchToCondense(session);
    expect(batch).not.toBeNull();
    expect(batch!.map((t) => t.turn)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("never touches the most recent keepRecentTurns turns", () => {
    const session = makeSession({ conversation: turns(35) });
    const batch = selectBatchToCondense(session);
    const maxCondensedTurn = Math.max(...batch!.map((t) => t.turn));
    expect(35 - maxCondensedTurn).toBeGreaterThanOrEqual(20);
  });

  it("does not re-select turns already covered by a previous condensation", () => {
    const session = makeSession({
      conversation: turns(40),
      memory: {
        episodic: [{ id: "m1", createdAtTurn: 10, importance: 0.6, content: "[condensed turns 1-10] earlier summary" }],
        semantic: [],
        relational: []
      }
    });
    const batch = selectBatchToCondense(session);
    expect(batch!.every((t) => t.turn > 10)).toBe(true);
    expect(batch!.map((t) => t.turn)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it("respects custom batchSize and keepRecentTurns", () => {
    const session = makeSession({ conversation: turns(10) });
    const batch = selectBatchToCondense(session, { keepRecentTurns: 2, batchSize: 5 });
    expect(batch!.map((t) => t.turn)).toEqual([1, 2, 3, 4, 5]);
  });

  it("condenses turns the token ceiling would drop even inside the recent window", () => {
    const conversation = Array.from({ length: 20 }, (_, i) => ({
      turn: i + 1,
      role: "player" as const,
      content: "lorem ".repeat(400)
    }));
    const session = makeSession({ conversation });
    const dropped = selectTurnsDroppedByBudget(session);
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped[0]?.turn).toBe(1);

    const batch = selectBatchToCondense(session);
    expect(batch).not.toBeNull();
    expect(batch![0]?.turn).toBe(1);
    expect(batch!.length).toBeLessThanOrEqual(DEFAULT_ROLLING_MEMORY_OPTIONS.batchSize);
    expect(batch!.length).toBeGreaterThanOrEqual(1);
  });

  it("on a place change recaps the old room and keeps the doorway beats", () => {
    const session = makeSession({ conversation: turns(12) });
    const batch = selectPlaceChangeBatch(session, {
      ...DEFAULT_ROLLING_MEMORY_OPTIONS,
      previousStage: "the aurora room",
      currentStage: "emma's room"
    });
    expect(batch!.map((t) => t.turn)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("does not treat staying in the same venue as a place change", () => {
    const session = makeSession({ conversation: turns(12) });
    expect(
      selectPlaceChangeBatch(session, {
        ...DEFAULT_ROLLING_MEMORY_OPTIONS,
        previousStage: "the aurora room",
        currentStage: "the aurora room"
      })
    ).toBeNull();
  });

  it("lists standing Here and character notes so the recap can skip them", () => {
    const session = makeSession({
      scene: { location: "The Aurora Room", environment: {}, brief: "A quiet jazz bar after hours." },
      layers: [
        {
          id: "c1",
          type: "core",
          priority: 0,
          content: "Emma is a reserved bartender.",
          active: true,
          aiGenerated: false
        }
      ]
    });
    const notes = standingNotesForSummarizer(session);
    expect(notes.join(" ")).toMatch(/quiet jazz bar/i);
    expect(notes.join(" ")).toMatch(/reserved bartender/i);
  });
});

function providerReturning(text: string): LLMProvider {
  return {
    name: "summarizer-stub",
    capabilities: { streaming: true, structuredOutput: false, cancellation: true },
    async *streamCompletion(_req: CompletionRequest): AsyncGenerator<StreamChunk> {
      yield { type: "text_delta", text };
      yield { type: "done", finishReason: "stop" };
    }
  };
}

describe("createLLMConversationSummarizer", () => {
  it("returns the model's summary on success", async () => {
    const adapter = new LLMAdapter({ primary: providerReturning("They discussed old times at the bar.") });
    const summarizer = createLLMConversationSummarizer(adapter, { sleepImpl: async () => {} });
    const summary = await summarizer(turns(3));
    expect(summary).toBe("They discussed old times at the bar.");
  });

  it("asks for a factual recap, not a two-sentence relationship thesis", async () => {
    let lastRequest: CompletionRequest | undefined;
    const capturing: LLMProvider = {
      name: "capturing",
      capabilities: { streaming: true, structuredOutput: false, cancellation: true },
      async *streamCompletion(request: CompletionRequest): AsyncGenerator<StreamChunk> {
        lastRequest = request;
        yield { type: "text_delta", text: "They sat at the bar." };
        yield { type: "done", finishReason: "stop" };
      }
    };
    const summarizer = createLLMConversationSummarizer(new LLMAdapter({ primary: capturing }), {
      sleepImpl: async () => {}
    });
    await summarizer(turns(3));
    expect(lastRequest?.messages[0]?.content).toBe(CONVERSATION_SUMMARIZER_SYSTEM);
    expect(lastRequest?.messages[0]?.content).toMatch(/do not upgrade or invent/i);
    expect(lastRequest?.messages[0]?.content).toMatch(/twenty beats must not become one sentence/i);
    expect(lastRequest?.temperature).toBe(0.3);
    expect(lastRequest?.maxTokens).toBe(512);
  });

  it("hands the summarizer standing notes and the place move instead of only the transcript", async () => {
    let lastRequest: CompletionRequest | undefined;
    const capturing: LLMProvider = {
      name: "capturing",
      capabilities: { streaming: true, structuredOutput: false, cancellation: true },
      async *streamCompletion(request: CompletionRequest): AsyncGenerator<StreamChunk> {
        lastRequest = request;
        yield { type: "text_delta", text: "They left two glasses on the bar." };
        yield { type: "done", finishReason: "stop" };
      }
    };
    const summarizer = createLLMConversationSummarizer(new LLMAdapter({ primary: capturing }), {
      sleepImpl: async () => {}
    });
    await summarizer(turns(3), {
      notes: ["core: Emma is a reserved bartender."],
      previousPlace: "The Aurora Room",
      currentPlace: "Emma's room"
    });
    const user = lastRequest?.messages[1]?.content ?? "";
    expect(user).toContain("Already in standing notes");
    expect(user).toContain("reserved bartender");
    expect(user).toContain("Scene moved from The Aurora Room to Emma's room");
    expect(user).toContain("Beats to condense:");
  });

  it("falls back to a naive concatenated summary when every attempt fails, never throwing", async () => {
    const failing: LLMProvider = {
      name: "always-fails",
      capabilities: { streaming: true, structuredOutput: false, cancellation: true },
      async *streamCompletion(): AsyncGenerator<StreamChunk> {
        throw new Error("connection refused");
      }
    };
    const adapter = new LLMAdapter({ primary: failing });
    const onFailure = vi.fn();
    const summarizer = createLLMConversationSummarizer(adapter, {
      maxAttempts: 2,
      sleepImpl: async () => {},
      onFailure
    });

    const summary = await summarizer(turns(2));
    expect(summary).toContain("message 1");
    expect(summary).toContain("message 2");
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it("treats an empty response as a failure and falls back", async () => {
    const adapter = new LLMAdapter({ primary: providerReturning("") });
    const summarizer = createLLMConversationSummarizer(adapter, { maxAttempts: 1, sleepImpl: async () => {} });
    const summary = await summarizer(turns(1));
    expect(summary).toContain("message 1");
  });
});

describe("runRollingMemoryCondensation", () => {
  it("does nothing and reports condensed:false when no batch is due", async () => {
    const stateEngine = new StateEngine(makeSession({ conversation: turns(5) }), new EventLog());
    const result = await runRollingMemoryCondensation(stateEngine, async () => "summary");
    expect(result.condensed).toBe(false);
    expect(stateEngine.getSession().memory.episodic).toHaveLength(0);
  });

  it("writes a condensation-tagged episodic memory entry when a batch is due", async () => {
    const stateEngine = new StateEngine(makeSession({ conversation: turns(30) }), new EventLog());
    const result = await runRollingMemoryCondensation(stateEngine, async () => "They caught up on old times.");

    expect(result).toEqual({ condensed: true, turnRange: [1, 10] });
    const entry = stateEngine.getSession().memory.episodic[0]!;
    expect(entry.content).toBe("[condensed turns 1-10] They caught up on old times.");
    expect(entry.createdAtTurn).toBe(10);
  });

  it("running it twice in a row condenses the next batch, not the same one again", async () => {
    const stateEngine = new StateEngine(makeSession({ conversation: turns(40) }), new EventLog());
    const first = await runRollingMemoryCondensation(stateEngine, async () => "first batch summary");
    const second = await runRollingMemoryCondensation(stateEngine, async () => "second batch summary");

    expect(first.turnRange).toEqual([1, 10]);
    expect(second.turnRange).toEqual([11, 20]);
    expect(stateEngine.getSession().memory.episodic).toHaveLength(2);
  });

  it("uses DEFAULT_ROLLING_MEMORY_OPTIONS when none are provided", async () => {
    const stateEngine = new StateEngine(makeSession({ conversation: turns(29) }), new EventLog());
    const notEnough = await runRollingMemoryCondensation(stateEngine, async () => "x");
    expect(notEnough.condensed).toBe(false); // 29 - 20 = 9 < default batchSize(10)

    const stateEngine2 = new StateEngine(makeSession({ conversation: turns(30) }), new EventLog());
    const enough = await runRollingMemoryCondensation(stateEngine2, async () => "x");
    expect(enough.condensed).toBe(true);
    expect(DEFAULT_ROLLING_MEMORY_OPTIONS).toEqual({ keepRecentTurns: 20, batchSize: 10 });
  });

  it("labels a place-change recap with the room that was left", async () => {
    const stateEngine = new StateEngine(makeSession({ conversation: turns(12) }), new EventLog());
    const result = await runRollingMemoryCondensation(stateEngine, async () => "They closed the tab.", {
      ...DEFAULT_ROLLING_MEMORY_OPTIONS,
      previousStage: "the aurora room",
      currentStage: "emma's room",
      previousPlace: "The Aurora Room",
      currentPlace: "Emma's room"
    });
    expect(result.condensed).toBe(true);
    expect(result.turnRange).toEqual([1, 8]);
    expect(stateEngine.getSession().memory.episodic[0]?.content).toContain(
      "Left The Aurora Room for Emma's room. They closed the tab."
    );
  });

  it("keeps condensing overflow across a few passes", async () => {
    const conversation = Array.from({ length: 20 }, (_, i) => ({
      turn: i + 1,
      role: "player" as const,
      content: "lorem ".repeat(400)
    }));
    const stateEngine = new StateEngine(makeSession({ conversation }), new EventLog());
    const results = await runRollingMemoryUntilQuiet(stateEngine, async (batch) => `recap ${batch[0]?.turn}`);
    const condensed = results.filter((row) => row.condensed);
    expect(condensed.length).toBeGreaterThanOrEqual(1);
    expect(stateEngine.getSession().memory.episodic.length).toBe(condensed.length);
  });
});

