import { describe, it, expect } from "vitest";
import { LLMAdapter, AllProvidersFailedError } from "@llm/LLMAdapter";
import { MockProvider } from "@llm/providers/MockProvider";
import type { CompletionRequest, LLMProvider, StreamChunk } from "@llm/types";

const baseRequest: CompletionRequest = {
  messages: [{ role: "user", content: "hi" }]
};

async function collect(adapter: LLMAdapter, request: CompletionRequest = baseRequest) {
  const chunks = [];
  for await (const chunk of adapter.streamCompletion(request)) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("LLMAdapter — happy path", () => {
  it("streams all chunks from the primary provider", async () => {
    const primary = new MockProvider({ name: "primary", responseChunks: ["a", "b"] });
    const adapter = new LLMAdapter({ primary });

    const chunks = await collect(adapter);
    const text = chunks.filter((c) => c.type === "text_delta").map((c) => (c as { text: string }).text);

    expect(text).toEqual(["a", "b"]);
    expect(chunks.every((c) => c.provider === "primary")).toBe(true);
    expect(chunks.at(-1)).toMatchObject({ type: "done", finishReason: "stop" });
  });
});

describe("LLMAdapter — fallback before any output", () => {
  it("falls back to the next provider if the primary fails immediately", async () => {
    const primary = new MockProvider({ name: "primary", alwaysFails: true });
    const fallback = new MockProvider({ name: "fallback", responseChunks: ["ok"] });
    const adapter = new LLMAdapter({ primary, fallbacks: [fallback] });

    const chunks = await collect(adapter);
    expect(chunks.some((c) => c.provider === "fallback")).toBe(true);
    expect(chunks.some((c) => c.provider === "primary")).toBe(false);
  });

  it("throws AllProvidersFailedError when every provider fails before output", async () => {
    const primary = new MockProvider({ name: "primary", alwaysFails: true });
    const fallback = new MockProvider({ name: "fallback", alwaysFails: true });
    const adapter = new LLMAdapter({ primary, fallbacks: [fallback] });

    await expect(collect(adapter)).rejects.toThrow(AllProvidersFailedError);
  });
});

describe("LLMAdapter — no fallback after partial output", () => {
  it("surfaces an error chunk instead of switching providers mid-stream", async () => {
    // A provider that yields one real chunk, then throws.
    const flaky: LLMProvider = {
      name: "flaky",
      capabilities: { streaming: true, structuredOutput: false, cancellation: true },
      async *streamCompletion(): AsyncGenerator<StreamChunk> {
        yield { type: "text_delta", text: "partial " };
        throw new Error("connection dropped mid-stream");
      }
    };
    const fallback = new MockProvider({ name: "fallback", responseChunks: ["should not appear"] });
    const adapter = new LLMAdapter({ primary: flaky, fallbacks: [fallback] });

    const chunks = await collect(adapter);
    expect(chunks[0]).toMatchObject({ type: "text_delta", text: "partial ", provider: "flaky" });
    expect(chunks.at(-1)).toMatchObject({ type: "error", provider: "flaky" });
    expect(chunks.some((c) => c.provider === "fallback")).toBe(false);
  });
});

describe("LLMAdapter — cancellation", () => {
  it("stops streaming and reports cancelled when the signal is already aborted", async () => {
    const primary = new MockProvider({ name: "primary", responseChunks: ["a", "b", "c"] });
    const adapter = new LLMAdapter({ primary });
    const controller = new AbortController();
    controller.abort();

    const chunks = await collect(adapter, { ...baseRequest, signal: controller.signal });
    expect(chunks).toEqual([{ type: "done", finishReason: "cancelled", provider: "primary" }]);
  });

  it("stops mid-stream when the signal aborts partway through", async () => {
    const primary = new MockProvider({
      name: "primary",
      responseChunks: ["a", "b", "c", "d"],
      chunkDelayMs: 5
    });
    const adapter = new LLMAdapter({ primary });
    const controller = new AbortController();

    const chunks: unknown[] = [];
    let i = 0;
    for await (const chunk of adapter.streamCompletion({ ...baseRequest, signal: controller.signal })) {
      chunks.push(chunk);
      i++;
      if (i === 2) controller.abort();
    }

    expect(chunks.length).toBeLessThan(5); // didn't run all 4 text chunks + done
    expect(chunks.at(-1)).toMatchObject({ finishReason: "cancelled" });
  });
});

describe("LLMAdapter — capability detection", () => {
  it("filters providers by required capabilities", () => {
    const noStructured = new MockProvider({
      name: "basic",
      capabilities: { structuredOutput: false }
    });
    const full = new MockProvider({ name: "full" });
    const adapter = new LLMAdapter({ primary: noStructured, fallbacks: [full] });

    const capable = adapter.capableProviders({ structuredOutput: true });
    expect(capable.map((p) => p.name)).toEqual(["full"]);
  });

  it("returns all providers when no capability is required", () => {
    const a = new MockProvider({ name: "a" });
    const b = new MockProvider({ name: "b" });
    const adapter = new LLMAdapter({ primary: a, fallbacks: [b] });

    expect(adapter.capableProviders({}).map((p) => p.name)).toEqual(["a", "b"]);
  });
});
