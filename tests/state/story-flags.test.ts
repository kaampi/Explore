import { describe, it, expect } from "vitest";
import { EventLog } from "@events/EventLog";
import { StateEngine } from "@state/StateEngine";
import {
  hasStoryFlag,
  nextFlagsAfterClear,
  nextFlagsAfterSet,
  normalizeStoryFlag,
  storyFlagsSatisfied
} from "@state/storyFlags";
import type { Session } from "@state/StateSchema";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    schemaVersion: 2,
    id: "s1",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 0,
    characters: {},
    player: {
      position: { value: "at the bar", lock: "unlocked" },
      status: { value: "awake", lock: "unlocked" }
    },
    relationships: {},
    layers: [],
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: [],
    storyFlags: [],
    ...overrides
  };
}

describe("storyFlags (pure)", () => {
  it("trims when normalizing", () => {
    expect(normalizeStoryFlag("  brosch_given  ")).toBe("brosch_given");
  });

  it("hasStoryFlag reads the set", () => {
    const session = makeSession({ storyFlags: ["brosch_given"] });
    expect(hasStoryFlag(session, "brosch_given")).toBe(true);
    expect(hasStoryFlag(session, "fienden_dod")).toBe(false);
    expect(hasStoryFlag(session, "  ")).toBe(false);
  });

  it("nextFlagsAfterSet adds once, no-ops when already set", () => {
    expect(nextFlagsAfterSet(undefined, "brosch_given")).toEqual(["brosch_given"]);
    expect(nextFlagsAfterSet(["brosch_given"], "brosch_given")).toBeUndefined();
    expect(nextFlagsAfterSet(["a"], "b")).toEqual(["a", "b"]);
  });

  it("nextFlagsAfterClear removes once, no-ops when already absent", () => {
    expect(nextFlagsAfterClear(["a", "b"], "a")).toEqual(["b"]);
    expect(nextFlagsAfterClear(["a"], "b")).toBeUndefined();
    expect(nextFlagsAfterClear(undefined, "a")).toBeUndefined();
  });

  it("storyFlagsSatisfied: empty requirements always pass", () => {
    expect(storyFlagsSatisfied(makeSession())).toBe(true);
  });

  it("storyFlagsSatisfied: requires present", () => {
    const session = makeSession({ storyFlags: ["fienden_dod"] });
    expect(storyFlagsSatisfied(session, ["fienden_dod"])).toBe(true);
    expect(storyFlagsSatisfied(session, ["annan_lapp"])).toBe(false);
  });

  it("storyFlagsSatisfied: requires absent — the brooch dream case", () => {
    const gaveIt = makeSession({ storyFlags: ["brosch_given"] });
    const keptIt = makeSession({ storyFlags: [] });
    // The dream only fires while the brooch has not been given away.
    expect(storyFlagsSatisfied(gaveIt, undefined, ["brosch_given"])).toBe(false);
    expect(storyFlagsSatisfied(keptIt, undefined, ["brosch_given"])).toBe(true);
  });

  it("storyFlagsSatisfied: both present and absent conditions together", () => {
    const session = makeSession({ storyFlags: ["fienden_dod"] });
    // Förhandla: only while the enemy is alive.
    expect(storyFlagsSatisfied(session, [], ["fienden_dod"])).toBe(false);
    expect(storyFlagsSatisfied(makeSession(), [], ["fienden_dod"])).toBe(true);
  });
});

describe("StateEngine story flags", () => {
  it("setStoryFlag adds the flag and logs an event", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    engine.setStoryFlag("brosch_given");
    expect(engine.getSession().storyFlags).toEqual(["brosch_given"]);
    const last = engine.getEventLog().last();
    expect(last?.type).toBe("story_flag_set");
    expect(last?.payload).toEqual({ flag: "brosch_given" });
  });

  it("setStoryFlag is a no-op, and logs nothing, when already set", () => {
    const engine = new StateEngine(makeSession({ storyFlags: ["brosch_given"] }), new EventLog());
    engine.setStoryFlag("brosch_given");
    expect(engine.getSession().storyFlags).toEqual(["brosch_given"]);
    expect(engine.getEventLog().all()).toEqual([]);
  });

  it("clearStoryFlag removes the flag and logs an event", () => {
    const engine = new StateEngine(makeSession({ storyFlags: ["brosch_given"] }), new EventLog());
    engine.clearStoryFlag("brosch_given");
    expect(engine.getSession().storyFlags).toEqual([]);
    const last = engine.getEventLog().last();
    expect(last?.type).toBe("story_flag_cleared");
    expect(last?.payload).toEqual({ flag: "brosch_given" });
  });

  it("clearStoryFlag is a no-op, and logs nothing, when already absent", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    engine.clearStoryFlag("brosch_given");
    expect(engine.getSession().storyFlags).toEqual([]);
    expect(engine.getEventLog().all()).toEqual([]);
  });

  it("does not bump stateVersion — flags are not part of the dialogue undo chain", () => {
    const engine = new StateEngine(makeSession(), new EventLog());
    const before = engine.getSession().stateVersion;
    engine.setStoryFlag("brosch_given");
    expect(engine.getSession().stateVersion).toBe(before);
  });
});
