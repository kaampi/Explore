import type { CompletionRequest, LLMProvider, ProviderCapabilities, StreamChunk } from "../types";

/**
 * In-memory provider implementation used by tests (and useful for local
 * development without a real API key/network access). Not shipped as a
 * production provider — real providers (Anthropic, OpenAI, a local
 * model runtime, etc.) live alongside this file in `llm/providers/`
 * following the same LLMProvider interface.
 */

export interface MockProviderConfig {
  name?: string;
  capabilities?: Partial<ProviderCapabilities>;
  /** Text chunks to stream back, in order. */
  responseChunks?: string[];
  /** Simulated per-chunk delay in ms; 0 for instant (default, good for tests). */
  chunkDelayMs?: number;
  /** If true, every call throws immediately instead of streaming — used to test fallback. */
  alwaysFails?: boolean;
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockProvider implements LLMProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  private readonly responseChunks: string[];
  private readonly chunkDelayMs: number;
  private readonly alwaysFails: boolean;

  constructor(config: MockProviderConfig = {}) {
    this.name = config.name ?? "mock-provider";
    this.capabilities = {
      streaming: true,
      structuredOutput: true,
      cancellation: true,
      ...config.capabilities
    };
    this.responseChunks = config.responseChunks ?? ["Hello", ", ", "world", "!"];
    this.chunkDelayMs = config.chunkDelayMs ?? 0;
    this.alwaysFails = config.alwaysFails ?? false;
  }

  async *streamCompletion(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    if (this.alwaysFails) {
      throw new Error(`${this.name} is configured to always fail.`);
    }

    for (const chunk of this.responseChunks) {
      if (request.signal?.aborted) {
        yield { type: "done", finishReason: "cancelled" };
        return;
      }
      await delay(this.chunkDelayMs);
      if (request.signal?.aborted) {
        yield { type: "done", finishReason: "cancelled" };
        return;
      }
      yield { type: "text_delta", text: chunk };
    }

    yield { type: "done", finishReason: "stop" };
  }
}
