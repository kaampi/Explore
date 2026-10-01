import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { CheckResultSchema, successGrade, checkOutcomeInstruction, checkOutcomeLabel, checkTarget, percentileNotation, resolveCheck } from "../../src/checks/CheckEngine";
import { playerCheckStats, rollPlayerCheck, validatePlayerCheck } from "../../src/checks/playerCheck";
import { SessionSchema, ConversationTurnSchema, parseSession } from "@state/StateSchema";
import { createSessionFromSetup } from "@session/createSession";
import { charactersHere } from "@state/sceneFocus";
import { StateEngine } from "@state/StateEngine";
import { EventLog } from "@events/EventLog";
import { SessionEngine } from "@session/SessionEngine";
import { LLMAdapter } from "@llm/LLMAdapter";
import { MockProvider } from "@llm/providers/MockProvider";
import type { CompletionRequest } from "@llm/types";
import { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { IDBFactory } from "fake-indexeddb";

function session() {
  return SessionSchema.parse({
    schemaVersion: 2, id: "check-test", stateVersion: 0,
    runtime: { model: "mock", temperature: 0.7, seed: null, provider: "mock" },
    characters: { emma: { name: "Emma", position: { value: "bar", lock: "unlocked" }, mood: { value: "neutral", lock: "unlocked" } } },
    player: { name: "Alex", position: { value: "bar", lock: "unlocked" }, status: { value: "awake", lock: "unlocked" }, stats: { charm: "14" } },
    ruleset: { name: "Romance", attributes: [{ id: "charm", name: "Charm", kind: "number", min: 1, max: 18 }] },
    relationships: {}, layers: [], memory: { episodic: [], semantic: [], relational: [] },
    conversation: [], events: [], snapshots: [], diagnostics: []
  });
}
const attempt = { id: "roll-1", action: "I try to charm them.", targetId: "emma", attributeId: "charm", difficulty: "normal" as const };

describe("Action checks", () => {
  it("anchors a character's Here to the chosen starting room", () => {
    for (const position of ["", "here", " Here "]) {
      const s = createSessionFromSetup({
        location: "The Aurora Room", playerPosition: "cellar",
        lighting: "dim", noise: "quiet", music: false, placeNote: "",
        characters: [{ name: "Emma", personality: "", mood: "neutral", position }]
      }, "start-cellar");
      expect(s.characters.emma!.position.value).toBe("cellar");
      expect(charactersHere(s)).toContain("emma");
    }
  });
  it("repairs saved Here once, without teleporting named rooms or following later moves", () => {
    const raw = session();
    raw.player!.position.value = "cellar";
    raw.characters.emma!.position.value = "here";
    const loaded = parseSession(raw);
    expect(loaded.characters.emma!.position.value).toBe("cellar");
    expect(rollPlayerCheck(loaded, attempt, () => .2).targetId).toBe("emma");
    expect(raw.characters.emma!.position.value).toBe("here");
    loaded.player!.position.value = "bar";
    expect(charactersHere(loaded)).not.toContain("emma");
    expect(parseSession(loaded).characters.emma!.position.value).toBe("cellar");
  });
  it("normalizes different scales and applies explicit difficulty", () => {
    expect(checkTarget(14, 1, 18, "normal")).toBe(76);
    expect(checkTarget(14, 1, 18, "hard")).toBe(56);
    expect(checkTarget(1, 1, 18, "normal")).toBe(0);
    expect(checkTarget(18, 1, 18, "easy")).toBe(100);
  });
  it("has exact boundaries including equal-to-target success", () => {
    const input = { ...attempt, attributeName: "Charm", value: 50, min: 0, max: 100 };
    expect(resolveCheck(input, () => .49)).toMatchObject({ roll: 50, success: true });
    expect(resolveCheck(input, () => .50)).toMatchObject({ roll: 51, success: false });
    expect(resolveCheck({ ...input, value: 0 }, () => 0).success).toBe(false);
    expect(resolveCheck({ ...input, value: 100 }, () => .9999).success).toBe(true);
    expect(() => resolveCheck(input, () => 1)).toThrow();
  });
  it("grades success by exact percentages of the target, including every boundary", () => {
    const input = { ...attempt, attributeName: "Charm", value: 50, min: 0, max: 100 };
    const cases = [[1, "effortlessly"], [9, "effortlessly"], [10, "easily"], [19, "easily"],
      [20, "succeeds"], [29, "succeeds"], [30, "lastEffort"], [39, "lastEffort"],
      [40, "barely"], [50, "barely"], [51, null], [100, null]] as const;
    for (const [roll, grade] of cases) {
      const result = resolveCheck(input, () => (roll - .5) / 100);
      expect(successGrade(result)).toBe(grade);
      expect(checkOutcomeInstruction(result)).toContain(`"successGrade":${JSON.stringify(grade)}`);
    }
    expect(successGrade({ roll: 1, target: 0, success: false })).toBeNull();
    expect(successGrade({ roll: 1, target: 1, success: true })).toBe("barely");
    expect(successGrade({ roll: 13, target: 17, success: true })).toBe("lastEffort");
    expect(successGrade({ roll: 14, target: 17, success: true })).toBe("barely");
    expect(successGrade({ roll: 19, target: 99, success: true })).toBe("effortlessly");
    expect(successGrade({ roll: 20, target: 99, success: true })).toBe("easily");
    expect(checkOutcomeLabel(resolveCheck(input, () => 0))).toBe("Succeeds effortlessly");
    expect(checkOutcomeLabel(resolveCheck(input, () => .50))).toBe("Setback");
    expect(checkOutcomeInstruction(resolveCheck(input, () => 0))).toContain("do not invent a critical success");
  });
  it("keeps percentile faces faithful for all 100 engine results", () => {
    for (let roll = 1; roll <= 100; roll++) {
      const [tens, units] = percentileNotation(roll).split("@")[1]!.split(",").map(Number);
      const decoded = ((tens! % 100) + (units! % 10)) || 100;
      expect(decoded).toBe(roll);
    }
    expect(percentileNotation(100)).toBe("1d100+1d10@100,10");
  });
  it("rejects missing stats, off-scene targets, invalid ranges and stale results", () => {
    const s = session();
    const result = rollPlayerCheck(s, attempt, () => .2);
    expect(() => validatePlayerCheck(s, { ...result, success: !result.success })).toThrow();
    s.player!.stats!.charm = "";
    expect(playerCheckStats(s)).toHaveLength(0);
    expect(() => rollPlayerCheck(s, attempt)).toThrow();
    s.player!.stats!.charm = "15";
    expect(() => validatePlayerCheck(s, result)).toThrow(/changed/);
    s.ruleset!.attributes[0]!.max = 0;
    expect(playerCheckStats(s)).toHaveLength(0);
    s.ruleset!.attributes[0]!.max = 18;
    s.characters.emma!.position.value = "cellar";
    expect(() => rollPlayerCheck(s, attempt)).toThrow(/here/);
  });
  it("validates outcomes over random stats, difficulties and rolls", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 1, max: 100 }),
      fc.constantFrom("easy" as const, "normal" as const, "hard" as const), (value, roll, difficulty) => {
        const result = resolveCheck({ ...attempt, difficulty, attributeName: "Test", value, min: 0, max: 100 }, () => (roll - 0.5) / 100);
        expect(result.roll).toBe(roll);
        expect(result.success).toBe(roll <= result.target);
        expect(CheckResultSchema.safeParse(result).success).toBe(true);
      }));
  });
});

describe("Action check turns", () => {
  it("does not execute a failed movement attempt before narrating it", async () => {
    const s = session();
    const check = rollPlayerCheck(s, { ...attempt, action: "I try to sneak into the cellar." }, () => .99);
    const events = new EventLog();
    const state = new StateEngine(s, events);
    const engine = new SessionEngine(state, new LLMAdapter({ primary: new MockProvider() }), events);
    await engine.runTurn("failed-move", "emma", check.action, {}, { check });
    expect(state.getSession().player!.position.value).toBe("bar");
    expect(state.getSession().partyIds).toEqual([]);
  });
  it("makes the outcome authoritative and preserves it on idempotent retry, regenerate and replay", async () => {
    const requests: CompletionRequest[] = [];
    class RecordingProvider extends MockProvider {
      override async *streamCompletion(request: CompletionRequest) {
        requests.push(request);
        yield* super.streamCompletion(request);
      }
    }
    const s = session();
    const check = rollPlayerCheck(s, attempt, () => .42);
    const events = new EventLog();
    const state = new StateEngine(s, events);
    const engine = new SessionEngine(state, new LLMAdapter({ primary: new RecordingProvider({ responseChunks: ["She smiles."] }) }), events);
    await engine.runTurn("one", "emma", check.action, {}, { check });
    const player = ConversationTurnSchema.parse(state.getSession().conversation[0]);
    expect(player.check).toEqual(check);
    const outcome = requests[0]!.messages.find((message) => message.content.includes("ENGINE-RESOLVED ACTION CHECK"));
    expect(outcome?.role).toBe("system");
    expect(outcome?.content).toContain('"roll":43');
    expect(outcome?.content).toContain('"outcome":"SUCCESS"');
    expect(outcome?.content).toContain('"actor":"Alex"');
    expect(outcome?.content).toContain("Continue with the counterpart's reaction only");
    expect(outcome?.content).toContain("SUCCESS IS ESTABLISHED FACT");
    expect(outcome?.content).not.toContain("FAILURE IS ESTABLISHED FACT");
    await engine.runTurn("one", "emma", check.action, {}, { check });
    expect(requests).toHaveLength(1);
    await engine.regenerateLastTurn("two");
    expect(requests[1]!.messages.find((message) => message.content.includes("ENGINE-RESOLVED"))?.content).toBe(outcome?.content);
    // Replay can restore the saved outcome even on a new engine instance.
    const reloaded = new SessionEngine(state, new LLMAdapter({ primary: new RecordingProvider() }), events);
    const lastReply = ConversationTurnSchema.parse(state.getSession().conversation.at(-1));
    await reloaded.replayTurn("three", lastReply.turn);
    expect(requests[2]!.messages.find((message) => message.content.includes("ENGINE-RESOLVED"))?.content).toBe(outcome?.content);
  });
  it("round-trips a check through IndexedDB", async () => {
    const s = session();
    const check = rollPlayerCheck(s, attempt, () => .99);
    s.conversation.push({ turn: 1, role: "player", content: check.action, check });
    const repo = new IndexedDBRepository(new IDBFactory());
    await repo.saveSession(s);
    const loaded = await repo.loadSession(s.id);
    expect(ConversationTurnSchema.parse(loaded.conversation[0]).check).toEqual(check);
    await repo.close();
  });
});
