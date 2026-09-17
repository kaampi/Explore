import type { CompletionRequest, LLMProvider, ProviderCapabilities, StreamChunk } from "../types";

/**
 * Ollama provider — talks to a local Ollama server's `/api/chat` endpoint
 * (https://github.com/ollama/ollama/blob/main/docs/api.md#chat-request-streaming).
 * Ollama streams newline-delimited JSON objects, one per token/chunk,
 * ending with a final object where `done: true`.
 *
 * IMPORTANT — CORS: if this runs from a browser (Vite dev server, the
 * eventual UI), the origin (e.g. http://localhost:5173) is cross-origin
 * from Ollama's default bind (http://localhost:11434). Ollama will
 * reject the request unless the server is started with an allowed
 * origin, e.g.:
 *   OLLAMA_ORIGINS=http://localhost:5173 ollama serve
 * This is a real gotcha, not an edge case — expect a fetch/network
 * error on the very first request until this is set.
 */

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

/** Prefill in Adventure / fallback when a session has no model name. */
export const DEFAULT_OLLAMA_MODEL = "stheno-custom:latest";

export class OllamaRequestError extends Error {
  constructor(
    public readonly status: number,
    statusText: string
  ) {
    super(`Ollama request failed: ${status} ${statusText}`);
    this.name = "OllamaRequestError";
  }
}

function boundFetch(fetchImpl?: typeof fetch): typeof fetch {
  // Browsers treat `fetch` as a Window method, so a detached
  // `const f = fetch; f(...)` throws "Illegal invocation".
  return fetchImpl ?? globalThis.fetch.bind(globalThis);
}

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl ?? DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, "");
}

export interface ListOllamaModelsOptions {
  /** Default: http://localhost:11434 */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/**
 * GET /api/tags — the names Ollama currently has pulled, as they should
 * be sent to /api/chat (usually `name:tag`, e.g. `llama3.1:latest`).
 */
export async function listOllamaModels(options: ListOllamaModelsOptions = {}): Promise<string[]> {
  const fetchImpl = boundFetch(options.fetchImpl);
  const response = await fetchImpl(`${normalizeBaseUrl(options.baseUrl)}/api/tags`, {
    method: "GET",
    signal: options.signal ?? null
  });

  if (!response.ok) {
    throw new OllamaRequestError(response.status, response.statusText);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Ollama /api/tags returned non-JSON.");
  }

  const models = (payload as { models?: unknown })?.models;
  if (!Array.isArray(models)) {
    throw new Error("Ollama /api/tags returned an unexpected payload.");
  }

  const names = models
    .map((entry) => (entry && typeof entry === "object" && "name" in entry ? (entry as { name: unknown }).name : undefined))
    .filter((name): name is string => typeof name === "string" && name.length > 0);

  return [...new Set(names)].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

/**
 * Prefer an exact match, then a tagged variant of the preferred name
 * (`llama3.1` → `llama3.1:latest`). If nothing matches, the first
 * installed model — so the UI doesn't keep a default that 404s.
 */
export function pickListedOllamaModel(preferred: string, names: string[]): string | undefined {
  if (names.length === 0) return undefined;
  if (names.includes(preferred)) return preferred;
  const tagged = names.find((name) => name === `${preferred}:latest` || name.startsWith(`${preferred}:`));
  return tagged ?? names[0];
}

export interface OllamaProviderConfig {
  /** Model name as known to `ollama list`, e.g. "llama3.1" or "qwen2.5:14b". */
  model: string;
  /** Default: http://localhost:11434 */
  baseUrl?: string;
  /** Display name used for provider attribution in adapter chunks/logs. */
  name?: string;
  /**
   * Whether to treat this model as capable of reliable structured output
   * via Ollama's `format: "json"` mode. Off by default — JSON mode
   * constrains output to be valid JSON, but doesn't guarantee it matches
   * a specific schema, and support quality varies a lot by model. Turn
   * this on per-model only after you've verified it holds up for your
   * proposal-extraction use case (Pass 2, §33.2).
   */
  structuredOutputSupported?: boolean;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

interface OllamaChatLine {
  message?: { role: string; content: string };
  done?: boolean;
  done_reason?: string;
  eval_count?: number;
  error?: string;
}

export class OllamaProvider implements LLMProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OllamaProviderConfig) {
    this.model = config.model;
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.name = config.name ?? `ollama:${config.model}`;
    this.fetchImpl = boundFetch(config.fetchImpl);
    this.capabilities = {
      streaming: true,
      cancellation: true,
      structuredOutput: config.structuredOutputSupported ?? false
    };
  }

  async *streamCompletion(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: request.signal ?? null,
      body: JSON.stringify({
        model: this.model,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        options: {
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(request.seed !== null && request.seed !== undefined ? { seed: request.seed } : {}),
          ...(request.maxTokens !== undefined ? { num_predict: request.maxTokens } : {})
        }
      })
    });

    if (!response.ok) {
      throw new OllamaRequestError(response.status, response.statusText);
    }
    if (!response.body) {
      throw new Error("Ollama response had no readable body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const result = this.parseLine(line, request.maxTokens);
          if (result) {
            yield result;
            if (result.type === "done" || result.type === "error") return;
          }
        }
      }

      // Stream closed; flush any trailing partial line.
      if (buffer.trim()) {
        const result = this.parseLine(buffer, request.maxTokens);
        if (result) yield result;
      }
    } finally {
      reader.releaseLock();
    }
  }

  private parseLine(line: string, maxTokens?: number): StreamChunk | undefined {
    const trimmed = line.trim();
    if (!trimmed) return undefined;

    let parsed: OllamaChatLine;
    try {
      parsed = JSON.parse(trimmed) as OllamaChatLine;
    } catch {
      // Malformed line from the stream — surface as an error rather
      // than silently dropping content the caller might be relying on.
      return { type: "error", message: `Unparseable line from Ollama stream: ${trimmed}` };
    }

    if (parsed.error) {
      return { type: "error", message: parsed.error };
    }
    if (parsed.done) {
      const hitWall =
        parsed.done_reason === "length" ||
        (maxTokens !== undefined &&
          typeof parsed.eval_count === "number" &&
          parsed.eval_count >= maxTokens);
      return { type: "done", finishReason: hitWall ? "length" : "stop" };
    }
    if (parsed.message?.content) {
      return { type: "text_delta", text: parsed.message.content };
    }
    return undefined;
  }
}

export interface CompleteOllamaChatOptions {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** One-shot /api/chat (stream off). For studio tools, not Pass 1. */
export async function completeOllamaChat(options: CompleteOllamaChatOptions): Promise<string> {
  const fetchImpl = boundFetch(options.fetchImpl);
  const response = await fetchImpl(`${normalizeBaseUrl(options.baseUrl)}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options.signal ?? null,
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      stream: false,
      options: {
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options.maxTokens !== undefined ? { num_predict: options.maxTokens } : {})
      }
    })
  });

  if (!response.ok) {
    throw new OllamaRequestError(response.status, response.statusText);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Ollama returned non-JSON.");
  }

  const content = (payload as { message?: { content?: unknown } })?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Ollama returned an empty reply.");
  }
  return content;
}
