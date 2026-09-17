/**
 * Provider-Agnostic LLM Adapter — Master Spec §32-33.
 * Shared contract every provider implementation (real or mock) must
 * satisfy. LLMAdapter depends only on this interface, never on a
 * specific vendor SDK.
 */

export interface ProviderCapabilities {
  streaming: boolean;
  structuredOutput: boolean;
  /** Whether the provider honors an AbortSignal mid-request. */
  cancellation: boolean;
}

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  /** Reproducibility hook (§44) — not all providers support this. */
  seed?: number | null;
  /** Max tokens to generate. Pass 1 uses this; Pass 2 should omit it. */
  maxTokens?: number;
  signal?: AbortSignal;
}

export type StreamChunk =
  | { type: "text_delta"; text: string }
  | { type: "done"; finishReason: "stop" | "length" | "cancelled" }
  | { type: "error"; message: string };

export interface LLMProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  /**
   * Streams a completion. Implementations must respect `request.signal`:
   * on abort, stop yielding chunks and either yield a final
   * `{type: "done", finishReason: "cancelled"}` or throw a DOMException
   * named "AbortError" — LLMAdapter handles either.
   */
  streamCompletion(request: CompletionRequest): AsyncGenerator<StreamChunk>;
}

export class ProviderError extends Error {
  constructor(
    public readonly providerName: string,
    message: string,
    public override readonly cause?: unknown
  ) {
    super(`[${providerName}] ${message}`);
    this.name = "ProviderError";
  }
}
