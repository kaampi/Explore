import { describe, expect, it, vi } from "vitest";
import { parseSession, ConversationTurnSchema } from "@state/StateSchema";
import { playMode, usesGameRules, usesStoryline } from "@state/playMode";
import { assembleContext, renderContext, buildPass1Messages, parseConversationTurns } from "@context/ContextEngine";
import { buildLayerBlocks, onceLayersFiring } from "@layers/LayerEngine";
import { groupLayersForCompaction } from "@layers/LayerCompaction";
import { resolveWhatNowIntercept, whatNowBlocksComposer } from "@state/whatNowGate";
import { rollPlayerCheck } from "../../src/checks/playerCheck";
import { createSessionFromSetup } from "@session/createSession";
import { StateEngine } from "@state/StateEngine";
import { EventLog } from "@events/EventLog";
import { SessionEngine } from "@session/SessionEngine";
import { LLMAdapter } from "@llm/LLMAdapter";
import { MockProvider } from "@llm/providers/MockProvider";
import type { CompletionRequest } from "@llm/types";
import type { PlayMode } from "@state/playMode";
import { mapExits } from "@state/roomExits";
import { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { IDBFactory } from "fake-indexeddb";

function scene(mode?: PlayMode) {
  const s = createSessionFromSetup({
    location: "bar", lighting: "dim", noise: "quiet", music: false, placeNote: "WORLD_PLACE",
    storyTitle: "World", storyPremise: "WORLD_BACKGROUND", storyline: "STORYLINE_SECRET",
    characters: [{ name: "Emma", personality: "WORLD_PERSONALITY", mood: "neutral", position: "bar",
      stats: { charm: "50" }, lore: [{ content: "WORLD_LORE" }, { content: "STORYLINE_LORE", purpose: "storyline" }, { content: "RULE_LORE", purpose: "rules" }] }],
    ruleset: { name: "Rules", attributes: [{ id: "charm", name: "Charm", kind: "number", min: 0, max: 100, description: "", highMeaning: "", lowMeaning: "", midMeaning: "", options: [], maxShift: 0 }] },
    playerIdentity: { name: "Alex", stats: { charm: "50" } },
    whatNowSets: [{ id: "quest", keywords: ["mission"], choices: [{ id: "one", label: "Begin the mission", room: "__stay__" }] }],
    onceBeats: [{ content: "STORYLINE_ONCE", keywords: ["ring"], trigger: "return_to_bar" }],
    ...(mode ? { playMode: mode } : {})
  }, "mode-test");
  s.conversation = [{ turn: 1, role: "player", content: "ring" }];
  s.whatNowOpen = true;
  return s;
}

describe("Play modes", () => {
  it("defaults old saves to Adventure and persists explicit modes", () => {
    expect(playMode(scene())).toBe("adventure");
    for (const mode of ["adventure", "exploration", "fanfiction"] as const) {
      const s = parseSession(scene(mode));
      expect(playMode(s)).toBe(mode);
      expect(usesGameRules(s)).toBe(mode !== "fanfiction");
      expect(usesStoryline(s)).toBe(mode === "adventure");
    }
  });
  it("filters storyline and rules at source while retaining world material", () => {
    for (const mode of ["adventure", "exploration", "fanfiction"] as const) {
      const s = scene(mode);
      const content = renderContext(assembleContext(s, { continuation: true }));
      expect(content).toContain("WORLD_BACKGROUND");
      expect(content).toContain("WORLD_LORE");
      expect(content).toContain("WORLD_PERSONALITY");
      expect(content.includes("STORYLINE_SECRET")).toBe(mode === "adventure");
      expect(content.includes("STORYLINE_LORE")).toBe(mode === "adventure");
      expect(content.includes("STORYLINE_ONCE")).toBe(mode === "adventure");
      expect(content.includes("RULE_LORE")).toBe(mode !== "fanfiction");
      expect(onceLayersFiring(s, { continuation: true }).length).toBe(mode === "adventure" ? 1 : 0);
      expect(buildLayerBlocks(s).some((block) => block.content.includes("STORYLINE_LORE"))).toBe(mode === "adventure");
    }
  });
  it("disables storyline gates in free modes while retaining Adventure gates", () => {
    expect(whatNowBlocksComposer(scene("adventure"))).toBe(true);
    expect(resolveWhatNowIntercept(scene("adventure"), "hello").kind).toBe("blocked");
    for (const mode of ["exploration", "fanfiction"] as const) {
      expect(whatNowBlocksComposer(scene(mode))).toBe(false);
      expect(resolveWhatNowIntercept(scene(mode), "mission").kind).toBe("pass");
    }
  });
  it("retains checks in exploration but rejects them in Fan Fiction", () => {
    const attempt = { id: "check", action: "I flirt.", targetId: "emma", attributeId: "charm", difficulty: "normal" as const };
    expect(rollPlayerCheck(scene("exploration"), attempt, () => 0).success).toBe(true);
    expect(() => rollPlayerCheck(scene("fanfiction"), attempt)).toThrow(/Fan Fiction/);
  });
  it("relaxes locked room rules only in Fan Fiction", () => {
    const s = scene("exploration");
    s.scene!.rooms = [{ id: "vault", label: "Vault", description: "", keywords: [], fromRoomIds: [], gate: "locked" }];
    expect(mapExits(s).find((exit) => exit.id === "vault")?.enabled).toBe(false);
    s.playMode = "fanfiction";
    expect(mapExits(s).find((exit) => exit.id === "vault")?.enabled).toBe(true);
  });
  it("cannot merge storyline or rule layers into ordinary world lore", () => {
    const s = scene();
    const groups = groupLayersForCompaction(s.layers, ["emma"]);
    expect(groups.flatMap((group) => group.layers).some((layer) => layer.purpose === "storyline" || layer.purpose === "rules")).toBe(false);
  });
  it("retains directions as required fiction even when ordinary chat is trimmed", () => {
    const s = scene("fanfiction");
    s.conversation = [{ turn: 1, role: "player", content: "Emma now serves the dark lord.", intent: "director" }, { turn: 2, role: "character", speaker: "emma", content: "She reveals her allegiance." }];
    const assembled = assembleContext(s, { maxConversationTurns: 1 });
    // Persistent directions come from the whole saved conversation, not just selected chat.
    const block = assembled.includedBlocks.find((block) => block.id === "story-directions");
    expect(block?.required).toBe(true);
    expect(block?.content).toContain("Emma now serves the dark lord.");
    const messages = buildPass1Messages(assembled, parseConversationTurns(s, undefined).turns, "Continue", "emma", { playMode: "fanfiction", intent: "director" });
    expect(messages.at(-1)?.content).toBe("Story direction (coauthor): Continue");
    expect(messages[0]?.content).not.toContain("Live closeness");
  });
});

it("saves, regenerates and replays Fan Fiction directions without running mechanical Pass 2", async () => {
  const s = scene("fanfiction");
  const requests: CompletionRequest[] = [];
  class Recording extends MockProvider {
    override async *streamCompletion(request: CompletionRequest) { requests.push(request); yield* super.streamCompletion(request); }
  }
  const extractor = vi.fn(async () => []);
  const events = new EventLog();
  const state = new StateEngine(s, events);
  const engine = new SessionEngine(state, new LLMAdapter({ primary: new Recording() }), events, extractor);
  const direction = "Emma and Alex are now a couple.";
  await engine.runTurn("one", "emma", direction, {}, { intent: "director" });
  expect(extractor).not.toHaveBeenCalled();
  expect(ConversationTurnSchema.parse(state.getSession().conversation.at(-2)).intent).toBe("director");
  await engine.regenerateLastTurn("two");
  const last = ConversationTurnSchema.parse(state.getSession().conversation.at(-1));
  await engine.replayTurn("three", last.turn);
  for (const request of requests) {
    expect(request.messages[0]!.content).toContain(direction);
    expect(request.messages[0]!.content).not.toContain("STORYLINE_SECRET");
    expect(request.messages.at(-1)!.content).toContain("Story direction (coauthor)");
  }
  const repo = new IndexedDBRepository(new IDBFactory());
  await repo.saveSession(state.getSession());
  const loaded = await repo.loadSession(s.id);
  expect(loaded.playMode).toBe("fanfiction");
  expect(renderContext(assembleContext(loaded))).toContain(direction);
  await repo.close();
});

it("rejects coauthor input outside Fan Fiction before appending it", async () => {
  for (const mode of ["adventure", "exploration"] as const) {
    const s = scene(mode);
    const events = new EventLog();
    const state = new StateEngine(s, events);
    const engine = new SessionEngine(state, new LLMAdapter({ primary: new MockProvider() }), events);
    await expect(engine.runTurn("no-director", "emma", "Rewrite the world", {}, { intent: "director" })).rejects.toThrow(/Fan Fiction/);
    expect(state.getSession().conversation).toEqual(s.conversation);
  }
});

it("rejects a direction before saving when persistent premises exceed context capacity", async () => {
  const s = scene("fanfiction");
  s.conversation = Array.from({ length: 20 }, (_, index) => ({ turn: index + 1, role: "player", intent: "director", content: "fictional premise ".repeat(110) }));
  const events = new EventLog();
  const state = new StateEngine(s, events);
  const engine = new SessionEngine(state, new LLMAdapter({ primary: new MockProvider() }), events);
  await expect(engine.runTurn("too-large", "emma", "A new premise.", {}, { intent: "director" })).rejects.toThrow(/hard ceiling/);
  expect(state.getSession().conversation).toHaveLength(20);
  expect(state.getSession().stateVersion).toBe(0);
});
