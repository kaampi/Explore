import { describe, it, expect } from "vitest";
import { evaluateTrigger, isEffectivelyActive, getEffectiveActiveLayers, buildLayerBlocks } from "@layers/LayerEngine";
import type { Session, Layer } from "@state/StateSchema";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    schemaVersion: 2,
    id: "s1",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 0,
    characters: {
      emma: {
        position: { value: "bar", lock: "unlocked" },
        mood: { value: "angry", lock: "unlocked" }
      }
    },
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

function layer(overrides: Partial<Layer> & Pick<Layer, "id" | "type">): Layer {
  return { priority: 0, content: "layer content", active: false, aiGenerated: false, once: false, spent: false, ...overrides };
}

describe("evaluateTrigger", () => {
  it("matches when the referenced field equals the expected value", () => {
    const session = makeSession();
    expect(evaluateTrigger(session, "characters.emma.mood==angry")).toBe(true);
  });

  it("does not match when the value differs", () => {
    const session = makeSession();
    expect(evaluateTrigger(session, "characters.emma.mood==happy")).toBe(false);
  });

  it("returns false for an undefined trigger", () => {
    expect(evaluateTrigger(makeSession(), undefined)).toBe(false);
  });

  it("returns false for a malformed trigger string", () => {
    expect(evaluateTrigger(makeSession(), "not-a-valid-trigger")).toBe(false);
  });

  it("returns false for a path that doesn't resolve", () => {
    expect(evaluateTrigger(makeSession(), "characters.nobody.mood==angry")).toBe(false);
  });
});

describe("isEffectivelyActive", () => {
  it("core/relationship/environment layers use the persisted active flag directly", () => {
    const session = makeSession();
    expect(isEffectivelyActive(session, layer({ id: "l1", type: "core", active: true }))).toBe(true);
    expect(isEffectivelyActive(session, layer({ id: "l2", type: "core", active: false }))).toBe(false);
  });

  it("a state_trigger layer becomes active when its trigger matches, even if persisted active=false", () => {
    const session = makeSession();
    const triggerLayer = layer({
      id: "l3",
      type: "state_trigger",
      active: false,
      trigger: "characters.emma.mood==angry"
    });
    expect(isEffectivelyActive(session, triggerLayer)).toBe(true);
  });

  it("a state_trigger layer stays inactive when its trigger doesn't match and active=false", () => {
    const session = makeSession();
    const triggerLayer = layer({
      id: "l4",
      type: "state_trigger",
      active: false,
      trigger: "characters.emma.mood==happy"
    });
    expect(isEffectivelyActive(session, triggerLayer)).toBe(false);
  });

  it("a state_trigger layer with no trigger falls back to its persisted flag", () => {
    const session = makeSession();
    expect(isEffectivelyActive(session, layer({ id: "l5", type: "state_trigger", active: true }))).toBe(true);
  });

  it("an approved keyword layer is in play only when recent chat hits a keyword", () => {
    const lore = layer({
      id: "cellar",
      type: "environment",
      active: true,
      keywords: ["cellar"],
      content: "SECRET CELLAR LORE"
    });
    expect(isEffectivelyActive(makeSession(), lore)).toBe(false);
    expect(
      isEffectivelyActive(
        makeSession({
          conversation: [{ turn: 1, role: "player", content: "What's in the cellar?" }]
        }),
        lore
      )
    ).toBe(true);
  });

  it("an unapproved keyword layer never fires, even on a keyword hit", () => {
    const lore = layer({
      id: "cellar",
      type: "environment",
      active: false,
      keywords: ["cellar"],
      content: "SECRET CELLAR LORE"
    });
    const session = makeSession({
      conversation: [{ turn: 1, role: "player", content: "What's in the cellar?" }]
    });
    expect(isEffectivelyActive(session, lore)).toBe(false);
  });
});

describe("§51 invariant: inactive layers never affect context", () => {
  it("buildLayerBlocks produces no block at all for an inactive layer", () => {
    const session = makeSession({
      layers: [layer({ id: "inactive-1", type: "core", active: false, content: "should never appear" })]
    });
    const blocks = buildLayerBlocks(session);
    expect(blocks).toHaveLength(0);
  });

  it("buildLayerBlocks includes only the active layer when mixed with inactive ones", () => {
    const session = makeSession({
      layers: [
        layer({ id: "inactive-1", type: "core", active: false, content: "hidden content" }),
        layer({ id: "active-1", type: "core", active: true, content: "visible content" })
      ]
    });
    const blocks = buildLayerBlocks(session);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.content).toBe("visible content");
    expect(blocks[0]?.required).toBe(true);

    const allContent = blocks.map((b) => b.content).join(" ");
    expect(allContent).not.toContain("hidden content");
  });

  it("a triggered layer's content appears only once its trigger condition is met", () => {
    const inactiveSession = makeSession({
      layers: [
        layer({
          id: "trigger-1",
          type: "state_trigger",
          active: false,
          trigger: "characters.emma.mood==furious",
          content: "Emma is furious content"
        })
      ]
    });
    expect(buildLayerBlocks(inactiveSession)).toHaveLength(0);

    const matchingSession = makeSession({
      characters: {
        emma: { position: { value: "bar", lock: "unlocked" }, mood: { value: "furious", lock: "unlocked" } }
      },
      layers: [
        layer({
          id: "trigger-1",
          type: "state_trigger",
          active: false,
          trigger: "characters.emma.mood==furious",
          content: "Emma is furious content"
        })
      ]
    });
    const blocks = buildLayerBlocks(matchingSession);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.content).toBe("Emma is furious content");
  });

  it("does not put keyword-gated lore in context until chat mentions it", () => {
    const lore = layer({
      id: "cellar",
      type: "environment",
      active: true,
      keywords: ["cellar"],
      content: "SECRET CELLAR LORE"
    });
    expect(buildLayerBlocks(makeSession({ layers: [lore] })).map((b) => b.content).join("")).not.toContain(
      "SECRET CELLAR LORE"
    );
    const woke = makeSession({
      layers: [lore],
      conversation: [{ turn: 1, role: "player", content: "Show me the cellar." }]
    });
    expect(buildLayerBlocks(woke).map((b) => b.content).join("")).toContain("SECRET CELLAR LORE");
  });
});

describe("getEffectiveActiveLayers ordering", () => {
  it("sorts active layers by priority ascending", () => {
    const session = makeSession({
      layers: [
        layer({ id: "b", type: "core", active: true, priority: 5 }),
        layer({ id: "a", type: "core", active: true, priority: 1 })
      ]
    });
    const active = getEffectiveActiveLayers(session);
    expect(active.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("core layers get a lower (better) context priority band than other layer types", () => {
    const session = makeSession({
      layers: [
        layer({ id: "core-1", type: "core", active: true, priority: 0 }),
        layer({ id: "env-1", type: "environment", active: true, priority: 0 })
      ]
    });
    const blocks = buildLayerBlocks(session);
    const core = blocks.find((b) => b.id === "layer-core-1")!;
    const env = blocks.find((b) => b.id === "layer-env-1")!;
    expect(core.priority).toBeLessThan(env.priority);
    expect(core.required).toBe(true);
    expect(env.required).toBe(false);
  });

  it("keyword-gated core lore stays droppable", () => {
    const session = makeSession({
      conversation: [{ turn: 1, role: "player", content: "Look at the brooch" }],
      layers: [
        layer({
          id: "brooch",
          type: "core",
          active: true,
          keywords: ["brooch"],
          content: "If he shows the brooch"
        })
      ]
    });
    const blocks = buildLayerBlocks(session);
    expect(blocks[0]?.required).toBe(false);
  });

  it("does not send the always-on place layer when Here already has that copy", () => {
    const session = makeSession({
      scene: {
        location: "The Aurora Room",
        environment: {},
        note: "A long typewriter intro.",
        brief: "A hidden jazz bar."
      },
      layers: [
        layer({
          id: "layer-place",
          type: "environment",
          active: true,
          content: "A hidden jazz bar."
        }),
        layer({
          id: "layer-place-lore-1",
          type: "environment",
          active: true,
          keywords: ["cellar"],
          content: "A locked cellar door."
        })
      ]
    });
    const blocks = buildLayerBlocks(session);
    expect(blocks.some((block) => block.id === "layer-layer-place")).toBe(false);
  });
});

describe("once beats", () => {
  const hunters = layer({
    id: "hunters",
    type: "state_trigger",
    active: true,
    once: true,
    trigger: "return_to_bar",
    keywords: ["brooch"],
    content: "TWO STRANGERS ENTER"
  });

  function barSession(overrides: Partial<Session> = {}): Session {
    return makeSession({
      player: {
        position: { value: "at the bar", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      },
      layers: [hunters],
      ...overrides
    });
  }

  it("does not fire on the first night at the bar", () => {
    const session = barSession({
      conversation: [{ turn: 1, role: "player", content: "I show her the brooch" }]
    });
    expect(isEffectivelyActive(session, hunters)).toBe(false);
    expect(buildLayerBlocks(session).map((b) => b.content).join("")).not.toContain("TWO STRANGERS ENTER");
  });

  it("fires on return to the bar once the brooch has been seen or held", () => {
    const session = barSession({
      conversation: [{ turn: 1, role: "player", content: "I show her the brooch" }]
    });
    expect(isEffectivelyActive(session, hunters, { continuation: true })).toBe(true);
    const blocks = buildLayerBlocks(session, { continuation: true });
    expect(blocks.map((b) => b.content).join("")).toContain("TWO STRANGERS ENTER");
    expect(blocks[0]?.required).toBe(true);
  });

  it("fires when someone is holding the brooch even if chat has moved on", () => {
    const session = barSession({
      characters: {
        emma: {
          position: { value: "behind the bar", lock: "unlocked" },
          mood: { value: "wary", lock: "unlocked" },
          holding: { value: "the woman's brooch", lock: "unlocked" }
        }
      }
    });
    expect(isEffectivelyActive(session, hunters, { continuation: true })).toBe(true);
  });

  it("does not fire on return if the brooch was never in play", () => {
    const session = barSession();
    expect(isEffectivelyActive(session, hunters, { continuation: true })).toBe(false);
  });

  it("does not fire in a side room", () => {
    const session = barSession({
      player: {
        position: { value: "Emma's room", lock: "unlocked" },
        status: { value: "awake", lock: "unlocked" }
      },
      scene: {
        location: "The Aurora Room",
        environment: {},
        rooms: [{ id: "emmas-room", label: "Emma's room", description: "", keywords: [] }]
      },
      conversation: [{ turn: 1, role: "player", content: "I show her the brooch" }]
    });
    expect(isEffectivelyActive(session, hunters, { continuation: true })).toBe(false);
  });

  it("never returns after it is spent", () => {
    const spent = { ...hunters, spent: true };
    const session = barSession({
      layers: [spent],
      conversation: [{ turn: 1, role: "player", content: "I show her the brooch" }]
    });
    expect(isEffectivelyActive(session, spent, { continuation: true })).toBe(false);
  });

  it("does not use the last-8 keyword window — older chat still counts", () => {
    const session = barSession({
      conversation: [
        { turn: 1, role: "player", content: "I show her the brooch" },
        ...Array.from({ length: 10 }, (_, i) => ({
          turn: i + 2,
          role: "player" as const,
          content: "We talk about the weather."
        }))
      ]
    });
    expect(isEffectivelyActive(session, hunters, { continuation: true })).toBe(true);
  });
});

describe("story flag gates", () => {
  it("requiresFlags: stays inactive until the flag is set", () => {
    const gated = layer({ id: "g1", type: "core", active: true, requiresFlags: ["met_the_stranger"] });
    expect(isEffectivelyActive(makeSession(), gated)).toBe(false);
    expect(isEffectivelyActive(makeSession({ storyFlags: ["met_the_stranger"] }), gated)).toBe(true);
  });

  it("requiresAbsentFlags: the brooch dream never fires once the brooch was given away", () => {
    const dream = layer({
      id: "brooch-dream",
      type: "state_trigger",
      active: true,
      once: true,
      trigger: "player.status==asleep",
      requiresAbsentFlags: ["brosch_given"],
      content: "The fallen comrade and the old woman: Emma should have the brooch."
    });
    const asleep = (overrides: Partial<Session> = {}) =>
      makeSession({
        player: { position: { value: "Emma's room", lock: "unlocked" }, status: { value: "asleep", lock: "unlocked" } },
        layers: [dream],
        ...overrides
      });

    // Kept the brooch: the dream is free to fire.
    expect(isEffectivelyActive(asleep(), dream)).toBe(true);

    // Gave it to Emma: the exact same trigger no longer fires.
    expect(isEffectivelyActive(asleep({ storyFlags: ["brosch_given"] }), dream)).toBe(false);
  });

  it("requiresFlags and requiresAbsentFlags compose with an existing trigger/keyword gate, not replace it", () => {
    const layerWithBoth = layer({
      id: "g2",
      type: "state_trigger",
      active: false,
      trigger: "characters.emma.mood==angry",
      requiresFlags: ["armed"]
    });
    // Trigger matches but the flag is missing.
    expect(isEffectivelyActive(makeSession(), layerWithBoth)).toBe(false);
    // Flag present but the trigger no longer matches.
    expect(
      isEffectivelyActive(
        makeSession({
          storyFlags: ["armed"],
          characters: { emma: { position: { value: "bar", lock: "unlocked" }, mood: { value: "calm", lock: "unlocked" } } }
        }),
        layerWithBoth
      )
    ).toBe(false);
    // Both satisfied.
    expect(isEffectivelyActive(makeSession({ storyFlags: ["armed"] }), layerWithBoth)).toBe(true);
  });

  it("a flag gate applies even to a spent-checked, otherwise-always-on core layer", () => {
    const gated = layer({ id: "g3", type: "core", active: true, requiresAbsentFlags: ["curse_lifted"] });
    expect(isEffectivelyActive(makeSession(), gated)).toBe(true);
    expect(isEffectivelyActive(makeSession({ storyFlags: ["curse_lifted"] }), gated)).toBe(false);
  });
});
