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
    characters: {},
    relationships: {},
    layers: [],
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: []
  };
}

describe("StateEngine.addLayer", () => {
  let engine: StateEngine;
  let eventLog: EventLog;

  beforeEach(() => {
    eventLog = new EventLog();
    engine = new StateEngine(makeSession(), eventLog);
  });

  it("adds a player-sourced layer active as requested", () => {
    const result = engine.addLayer(
      { type: "core", priority: 0, content: "Be warm and playful.", active: true },
      "player_manual_state",
      0
    );
    expect(result.committed).toBe(true);
    const added = engine.getSession().layers[0];
    expect(added?.active).toBe(true);
    expect(added?.aiGenerated).toBe(false);
  });

  it("force-creates an AI-sourced layer as inactive, even if active:true was requested", () => {
    const result = engine.addLayer(
      { type: "core", priority: 0, content: "AI-proposed behavior", active: true },
      "ai_approved_state_mutation",
      0
    );
    expect(result.committed).toBe(true);
    const added = engine.getSession().layers[0];
    expect(added?.active).toBe(false);
    expect(added?.aiGenerated).toBe(true);
  });

  it("discards an AI environment layer that invents a spare room", () => {
    const result = engine.addLayer(
      { type: "environment", priority: 0, content: "There is a spare room down the hall.", active: true },
      "ai_approved_state_mutation",
      0
    );
    expect(result.committed).toBe(false);
    expect(engine.getSession().layers).toHaveLength(0);
    expect(eventLog.last()).toBeUndefined();
  });

  it("discards an AI environment layer that invents a dog", () => {
    const result = engine.addLayer(
      { type: "environment", priority: 0, content: "A stray dog sleeps by the door." },
      "ai_inference",
      0
    );
    expect(result.committed).toBe(false);
    expect(engine.getSession().layers).toHaveLength(0);
  });

  it("still queues a grounded AI environment note as inactive", () => {
    const result = engine.addLayer(
      { type: "environment", priority: 0, content: "It's raining on the windows.", active: true },
      "ai_approved_state_mutation",
      0
    );
    expect(result.committed).toBe(true);
    expect(engine.getSession().layers[0]?.active).toBe(false);
    expect(engine.getSession().layers[0]?.aiGenerated).toBe(true);
  });

  it("lets the player author a guest room note", () => {
    const result = engine.addLayer(
      { type: "environment", priority: 0, content: "Guest rooms upstairs.", active: true },
      "player_manual_state",
      0
    );
    expect(result.committed).toBe(true);
    expect(engine.getSession().layers[0]?.active).toBe(true);
  });

  it("logs a layer_added event on success", () => {
    engine.addLayer({ type: "environment", priority: 0, content: "It's raining." }, "player_manual_state", 0);
    expect(eventLog.last()?.type).toBe("layer_added");
  });

  it("stores keywords on a player-added layer", () => {
    engine.addLayer(
      {
        type: "environment",
        priority: 0,
        content: "A locked cellar.",
        keywords: ["cellar"],
        active: true
      },
      "player_manual_state",
      0
    );
    expect(engine.getSession().layers[0]?.keywords).toEqual(["cellar"]);
  });

  it("rejects a stale proposal", () => {
    const result = engine.addLayer({ type: "core", priority: 0, content: "x" }, "player_manual_state", 999);
    expect(result.committed).toBe(false);
  });
});

describe("StateEngine.setLayerActive", () => {
  let engine: StateEngine;

  beforeEach(() => {
    engine = new StateEngine(makeSession(), new EventLog());
    engine.addLayer({ type: "core", priority: 0, content: "x", active: false }, "player_manual_state", 0);
  });

  it("lets the player activate a layer", () => {
    const layerId = engine.getSession().layers[0]!.id;
    const result = engine.setLayerActive(layerId, true, "player_manual_state", 1);
    expect(result.committed).toBe(true);
    expect(engine.getSession().layers[0]?.active).toBe(true);
  });

  it("rejects AI attempts to activate a layer, even one the AI itself proposed", () => {
    const layerId = engine.getSession().layers[0]!.id;
    const result = engine.setLayerActive(layerId, true, "ai_approved_state_mutation", 1);
    expect(result.committed).toBe(false);
    expect(engine.getSession().layers[0]?.active).toBe(false);
  });

  it("rejects an unknown layer id", () => {
    const result = engine.setLayerActive("does-not-exist", true, "player_manual_state", 1);
    expect(result.committed).toBe(false);
  });

  it("rejects Approve of a leftover ungrounded AI environment layer", () => {
    const leftover = new StateEngine(
      {
        ...makeSession(),
        layers: [
          {
            id: "ai-spare",
            type: "environment",
            priority: 5,
            content: "There is a spare room down the hall.",
            active: false,
            aiGenerated: true
          }
        ]
      },
      new EventLog()
    );
    const result = leftover.setLayerActive("ai-spare", true, "player_manual_state", 0);
    expect(result.committed).toBe(false);
    expect(leftover.getSession().layers[0]?.active).toBe(false);
  });
});

describe("StateEngine.setLayerKeywords", () => {
  let engine: StateEngine;

  beforeEach(() => {
    engine = new StateEngine(makeSession(), new EventLog());
    engine.addLayer({ type: "environment", priority: 0, content: "A locked cellar.", active: true }, "player_manual_state", 0);
  });

  it("lets the player set keywords", () => {
    const layerId = engine.getSession().layers[0]!.id;
    const result = engine.setLayerKeywords(layerId, ["cellar"], "player_manual_state", 1);
    expect(result.committed).toBe(true);
    expect(engine.getSession().layers[0]?.keywords).toEqual(["cellar"]);
  });

  it("rejects AI attempts to set keywords", () => {
    const layerId = engine.getSession().layers[0]!.id;
    const result = engine.setLayerKeywords(layerId, ["cellar"], "ai_inference", 1);
    expect(result.committed).toBe(false);
    expect(engine.getSession().layers[0]?.keywords ?? []).toEqual([]);
  });
});

describe("StateEngine.markLayerSpent", () => {
  let engine: StateEngine;
  let eventLog: EventLog;

  beforeEach(() => {
    eventLog = new EventLog();
    engine = new StateEngine(makeSession(), eventLog);
    engine.addLayer(
      {
        type: "state_trigger",
        priority: 0,
        content: "TWO STRANGERS ENTER",
        once: true,
        trigger: "return_to_bar",
        keywords: ["brooch"],
        active: true
      },
      "player_manual_state",
      0
    );
  });

  it("marks an once-layer spent and turns it off", () => {
    const layerId = engine.getSession().layers[0]!.id;
    const result = engine.markLayerSpent(layerId, "explicit_scenario_rule", 1);
    expect(result.committed).toBe(true);
    expect(engine.getSession().layers[0]?.spent).toBe(true);
    expect(engine.getSession().layers[0]?.active).toBe(false);
    expect(eventLog.last()?.type).toBe("layer_spent");
  });

  it("rejects AI attempts to spend a layer", () => {
    const layerId = engine.getSession().layers[0]!.id;
    const result = engine.markLayerSpent(layerId, "ai_inference", 1);
    expect(result.committed).toBe(false);
    expect(engine.getSession().layers[0]?.spent).toBeFalsy();
  });
});

describe("StateEngine.removeLayer", () => {
  let engine: StateEngine;

  beforeEach(() => {
    engine = new StateEngine(makeSession(), new EventLog());
    engine.addLayer({ type: "core", priority: 0, content: "x" }, "player_manual_state", 0);
  });

  it("lets the player remove a layer", () => {
    const layerId = engine.getSession().layers[0]!.id;
    const result = engine.removeLayer(layerId, "player_manual_state", 1);
    expect(result.committed).toBe(true);
    expect(engine.getSession().layers).toHaveLength(0);
  });

  it("rejects AI attempts to remove a layer, even one it proposed itself", () => {
    const layerId = engine.getSession().layers[0]!.id;
    const result = engine.removeLayer(layerId, "ai_approved_state_mutation", 1);
    expect(result.committed).toBe(false);
    expect(engine.getSession().layers).toHaveLength(1);
  });

  it("rejects an unknown layer id", () => {
    const result = engine.removeLayer("does-not-exist", "player_manual_state", 1);
    expect(result.committed).toBe(false);
  });

  it("is undoable — the removed layer's full record is restored", () => {
    const layerId = engine.getSession().layers[0]!.id;
    engine.removeLayer(layerId, "player_manual_state", 1);
    const undoResult = engine.undoLastMutation("player_manual_state", engine.getSession().stateVersion);
    expect(undoResult.committed).toBe(true);
    expect(engine.getSession().layers).toHaveLength(1);
    expect(engine.getSession().layers[0]?.id).toBe(layerId);
  });
});

describe("StateEngine.addMemoryEntry", () => {
  let engine: StateEngine;
  let eventLog: EventLog;

  beforeEach(() => {
    eventLog = new EventLog();
    engine = new StateEngine(makeSession(), eventLog);
  });

  it("appends an entry to the correct memory category", () => {
    const result = engine.addMemoryEntry(
      "episodic",
      { content: "Emma mentioned her sister.", importance: 0.7 },
      0
    );
    expect(result.committed).toBe(true);
    expect(engine.getSession().memory.episodic).toHaveLength(1);
    expect(engine.getSession().memory.episodic[0]?.content).toBe("Emma mentioned her sister.");
  });

  it("assigns a unique id and defaults createdAtTurn to the current state version", () => {
    engine.addMemoryEntry("semantic", { content: "The bar closes at 2am.", importance: 0.3 }, 0);
    const added = engine.getSession().memory.semantic[0]!;
    expect(added.id).toBeTruthy();
    expect(added.createdAtTurn).toBe(0);
  });

  it("logs a memory_entry_added event", () => {
    engine.addMemoryEntry("relational", { content: "Trust is growing.", importance: 0.5 }, 0);
    expect(eventLog.last()?.type).toBe("memory_entry_added");
  });

  it("rejects a stale proposal", () => {
    const result = engine.addMemoryEntry("episodic", { content: "x", importance: 0.5 }, 999);
    expect(result.committed).toBe(false);
  });
});

describe("StateEngine.compactReplaceLayers", () => {
  it("replaces overlapping notes in one undoable mutation", () => {
    const eventLog = new EventLog();
    const engine = new StateEngine(makeSession(), eventLog);
    engine.addLayer(
      { type: "core", priority: 5, content: "Emma is reserved.", active: false },
      "ai_approved_state_mutation",
      0
    );
    engine.addLayer(
      { type: "core", priority: 5, content: "Emma stays composed.", active: false },
      "ai_approved_state_mutation",
      1
    );
    const ids = engine.getSession().layers.map((layer) => layer.id);
    const result = engine.compactReplaceLayers(
      ids,
      [
        {
          type: "core",
          content: "Emma is a reserved, composed bartender.",
          active: false,
          aiGenerated: true,
          priority: 5
        }
      ],
      "player_manual_state",
      2
    );
    expect(result.committed).toBe(true);
    expect(engine.getSession().layers).toHaveLength(1);
    expect(engine.getSession().layers[0]?.content).toContain("reserved, composed");
    expect(engine.getSession().layers[0]?.aiGenerated).toBe(true);
    expect(engine.getSession().layers[0]?.active).toBe(false);

    const undo = engine.undoLastMutation("player_manual_state", 3);
    expect(undo.committed).toBe(true);
    expect(engine.getSession().layers.map((layer) => layer.content).sort()).toEqual([
      "Emma is reserved.",
      "Emma stays composed."
    ]);
  });

  it("rejects AI-sourced compaction", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    engine.addLayer({ type: "core", priority: 5, content: "A", active: true }, "player_manual_state", 0);
    engine.addLayer({ type: "core", priority: 5, content: "B", active: true }, "player_manual_state", 1);
    const ids = engine.getSession().layers.map((layer) => layer.id);
    const result = engine.compactReplaceLayers(
      ids,
      [{ type: "core", content: "AB", active: true, aiGenerated: false, priority: 5 }],
      "ai_approved_state_mutation",
      2
    );
    expect(result.committed).toBe(false);
    expect(engine.getSession().layers).toHaveLength(2);
  });
});
