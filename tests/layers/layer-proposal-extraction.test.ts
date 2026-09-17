import { describe, it, expect, vi } from "vitest";
import { parseLayerProposal, createLLMLayerProposalExtractor } from "@layers/LayerProposalExtraction";
import { LLMAdapter } from "@llm/LLMAdapter";
import type { CompletionRequest, LLMProvider, StreamChunk } from "@llm/types";

describe("parseLayerProposal", () => {
  it("parses a well-formed proposal", () => {
    const result = parseLayerProposal(
      '{"propose": true, "type": "relationship", "content": "Emma trusts the player now."}'
    );
    expect(result).toEqual({ type: "relationship", content: "Emma trusts the player now." });
  });

  it("returns null for an explicit no-proposal response", () => {
    expect(parseLayerProposal('{"propose": false}')).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseLayerProposal("not json at all")).toBeNull();
  });

  it("returns null when the shape doesn't match either schema variant", () => {
    expect(parseLayerProposal('{"random": "field"}')).toBeNull();
  });

  it("extracts from a markdown-fenced response", () => {
    const result = parseLayerProposal(
      '```json\n{"propose": true, "type": "core", "content": "Dry-witted and slow to trust."}\n```'
    );
    expect(result).toEqual({ type: "core", content: "Dry-witted and slow to trust." });
  });
});

function providerReturning(text: string): LLMProvider {
  return {
    name: "layer-proposal-stub",
    capabilities: { streaming: true, structuredOutput: false, cancellation: true },
    async *streamCompletion(_req: CompletionRequest): AsyncGenerator<StreamChunk> {
      yield { type: "text_delta", text };
      yield { type: "done", finishReason: "stop" };
    }
  };
}

describe("createLLMLayerProposalExtractor", () => {
  it("returns a parsed proposal on success", async () => {
    const adapter = new LLMAdapter({
      primary: providerReturning('{"propose": true, "type": "environment", "content": "It always rains here."}')
    });
    const extractor = createLLMLayerProposalExtractor(adapter, { sleepImpl: async () => {} });

    const proposal = await extractor("It's raining again tonight.", "emma");
    expect(proposal).toEqual({ type: "environment", content: "It always rains here." });
  });

  it("coerces a personality note tagged environment into core", async () => {
    const adapter = new LLMAdapter({
      primary: providerReturning(
        '{"propose": true, "type": "environment", "content": "Emma maintains a reserved demeanor in public."}'
      )
    });
    const extractor = createLLMLayerProposalExtractor(adapter, { sleepImpl: async () => {} });

    const proposal = await extractor("She barely looks up.", "emma");
    expect(proposal).toEqual({
      type: "core",
      content: "Emma maintains a reserved demeanor in public."
    });
  });

  it("returns null for an explicit no-proposal response", async () => {
    const adapter = new LLMAdapter({ primary: providerReturning('{"propose": false}') });
    const extractor = createLLMLayerProposalExtractor(adapter, { sleepImpl: async () => {} });

    const proposal = await extractor("Just ordinary small talk.", "emma");
    expect(proposal).toBeNull();
  });

  it("degrades to null, never throwing, when the provider fails entirely", async () => {
    const failing: LLMProvider = {
      name: "always-fails",
      capabilities: { streaming: true, structuredOutput: false, cancellation: true },
      async *streamCompletion(): AsyncGenerator<StreamChunk> {
        throw new Error("connection refused");
      }
    };
    const adapter = new LLMAdapter({ primary: failing });
    const onFailure = vi.fn();
    const extractor = createLLMLayerProposalExtractor(adapter, {
      maxAttempts: 2,
      sleepImpl: async () => {},
      onFailure
    });

    const proposal = await extractor("Some dialogue.", "emma");
    expect(proposal).toBeNull();
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it("treats a malformed (but successfully fetched) response as no proposal, not a retry-worthy failure", async () => {
    const adapter = new LLMAdapter({ primary: providerReturning("I don't think anything stands out here.") });
    const extractor = createLLMLayerProposalExtractor(adapter, { sleepImpl: async () => {} });

    const proposal = await extractor("Some dialogue.", "emma");
    expect(proposal).toBeNull();
  });
});
