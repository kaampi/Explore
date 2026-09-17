import type { CompletionRequest, LLMProvider, ProviderCapabilities, StreamChunk } from "./types";
import { ProviderError } from "./types";

/**
 * LLM Adapter — Master Spec §32-33.
 * Provider-agnostic streaming with fallback and capability detection.
 *
 * Fallback policy: if a provider fails *before yielding any chunk*,
 * the adapter tries the next provider in the list — the caller never
 * sees the failure. If a provider fails *mid-stream*, after the caller
 * has already received partial output, the adapter does NOT fall back:
 * splicing a second provider's continuation onto a first provider's
 * partial output would produce an incoherent response. Instead it
 * surfaces an error chunk and stops. (Retrying/regenerating a failed
 * turn from scratch is a Session Engine concern, §48 — Phase 3.)
 */

export interface LLMAdapterConfig {
  primary: LLMProvider;
  fallbacks?: LLMProvider[];
}

export type AdapterStreamChunk = StreamChunk & { provider: string };

export class AllProvidersFailedError extends Error {
  constructor(public readonly attempts: ProviderError[]) {
    super(
      `All ${attempts.length} provider(s) failed before producing any output: ${attempts
        .map((e) => e.message)
        .join("; ")}`
    );
    this.name = "AllProvidersFailedError";
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export class LLMAdapter {
  private readonly providers: LLMProvider[];

  constructor(config: LLMAdapterConfig) {
    this.providers = [config.primary, ...(config.fallbacks ?? [])];
  }

  /** Providers (in fallback order) that satisfy every capability requested (only truthy requirements are checked). */
  capableProviders(required: Partial<ProviderCapabilities>): LLMProvider[] {
    const requiredKeys = (Object.keys(required) as (keyof ProviderCapabilities)[]).filter(
      (key) => required[key]
    );
    return this.providers.filter((p) => requiredKeys.every((key) => p.capabilities[key]));
  }

  async *streamCompletion(request: CompletionRequest): AsyncGenerator<AdapterStreamChunk> {
    const attemptErrors: ProviderError[] = [];

    for (const provider of this.providers) {
      if (request.signal?.aborted) {
        yield { type: "done", finishReason: "cancelled", provider: provider.name };
        return;
      }

      let yieldedAny = false;
      try {
        for await (const chunk of provider.streamCompletion(request)) {
          yieldedAny = true;
          yield { ...chunk, provider: provider.name };
          if (chunk.type === "done" || chunk.type === "error") {
            return;
          }
        }
        // Generator completed without an explicit terminal chunk —
        // treat as a clean, silent stop.
        return;
      } catch (err) {
        if (isAbortError(err)) {
          yield { type: "done", finishReason: "cancelled", provider: provider.name };
          return;
        }

        const underlyingMessage = err instanceof Error ? err.message : String(err);
        const wrapped = new ProviderError(provider.name, `streamCompletion failed: ${underlyingMessage}`, err);
        attemptErrors.push(wrapped);

        if (yieldedAny) {
          // Partial output already reached the caller; falling back now
          // would produce an incoherent spliced response. Surface the
          // failure and stop instead of trying the next provider.
          yield { type: "error", message: wrapped.message, provider: provider.name };
          return;
        }
        // No output yielded yet — safe to try the next provider.
        continue;
      }
    }

    throw new AllProvidersFailedError(attemptErrors);
  }
}
