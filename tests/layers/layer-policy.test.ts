import { describe, it, expect } from "vitest";
import {
  mustForceInactiveOnAdd,
  resolveLayerActivationChange,
  shouldDiscardAiLayerProposal,
  shouldBlockLayerActivation
} from "@layers/LayerPolicy";
import type { Session } from "@state/StateSchema";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
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
    openedRoomIds: [],
    partyIds: [],
    partyHoldIds: [],
    partyPendingIds: [],
    ...overrides
  };
}

describe("mustForceInactiveOnAdd", () => {
  it("forces inactive for AI-sourced layer additions", () => {
    expect(mustForceInactiveOnAdd("ai_approved_state_mutation")).toBe(true);
    expect(mustForceInactiveOnAdd("ai_inference")).toBe(true);
  });

  it("does not force inactive for player or system additions", () => {
    expect(mustForceInactiveOnAdd("player_manual_state")).toBe(false);
    expect(mustForceInactiveOnAdd("immutable_system_constraint")).toBe(false);
    expect(mustForceInactiveOnAdd("explicit_scenario_rule")).toBe(false);
  });
});

describe("resolveLayerActivationChange", () => {
  it("rejects any AI source from activating a layer", () => {
    expect(resolveLayerActivationChange("ai_approved_state_mutation").allowed).toBe(false);
    expect(resolveLayerActivationChange("ai_inference").allowed).toBe(false);
  });

  it("allows player and system sources to activate a layer", () => {
    expect(resolveLayerActivationChange("player_manual_state").allowed).toBe(true);
    expect(resolveLayerActivationChange("immutable_system_constraint").allowed).toBe(true);
    expect(resolveLayerActivationChange("explicit_scenario_rule").allowed).toBe(true);
  });
});

describe("shouldDiscardAiLayerProposal", () => {
  it("discards an AI environment note that invents a spare room", () => {
    const decision = shouldDiscardAiLayerProposal(
      "ai_approved_state_mutation",
      { type: "environment", content: "There is a spare room down the hall." },
      makeSession()
    );
    expect(decision.discard).toBe(true);
  });

  it("discards an AI environment note that invents a dog", () => {
    const decision = shouldDiscardAiLayerProposal(
      "ai_inference",
      { type: "environment", content: "A stray dog sleeps by the door." },
      makeSession()
    );
    expect(decision.discard).toBe(true);
  });

  it("keeps rain, lighting, and personality notes", () => {
    const session = makeSession();
    expect(
      shouldDiscardAiLayerProposal(
        "ai_approved_state_mutation",
        { type: "environment", content: "It's raining on the windows." },
        session
      ).discard
    ).toBe(false);
    expect(
      shouldDiscardAiLayerProposal(
        "ai_approved_state_mutation",
        { type: "core", content: "She keeps a spare room in her heart." },
        session
      ).discard
    ).toBe(false);
  });

  it("does not discard a player-authored guest room", () => {
    expect(
      shouldDiscardAiLayerProposal(
        "player_manual_state",
        { type: "environment", content: "Guest rooms upstairs." },
        makeSession()
      ).discard
    ).toBe(false);
  });

  it("allows an AI environment note when the guest room is already canon", () => {
    const session = makeSession({
      layers: [
        {
          id: "place-1",
          type: "environment",
          priority: 0,
          content: "An inn. Guest rooms upstairs.",
          active: true,
          aiGenerated: false
        }
      ]
    });
    expect(
      shouldDiscardAiLayerProposal(
        "ai_approved_state_mutation",
        { type: "environment", content: "The guest room is quiet tonight." },
        session
      ).discard
    ).toBe(false);
  });
});

describe("shouldBlockLayerActivation", () => {
  it("blocks Approve on a leftover ungrounded AI place-note", () => {
    const decision = shouldBlockLayerActivation(
      {
        type: "environment",
        content: "There is a spare room down the hall.",
        aiGenerated: true
      },
      makeSession()
    );
    expect(decision.discard).toBe(true);
  });

  it("does not block a player place-note", () => {
    expect(
      shouldBlockLayerActivation(
        { type: "environment", content: "Guest rooms upstairs.", aiGenerated: false },
        makeSession()
      ).discard
    ).toBe(false);
  });
});
