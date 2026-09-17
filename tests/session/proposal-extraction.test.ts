import { describe, it, expect, vi } from "vitest";
import {
  extractJsonCandidate,
  parseProposals,
  createLLMProposalExtractor,
  buildExtractionMessages
} from "@session/ProposalExtraction";
import { LLMAdapter } from "@llm/LLMAdapter";
import type { CompletionRequest, LLMProvider, StreamChunk } from "@llm/types";

describe("extractJsonCandidate", () => {
  it("extracts JSON from a markdown-fenced block", () => {
    const text = 'Sure, here you go:\n```json\n[{"path":"a","value":"b"}]\n```\nHope that helps!';
    expect(extractJsonCandidate(text)).toBe('[{"path":"a","value":"b"}]');
  });

  it("extracts a bare array literal surrounded by prose", () => {
    const text = 'The proposals are [{"path":"a","value":"b"}] based on the dialogue.';
    expect(extractJsonCandidate(text)).toBe('[{"path":"a","value":"b"}]');
  });

  it("falls back to the trimmed raw text when nothing else matches", () => {
    expect(extractJsonCandidate("  []  ")).toBe("[]");
  });

  it("returns undefined for an empty response", () => {
    expect(extractJsonCandidate("   ")).toBeUndefined();
  });
});

describe("parseProposals", () => {
  it("parses a valid proposal array, tagging source as ai_approved_state_mutation", () => {
    const result = parseProposals('[{"path":"characters.emma.mood","value":"happy"}]');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.proposals).toEqual([
        { path: "characters.emma.mood", value: "happy", source: "ai_approved_state_mutation" }
      ]);
    }
  });

  it("accepts an empty array (no proposed changes)", () => {
    const result = parseProposals("[]");
    expect(result.success).toBe(true);
    if (result.success) expect(result.proposals).toEqual([]);
  });

  it("accepts numeric values (e.g. energy)", () => {
    const result = parseProposals('[{"path":"characters.emma.energy","value":80}]');
    expect(result.success).toBe(true);
  });

  it("fails on malformed JSON", () => {
    const result = parseProposals("{not valid json");
    expect(result.success).toBe(false);
  });

  it("fails when items don't match the expected shape", () => {
    const result = parseProposals('[{"wrong_field": "x"}]');
    expect(result.success).toBe(false);
  });
});

function providerReturning(texts: string[]): LLMProvider {
  let call = 0;
  return {
    name: "sequenced",
    capabilities: { streaming: true, structuredOutput: false, cancellation: true },
    async *streamCompletion(_request: CompletionRequest): AsyncGenerator<StreamChunk> {
      const text = texts[Math.min(call, texts.length - 1)] ?? "";
      call++;
      yield { type: "text_delta", text };
      yield { type: "done", finishReason: "stop" };
    }
  };
}

describe("buildExtractionMessages", () => {
  it("lists relationship meters as writable paths and includes current live values", () => {
    const messages = buildExtractionMessages("They spend the night together.", "emma", {
      mood: "reserved",
      trust: 20,
      familiarity: 10,
      tension: 5
    });
    const system = messages[0]?.content ?? "";
    expect(system).toContain("relationships.emma.trust");
    expect(system).toContain("relationships.emma.familiarity");
    expect(system).toContain("relationships.emma.tension");
    expect(system).toContain("trust=20");
    expect(system).toContain('mood="reserved"');
  });

  it("lists movable rule-set stats with their cap", () => {
    const messages = buildExtractionMessages("They kiss.", "emma", {
      stats: [
        { id: "arousal", label: "Arousal", value: 40, maxShift: 15, min: 0, max: 100 },
        { id: "boldness", label: "Boldness", value: 50, maxShift: 3, min: 0, max: 100 }
      ]
    });
    const system = messages[0]?.content ?? "";
    expect(system).toContain("characters.emma.stats.arousal");
    expect(system).toContain("at most ±15 from 40");
    expect(system).toContain("characters.emma.stats.boldness");
    expect(system).toContain("Arousal=40");
    expect(system).toContain("A kiss, touch, or sex this beat can raise a closeness meter");
  });

  it("lists clothing and holding as live paths", () => {
    const messages = buildExtractionMessages("She hangs her coat.", "emma", {
      clothing: "a winter coat",
      holding: "a lantern"
    });
    const system = messages[0]?.content ?? "";
    expect(system).toContain("characters.emma.clothing");
    expect(system).toContain("characters.emma.holding");
    expect(system).toContain("Looks is body, not clothes");
    expect(system).toContain("Honor live clothing and holding");
    expect(system).toContain("Nude has no dress pocket");
    expect(system).toContain("The public bar is dressed");
    expect(system).toContain('clothing="a winter coat"');
    expect(system).toContain('holding="a lantern"');
  });

  it("updates position and pose when she leaves the bar", () => {
    const messages = buildExtractionMessages(
      'Emma comes out from behind the bar. "Alright. My room."',
      "emma",
      { mood: "reserved", position: "behind the bar", pose: "polishing a glass" }
    );
    const system = messages[0]?.content ?? "";
    expect(system).toContain("characters.emma.position");
    expect(system).toContain("characters.emma.pose");
    expect(system).toContain('position="behind the bar"');
    expect(system).toContain('pose="polishing a glass"');
    expect(system).toContain("walks to a named room or comes out from behind the bar");
    expect(system).toContain("If they stop working, update pose");
  });

  it("lists named rooms as valid positions when the player walked in", () => {
    const messages = buildExtractionMessages(
      'Emma holds you. "Stay."',
      "emma",
      {
        position: "behind the bar",
        playerPosition: "Emma's room",
        namedRooms: ["Emma's room", "guest room"]
      },
      "I walk into Emma's room"
    );
    const system = messages[0]?.content ?? "";
    expect(system).toContain("Named rooms in canon");
    expect(system).toContain("Emma's room");
    expect(system).toContain("Do not propose player.position");
    expect(system).toContain("Do not replace a named room with the scene title");
    expect(system).toContain("not in the party");
    expect(system).toContain("Do not set characters.emma.position to the player's room");
  });

  it("keeps party members with the player in named rooms", () => {
    const messages = buildExtractionMessages(
      'Emma holds you. "Stay."',
      "emma",
      {
        position: "behind the bar",
        playerPosition: "Emma's room",
        namedRooms: ["Emma's room", "guest room"],
        inParty: true
      },
      "I walk into Emma's room"
    );
    const system = messages[0]?.content ?? "";
    expect(system).toContain("emma is in the party");
    expect(system).toContain("set characters.emma.position to the same room as the player");
  });

  it("treats the player's line as a fact and can write player.status", () => {
    const messages = buildExtractionMessages(
      "Sleep well, she murmurs.",
      "emma",
      { playerPosition: "at the bar", playerStatus: "awake" },
      "*I fall asleep*"
    );
    const system = messages[0]?.content ?? "";
    expect(system).toContain("player.status");
    expect(system).toContain("Do not propose player.position");
    expect(system).toContain('set player.status to "asleep"');
    expect(system).toContain("wishes, not facts");
    expect(system).toContain("Do not invent rooms");
    expect(system).toContain("Blankets in this room are not a new place");
    expect(system).toContain("party.offer");
    expect(system).toContain("Do not propose partyIds");
    expect(system).not.toContain("never a spare room, hotel, or hall unless");
    expect(messages[1]?.content).toContain("*I fall asleep*");
    expect(messages[1]?.content).toContain("Sleep well");
  });
});

describe("createLLMProposalExtractor — happy path", () => {
  it("returns parsed proposals from a clean JSON response", async () => {
    const adapter = new LLMAdapter({
      primary: providerReturning(['[{"path":"characters.emma.mood","value":"curious"}]'])
    });
    const extractor = createLLMProposalExtractor(adapter, { sleepImpl: async () => {} });

    const proposals = await extractor("Emma leans in, intrigued.", "emma");
    expect(proposals).toEqual([
      { path: "characters.emma.mood", value: "curious", source: "ai_approved_state_mutation" }
    ]);
  });
});

describe("createLLMProposalExtractor — tolerant retry", () => {
  it("retries once on malformed output, then succeeds", async () => {
    const adapter = new LLMAdapter({
      primary: providerReturning([
        "Sure! I think the mood changes.", // malformed: no JSON at all -> parse failure
        '[{"path":"characters.emma.mood","value":"happy"}]' // valid on 2nd attempt
      ])
    });
    const onFailure = vi.fn();
    const extractor = createLLMProposalExtractor(adapter, {
      maxAttempts: 3,
      sleepImpl: async () => {},
      onFailure
    });

    const proposals = await extractor("some dialogue", "emma");

    expect(proposals).toEqual([
      { path: "characters.emma.mood", value: "happy", source: "ai_approved_state_mutation" }
    ]);
    expect(onFailure).not.toHaveBeenCalled(); // eventual success, no failure reported
  });
});

describe("createLLMProposalExtractor — tolerant degradation (critical guarantee)", () => {
  it("returns an empty array, never throws, when every attempt fails", async () => {
    const adapter = new LLMAdapter({
      primary: providerReturning(["not json at all", "still not json", "nope"])
    });
    const onFailure = vi.fn();
    const extractor = createLLMProposalExtractor(adapter, {
      maxAttempts: 3,
      sleepImpl: async () => {},
      onFailure
    });

    const proposals = await extractor("some dialogue", "emma");

    expect(proposals).toEqual([]);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it("degrades gracefully even when the provider itself errors on every attempt", async () => {
    const failingProvider: LLMProvider = {
      name: "always-fails",
      capabilities: { streaming: true, structuredOutput: false, cancellation: true },
      async *streamCompletion(): AsyncGenerator<StreamChunk> {
        throw new Error("connection refused");
      }
    };
    const adapter = new LLMAdapter({ primary: failingProvider });
    const extractor = createLLMProposalExtractor(adapter, { maxAttempts: 2, sleepImpl: async () => {} });

    await expect(extractor("some dialogue", "emma")).resolves.toEqual([]);
  });
});
