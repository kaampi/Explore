import { describe, it, expect, beforeEach } from "vitest";
import { StateEngine } from "@state/StateEngine";
import { EventLog } from "@events/EventLog";
import type { Session } from "@state/StateSchema";

function makeSession(): Session {
  return {
    schemaVersion: 2,
    id: "test-session",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 0,
    characters: {
      emma: {
        position: { value: "bar", lock: "unlocked" },
        mood: { value: "neutral", lock: "unlocked" }
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
}

describe("StateEngine.undoLastMutation — policy", () => {
  it("rejects AI-sourced undo attempts", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    engine.proposeMutation({
      path: "characters.emma.mood",
      value: "happy",
      source: "player_manual_state",
      expectedStateVersion: 0
    });
    const result = engine.undoLastMutation("ai_approved_state_mutation", 1);
    expect(result.committed).toBe(false);
    expect(engine.getSession().characters.emma?.mood.value).toBe("happy"); // unchanged
  });

  it("rejects a stale expectedStateVersion", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    const result = engine.undoLastMutation("player_manual_state", 999);
    expect(result.committed).toBe(false);
  });

  it("reports no undoable mutation on an empty event log", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    const result = engine.undoLastMutation("player_manual_state", 0);
    expect(result.committed).toBe(false);
    expect((result as { reason: string }).reason).toMatch(/no undoable mutation/i);
  });
});

describe("StateEngine.undoLastMutation — reversing each event type", () => {
  let engine: StateEngine;

  beforeEach(() => {
    engine = new StateEngine(makeSession(), new EventLog());
  });

  it("reverses a value mutation (state_mutation_committed)", () => {
    engine.proposeMutation({
      path: "characters.emma.mood",
      value: "happy",
      source: "player_manual_state",
      expectedStateVersion: 0
    });
    const result = engine.undoLastMutation("player_manual_state", 1);
    expect(result.committed).toBe(true);
    expect(engine.getSession().characters.emma?.mood.value).toBe("neutral");
  });

  it("reverses a lock change (lock_state_changed)", () => {
    engine.proposeLockChange({
      path: "characters.emma.mood",
      requestedLock: "player_locked",
      source: "player_manual_state",
      expectedStateVersion: 0
    });
    const result = engine.undoLastMutation("player_manual_state", 1);
    expect(result.committed).toBe(true);
    expect(engine.getSession().characters.emma?.mood.lock).toBe("unlocked");
  });

  it("reverses a conversation append (conversation_turn_appended)", () => {
    engine.appendConversationTurn({ role: "player", content: "Hej!" }, 0);
    expect(engine.getSession().conversation).toHaveLength(1);
    const result = engine.undoLastMutation("player_manual_state", 1);
    expect(result.committed).toBe(true);
    expect(engine.getSession().conversation).toHaveLength(0);
  });

  it("reverses adding a layer (layer_added)", () => {
    engine.addLayer({ type: "core", priority: 0, content: "x" }, "player_manual_state", 0);
    expect(engine.getSession().layers).toHaveLength(1);
    const result = engine.undoLastMutation("player_manual_state", 1);
    expect(result.committed).toBe(true);
    expect(engine.getSession().layers).toHaveLength(0);
  });

  it("reverses a layer activation change (layer_activation_changed)", () => {
    engine.addLayer({ type: "core", priority: 0, content: "x", active: false }, "player_manual_state", 0);
    const layerId = engine.getSession().layers[0]!.id;
    engine.setLayerActive(layerId, true, "player_manual_state", 1);
    expect(engine.getSession().layers[0]?.active).toBe(true);

    const result = engine.undoLastMutation("player_manual_state", 2);
    expect(result.committed).toBe(true);
    expect(engine.getSession().layers[0]?.active).toBe(false);
  });

  it("reverses a keyword change (layer_keywords_changed)", () => {
    engine.addLayer(
      { type: "environment", priority: 0, content: "Cellar lore.", active: true },
      "player_manual_state",
      0
    );
    const layerId = engine.getSession().layers[0]!.id;
    engine.setLayerKeywords(layerId, ["cellar"], "player_manual_state", 1);
    expect(engine.getSession().layers[0]?.keywords).toEqual(["cellar"]);

    const result = engine.undoLastMutation("player_manual_state", 2);
    expect(result.committed).toBe(true);
    expect(engine.getSession().layers[0]?.keywords ?? []).toEqual([]);
  });

  it("reverses adding a memory entry (memory_entry_added)", () => {
    engine.addMemoryEntry("episodic", { content: "x", importance: 0.5 }, 0);
    expect(engine.getSession().memory.episodic).toHaveLength(1);
    const result = engine.undoLastMutation("player_manual_state", 1);
    expect(result.committed).toBe(true);
    expect(engine.getSession().memory.episodic).toHaveLength(0);
  });
});

describe("StateEngine.undoLastMutation — chaining and log integrity", () => {
  it("undo is itself a new commit: state version advances", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    engine.proposeMutation({
      path: "characters.emma.mood",
      value: "happy",
      source: "player_manual_state",
      expectedStateVersion: 0
    });
    const before = engine.getSession().stateVersion;
    const result = engine.undoLastMutation("player_manual_state", before);
    expect(result.committed).toBe(true);
    expect((result as { newStateVersion: number }).newStateVersion).toBe(before + 1);
  });

  it("logs a mutation_undone event referencing the original event", () => {
    const eventLog = new EventLog();
    const engine = new StateEngine(makeSession(), eventLog);
    engine.proposeMutation({
      path: "characters.emma.mood",
      value: "happy",
      source: "player_manual_state",
      expectedStateVersion: 0
    });
    const originalEvent = eventLog.last()!;
    engine.undoLastMutation("player_manual_state", 1);
    const undoEvent = eventLog.last()!;
    expect(undoEvent.type).toBe("mutation_undone");
    expect((undoEvent.payload as { undoneEventId: string }).undoneEventId).toBe(originalEvent.id);
  });

  it("two undos in a row walk back two separate mutations, not the same one twice", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    engine.proposeMutation({
      path: "characters.emma.mood",
      value: "happy",
      source: "player_manual_state",
      expectedStateVersion: 0
    });
    engine.proposeMutation({
      path: "characters.emma.position",
      value: "table",
      source: "player_manual_state",
      expectedStateVersion: 1
    });

    let v = engine.getSession().stateVersion;
    engine.undoLastMutation("player_manual_state", v);
    expect(engine.getSession().characters.emma?.position.value).toBe("bar");

    v = engine.getSession().stateVersion;
    engine.undoLastMutation("player_manual_state", v);
    expect(engine.getSession().characters.emma?.mood.value).toBe("neutral");
  });

  it("undo correctly skips past a turn_committed marker event to find the real mutation", () => {
    const eventLog = new EventLog();
    const engine = new StateEngine(makeSession(), eventLog);
    engine.proposeMutation({
      path: "characters.emma.mood",
      value: "happy",
      source: "player_manual_state",
      expectedStateVersion: 0
    });
    eventLog.append({
      turn: engine.getSession().stateVersion,
      timestamp: new Date().toISOString(),
      type: "turn_committed",
      payload: { turnId: "t1", mutationsApplied: 1, mutationsRejected: 0 }
    });

    const result = engine.undoLastMutation("player_manual_state", engine.getSession().stateVersion);
    expect(result.committed).toBe(true);
    expect(engine.getSession().characters.emma?.mood.value).toBe("neutral");
  });
});

describe("StateEngine.undoEvents — batch undo for Regenerate", () => {
  it("undoes a specific set of events without touching anything else", () => {
    const eventLog = new EventLog();
    const engine = new StateEngine(makeSession(), eventLog);

    // Simulates a turn: player message stays untouched; mutation + reply get undone.
    engine.appendConversationTurn({ role: "player", content: "Hej!" }, 0);
    const moodResult = engine.proposeMutation({
      path: "characters.emma.mood",
      value: "happy",
      source: "ai_approved_state_mutation",
      expectedStateVersion: 1
    });
    const moodEventId = eventLog.last()!.id;
    engine.appendConversationTurn({ role: "character", speaker: "emma", content: "Hej där!" }, moodResult.committed ? moodResult.newStateVersion : 2);
    const replyEventId = eventLog.last()!.id;

    const currentVersion = engine.getSession().stateVersion;
    const result = engine.undoEvents([moodEventId, replyEventId], "player_manual_state", currentVersion);

    expect(result.committed).toBe(true);
    expect(engine.getSession().conversation).toHaveLength(1); // player message survives
    expect((engine.getSession().conversation[0] as { role: string } | undefined)?.role).toBe("player");
    expect(engine.getSession().characters.emma?.mood.value).toBe("neutral"); // mood reverted
  });

  it("reverses events newest-first regardless of the order ids are passed in", () => {
    const eventLog = new EventLog();
    const engine = new StateEngine(makeSession(), eventLog);

    engine.proposeMutation({
      path: "characters.emma.mood",
      value: "happy",
      source: "player_manual_state",
      expectedStateVersion: 0
    });
    const firstId = eventLog.last()!.id;
    engine.proposeMutation({
      path: "characters.emma.position",
      value: "table",
      source: "player_manual_state",
      expectedStateVersion: 1
    });
    const secondId = eventLog.last()!.id;

    const currentVersion = engine.getSession().stateVersion;
    const result = engine.undoEvents([firstId, secondId], "player_manual_state", currentVersion);

    expect(result.committed).toBe(true);
    expect(engine.getSession().characters.emma?.mood.value).toBe("neutral");
    expect(engine.getSession().characters.emma?.position.value).toBe("bar");
  });

  it("rejects AI-sourced batch undo", () => {
    const eventLog = new EventLog();
    const engine = new StateEngine(makeSession(), eventLog);
    engine.proposeMutation({
      path: "characters.emma.mood",
      value: "happy",
      source: "player_manual_state",
      expectedStateVersion: 0
    });
    const id = eventLog.last()!.id;
    const result = engine.undoEvents([id], "ai_approved_state_mutation", 1);
    expect(result.committed).toBe(false);
    expect(engine.getSession().characters.emma?.mood.value).toBe("happy");
  });

  it("fails cleanly when an event id doesn't exist", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    const result = engine.undoEvents(["does-not-exist"], "player_manual_state", 0);
    expect(result.committed).toBe(false);
  });

  it("rejects a stale expectedStateVersion", () => {
    const eventLog = new EventLog();
    const engine = new StateEngine(makeSession(), eventLog);
    engine.proposeMutation({
      path: "characters.emma.mood",
      value: "happy",
      source: "player_manual_state",
      expectedStateVersion: 0
    });
    const id = eventLog.last()!.id;
    const result = engine.undoEvents([id], "player_manual_state", 999);
    expect(result.committed).toBe(false);
  });
});


function conv(engine: StateEngine, index: number): { turn: number; content: string } {
  return engine.getSession().conversation[index] as { turn: number; content: string };
}

describe("StateEngine.editConversationTurn", () => {
  it("lets the player edit an existing turn's content", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    engine.appendConversationTurn({ role: "player", content: "Hej Emma" }, 0);
    const turnNumber = conv(engine, 0).turn;

    const result = engine.editConversationTurn(turnNumber, "Hej Emma, hur mår du?", "player_manual_state", 1);
    expect(result.committed).toBe(true);
    expect(conv(engine, 0).content).toBe("Hej Emma, hur mår du?");
  });

  it("rejects AI-sourced edits, including to the AI's own reply", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    engine.appendConversationTurn({ role: "character", speaker: "emma", content: "Hej!" }, 0);
    const turnNumber = conv(engine, 0).turn;

    const result = engine.editConversationTurn(turnNumber, "Something else entirely", "ai_approved_state_mutation", 1);
    expect(result.committed).toBe(false);
    expect(conv(engine, 0).content).toBe("Hej!");
  });

  it("rejects editing a turn number that doesn't exist", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    const result = engine.editConversationTurn(999, "x", "player_manual_state", 0);
    expect(result.committed).toBe(false);
  });

  it("rejects a stale expectedStateVersion", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    engine.appendConversationTurn({ role: "player", content: "Hej" }, 0);
    const turnNumber = conv(engine, 0).turn;
    const result = engine.editConversationTurn(turnNumber, "x", "player_manual_state", 999);
    expect(result.committed).toBe(false);
  });

  it("does not affect other turns", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    engine.appendConversationTurn({ role: "player", content: "First" }, 0);
    engine.appendConversationTurn({ role: "character", speaker: "emma", content: "Second" }, 1);
    const firstTurnNumber = conv(engine, 0).turn;

    engine.editConversationTurn(firstTurnNumber, "Edited first", "player_manual_state", 2);
    expect(conv(engine, 0).content).toBe("Edited first");
    expect(conv(engine, 1).content).toBe("Second");
  });

  it("is undoable — the previous content is restored exactly", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    engine.appendConversationTurn({ role: "player", content: "Original text" }, 0);
    const turnNumber = conv(engine, 0).turn;

    engine.editConversationTurn(turnNumber, "Edited text", "player_manual_state", 1);
    expect(conv(engine, 0).content).toBe("Edited text");

    const undoResult = engine.undoLastMutation("player_manual_state", engine.getSession().stateVersion);
    expect(undoResult.committed).toBe(true);
    expect(conv(engine, 0).content).toBe("Original text");
  });
});
