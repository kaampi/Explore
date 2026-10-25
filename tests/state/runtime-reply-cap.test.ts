import { describe, it, expect } from "vitest";
import { StateEngine } from "@state/StateEngine";
import { EventLog } from "@events/EventLog";
import {
  DEFAULT_MAX_REPLY_TOKENS,
  effectiveMaxReplyTokens,
  pass1PredictTokens,
  type Session
} from "@state/StateSchema";

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

describe("StateEngine.setRuntimeMaxReplyTokens", () => {
  it("persists a Pass 1 cap without bumping stateVersion", () => {
    const eventLog = new EventLog();
    const engine = new StateEngine(makeSession(), eventLog);
    engine.setRuntimeMaxReplyTokens(160);
    expect(engine.getSession().runtime.maxReplyTokens).toBe(160);
    expect(engine.getSession().stateVersion).toBe(0);
    expect(eventLog.last()?.type).toBe("runtime_max_reply_changed");
  });

  it("clamps to 64–1024", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    engine.setRuntimeMaxReplyTokens(10);
    expect(engine.getSession().runtime.maxReplyTokens).toBe(64);
    engine.setRuntimeMaxReplyTokens(4000);
    expect(engine.getSession().runtime.maxReplyTokens).toBe(1024);
  });

  it("does nothing when the resolved cap is unchanged", () => {
    const eventLog = new EventLog();
    const engine = new StateEngine(makeSession(), eventLog);
    engine.setRuntimeMaxReplyTokens(DEFAULT_MAX_REPLY_TOKENS);
    expect(engine.getSession().runtime.maxReplyTokens).toBeUndefined();
    expect(eventLog.all()).toHaveLength(0);
  });
});

describe("effectiveMaxReplyTokens", () => {
  it("defaults to beat (128) and remaps the old 240/400 caps", () => {
    expect(effectiveMaxReplyTokens(undefined)).toBe(128);
    expect(effectiveMaxReplyTokens(240)).toBe(128);
    expect(effectiveMaxReplyTokens(400)).toBe(160);
    expect(effectiveMaxReplyTokens(160)).toBe(160);
  });

  it("gives Pass 1 headroom past the target so the last sentence can finish", () => {
    expect(pass1PredictTokens(undefined)).toBe(192);
    expect(pass1PredictTokens(96)).toBe(160);
  });
});

