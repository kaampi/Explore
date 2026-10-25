import { describe, it, expect, beforeEach } from "vitest";
import { StateEngine } from "@state/StateEngine";
import { EventLog } from "@events/EventLog";
import { parseSession, type Session } from "@state/StateSchema";

/**
 * System Invariants — Master Spec §51.
 * These are the non-negotiable rules the whole architecture exists to
 * enforce. They are tested here, isolated from UI and LLM integration,
 * so the foundation is proven before anything is built on top of it.
 */

function makeSession(): Session {
  return {
    openedRoomIds: [],
    storyFlags: [],
    partyIds: [],
    partyHoldIds: [],
    partyPendingIds: [],
    schemaVersion: 2,
    id: "test-session",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 0,
    characters: {
      emma: {
        position: { value: "table", lock: "unlocked" },
        mood: { value: "angry", lock: "player_locked" },
        energy: { value: 50, lock: "unlocked" }
      }
    },
    relationships: {
      emma: {
        trust: { value: 20, lock: "unlocked" },
        familiarity: { value: 10, lock: "unlocked" },
        tension: { value: 5, lock: "unlocked" }
      }
    },
    layers: [],
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: []
  };
}

describe("Invariant: AI can never overwrite player_locked state", () => {
  let engine: StateEngine;
  let session: Session;

  beforeEach(() => {
    session = makeSession();
    engine = new StateEngine(session, new EventLog());
  });

  it("rejects an AI-approved mutation targeting a player_locked field", () => {
    const result = engine.proposeMutation({
      path: "characters.emma.mood",
      value: "calm",
      source: "ai_approved_state_mutation",
      expectedStateVersion: 0
    });

    expect(result.committed).toBe(false);
    expect(engine.getSession().characters.emma?.mood.value).toBe("angry");
  });

  it("rejects raw AI inference the same way as an approved proposal", () => {
    const result = engine.proposeMutation({
      path: "characters.emma.mood",
      value: "calm",
      source: "ai_inference",
      expectedStateVersion: 0
    });

    expect(result.committed).toBe(false);
  });

  it("still allows a player_manual_state mutation on the same locked field", () => {
    const result = engine.proposeMutation({
      path: "characters.emma.mood",
      value: "calm",
      source: "player_manual_state",
      expectedStateVersion: 0
    });

    expect(result.committed).toBe(true);
    expect(engine.getSession().characters.emma?.mood.value).toBe("calm");
  });

  it("allows AI mutations on unlocked fields", () => {
    const result = engine.proposeMutation({
      path: "characters.emma.position",
      value: "bar",
      source: "ai_approved_state_mutation",
      expectedStateVersion: 0
    });

    expect(result.committed).toBe(true);
    expect(engine.getSession().characters.emma?.position.value).toBe("bar");
  });

  it("lets Pass 2 set clothing and clear holding, even if those fields were unset", () => {
    const coat = engine.proposeMutation({
      path: "characters.emma.clothing",
      value: "a towel",
      source: "ai_approved_state_mutation",
      expectedStateVersion: 0
    });
    expect(coat.committed).toBe(true);
    expect(engine.getSession().characters.emma?.clothing?.value).toBe("a towel");

    const drop = engine.proposeMutation({
      path: "characters.emma.holding",
      value: "empty",
      source: "ai_approved_state_mutation",
      expectedStateVersion: 1
    });
    expect(drop.committed).toBe(true);
    expect(engine.getSession().characters.emma?.holding?.value).toBe("");
  });

  it("lets Pass 2 move her off the bar and clear a working pose", () => {
    const walk = engine.proposeMutation({
      path: "characters.emma.position",
      value: "beside the player",
      source: "ai_approved_state_mutation",
      expectedStateVersion: 0
    });
    expect(walk.committed).toBe(true);
    expect(engine.getSession().characters.emma?.position.value).toBe("beside the player");

    const stop = engine.proposeMutation({
      path: "characters.emma.pose",
      value: "",
      source: "ai_approved_state_mutation",
      expectedStateVersion: 1
    });
    expect(stop.committed).toBe(true);
    expect(engine.getSession().characters.emma?.pose?.value).toBe("");
  });

  it("rejects Pass 2 collapsing a named room into the venue title", () => {
    const session = makeSession();
    session.scene = { location: "The Aurora Room — a quiet late-night bar", environment: {} };
    session.characters.emma!.position = { value: "Emma's room", lock: "unlocked" };
    session.layers = [
      {
        id: "place-1",
        type: "environment",
        priority: 0,
        content:
          "Adjoining the bar: toilets off the hall, Emma's room behind the staff door, a guest room upstairs, and a cellar door behind the bar.",
        active: true,
        aiGenerated: false
      }
    ];
    const local = new StateEngine(session, new EventLog());
    const result = local.proposeMutation({
      path: "characters.emma.position",
      value: "The Aurora Room",
      source: "ai_approved_state_mutation",
      expectedStateVersion: 0
    });
    expect(result.committed).toBe(false);
    expect(local.getSession().characters.emma?.position.value).toBe("Emma's room");
  });
});

describe("Invariant: a state commit can always be traced to an event", () => {
  it("appends exactly one event per successful commit", () => {
    const session = makeSession();
    const eventLog = new EventLog();
    const engine = new StateEngine(session, eventLog);

    engine.proposeMutation({
      path: "characters.emma.position",
      value: "bar",
      source: "player_manual_state",
      expectedStateVersion: 0
    });

    expect(eventLog.all()).toHaveLength(1);
    expect(eventLog.last()?.type).toBe("state_mutation_committed");
  });

  it("appends no event on a rejected mutation", () => {
    const session = makeSession();
    const eventLog = new EventLog();
    const engine = new StateEngine(session, eventLog);

    engine.proposeMutation({
      path: "characters.emma.mood",
      value: "calm",
      source: "ai_approved_state_mutation",
      expectedStateVersion: 0
    });

    expect(eventLog.all()).toHaveLength(0);
  });
});

describe("Invariant: stale state versions are rejected (concurrency safety)", () => {
  it("rejects a proposal built against an outdated state_version", () => {
    const session = makeSession();
    const engine = new StateEngine(session, new EventLog());

    const result = engine.proposeMutation({
      path: "characters.emma.position",
      value: "bar",
      source: "player_manual_state",
      expectedStateVersion: 999 // stale on purpose
    });

    expect(result.committed).toBe(false);
  });
});

describe("Relationship meters are lockable live state", () => {
  it("lets AI raise unlocked trust after a scene together", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    const result = engine.proposeMutation({
      path: "relationships.emma.trust",
      value: 35,
      source: "ai_approved_state_mutation",
      expectedStateVersion: 0
    });

    expect(result.committed).toBe(true);
    expect(engine.getSession().relationships.emma?.trust.value).toBe(35);
  });

  it("clamps meter proposals to 0–100", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    const result = engine.proposeMutation({
      path: "relationships.emma.familiarity",
      value: 140,
      source: "ai_approved_state_mutation",
      expectedStateVersion: 0
    });

    expect(result.committed).toBe(true);
    expect(engine.getSession().relationships.emma?.familiarity.value).toBe(100);
  });

  it("rejects AI mutations on a player-locked relationship meter", () => {
    const session = makeSession();
    session.relationships.emma!.trust.lock = "player_locked";
    const engine = new StateEngine(session, new EventLog());

    const result = engine.proposeMutation({
      path: "relationships.emma.trust",
      value: 80,
      source: "ai_approved_state_mutation",
      expectedStateVersion: 0
    });

    expect(result.committed).toBe(false);
    expect(engine.getSession().relationships.emma?.trust.value).toBe(20);
  });
});

describe("Older sessions with raw relationship numbers still load", () => {
  it("wraps number meters as unlocked lockable fields", () => {
    const session = parseSession({
      schemaVersion: 2,
      id: "legacy",
      runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
      stateVersion: 0,
      characters: {
        emma: {
          position: { value: "bar", lock: "unlocked" },
          mood: { value: "neutral", lock: "unlocked" }
        }
      },
      relationships: { emma: { trust: 20, familiarity: 10, tension: 5 } }
    });

    expect(session.relationships.emma).toEqual({
      trust: { value: 20, lock: "unlocked" },
      familiarity: { value: 10, lock: "unlocked" },
      tension: { value: 5, lock: "unlocked" }
    });
  });

  it("fills in an awake player when older sessions omit player state", () => {
    const session = parseSession({
      schemaVersion: 2,
      id: "legacy-player",
      runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
      stateVersion: 0,
      characters: {
        emma: {
          position: { value: "bar", lock: "unlocked" },
          mood: { value: "neutral", lock: "unlocked" }
        }
      },
      scene: { location: "The Aurora Room", environment: {} }
    });
    expect(session.player).toEqual({
      position: { value: "The Aurora Room", lock: "unlocked" },
      status: { value: "awake", lock: "unlocked" }
    });
  });
});

describe("Player presence is lockable live state", () => {
  it("lets AI mark the player asleep", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    const result = engine.proposeMutation({
      path: "player.status",
      value: "asleep",
      source: "ai_approved_state_mutation",
      expectedStateVersion: 0
    });
    expect(result.committed).toBe(true);
    expect(engine.getSession().player?.status.value).toBe("asleep");
  });

  it("rejects an AI-invented spare room that is not in the scene", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    const result = engine.proposeMutation({
      path: "player.position",
      value: "spare room down the hall",
      source: "ai_approved_state_mutation",
      expectedStateVersion: 0
    });
    expect(result.committed).toBe(false);
    expect(engine.getSession().player?.position.value).not.toBe("spare room down the hall");
  });
});

