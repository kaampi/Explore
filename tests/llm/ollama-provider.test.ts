import { describe, it, expect, vi } from "vitest";
import {
  OllamaProvider,
  OllamaRequestError,
  completeOllamaChat,
  listOllamaModels,
  pickListedOllamaModel
} from "@llm/providers/OllamaProvider";
import type { CompletionRequest } from "@llm/types";

function ndjsonResponse(lines: string[], init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + "\n"));
      }
      controller.close();
    }
  });

  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    body
  } as Response;
}

const baseRequest: CompletionRequest = {
  messages: [{ role: "user", content: "Hej Emma" }]
};

async function collect(provider: OllamaProvider, request: CompletionRequest = baseRequest) {
  const chunks = [];
  for await (const chunk of provider.streamCompletion(request)) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("OllamaProvider — streaming", () => {
  it("parses NDJSON chunks into text_delta events, ending with done", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      ndjsonResponse([
        JSON.stringify({ message: { role: "assistant", content: "Hej" } }),
        JSON.stringify({ message: { role: "assistant", content: " Emma" } }),
        JSON.stringify({ done: true, done_reason: "stop" })
      ])
    );

    const provider = new OllamaProvider({ model: "llama3.1", fetchImpl });
    const chunks = await collect(provider);

    expect(chunks).toEqual([
      { type: "text_delta", text: "Hej" },
      { type: "text_delta", text: " Emma" },
      { type: "done", finishReason: "stop" }
    ]);
  });

  it("treats a full num_predict eval_count as a length stop", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      ndjsonResponse([
        JSON.stringify({ message: { role: "assistant", content: "Hej" } }),
        JSON.stringify({ done: true, done_reason: "stop", eval_count: 128 })
      ])
    );
    const provider = new OllamaProvider({ model: "llama3.1", fetchImpl });
    const chunks = await collect(provider, { ...baseRequest, maxTokens: 128 });
    expect(chunks.at(-1)).toEqual({ type: "done", finishReason: "length" });
  });

  it("sends model, messages, temperature and seed in the request body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ndjsonResponse([JSON.stringify({ done: true })]));
    const provider = new OllamaProvider({ model: "qwen2.5:14b", fetchImpl });

    await collect(provider, { ...baseRequest, temperature: 0.8, seed: 42 });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:11434/api/chat",
      expect.objectContaining({ method: "POST" })
    );
    const call = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.model).toBe("qwen2.5:14b");
    expect(body.messages).toEqual([{ role: "user", content: "Hej Emma" }]);
    expect(body.options).toEqual({ temperature: 0.8, seed: 42 });
    expect(body.stream).toBe(true);
  });

  it("sends maxTokens as Ollama num_predict", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ndjsonResponse([JSON.stringify({ done: true })]));
    const provider = new OllamaProvider({ model: "Stheno:latest", fetchImpl });

    await collect(provider, { ...baseRequest, maxTokens: 240 });

    const call = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.options).toEqual({ num_predict: 240 });
  });

  it("respects a custom baseUrl", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ndjsonResponse([JSON.stringify({ done: true })]));
    const provider = new OllamaProvider({
      model: "llama3.1",
      baseUrl: "http://192.168.1.50:11434/",
      fetchImpl
    });
    await collect(provider);
    expect(fetchImpl).toHaveBeenCalledWith("http://192.168.1.50:11434/api/chat", expect.anything());
  });

  it("surfaces an error line from Ollama as an error chunk and stops", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      ndjsonResponse([JSON.stringify({ error: "model 'llama3.1' not found, try pulling it first" })])
    );
    const provider = new OllamaProvider({ model: "llama3.1", fetchImpl });
    const chunks = await collect(provider);

    expect(chunks).toEqual([{ type: "error", message: "model 'llama3.1' not found, try pulling it first" }]);
  });

  it("throws OllamaRequestError on a non-OK HTTP response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      ndjsonResponse([], { ok: false, status: 404, statusText: "Not Found" })
    );
    const provider = new OllamaProvider({ model: "llama3.1", fetchImpl });

    await expect(collect(provider)).rejects.toThrow(OllamaRequestError);
  });

  it("propagates an AbortError from fetch without swallowing it", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    const fetchImpl = vi.fn().mockRejectedValue(abortError);
    const provider = new OllamaProvider({ model: "llama3.1", fetchImpl });

    await expect(collect(provider)).rejects.toThrow(abortError);
  });

  it("binds the default fetch so browsers do not throw Illegal invocation", async () => {
    const originalFetch = globalThis.fetch;
    function windowLikeFetch(this: unknown, _input: RequestInfo | URL, _init?: RequestInit) {
      if (this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return Promise.resolve(ndjsonResponse([JSON.stringify({ done: true })]));
    }
    globalThis.fetch = windowLikeFetch as typeof fetch;

    try {
      const provider = new OllamaProvider({ model: "llama3.1" });
      await expect(collect(provider)).resolves.toEqual([{ type: "done", finishReason: "stop" }]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("defaults structuredOutput capability to false unless explicitly enabled", () => {
    const conservative = new OllamaProvider({ model: "llama3.1", fetchImpl: vi.fn() });
    const enabled = new OllamaProvider({
      model: "llama3.1",
      structuredOutputSupported: true,
      fetchImpl: vi.fn()
    });

    expect(conservative.capabilities.structuredOutput).toBe(false);
    expect(enabled.capabilities.structuredOutput).toBe(true);
  });
});

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: async () => body
  } as Response;
}

describe("listOllamaModels", () => {
  it("returns sorted unique names from GET /api/tags", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        models: [
          { name: "llama3.1:latest" },
          { name: "Stheno:latest" },
          { name: "llama3.1:latest" },
          { size: 1 },
          { name: "" }
        ]
      })
    );

    await expect(listOllamaModels({ fetchImpl })).resolves.toEqual(["llama3.1:latest", "Stheno:latest"]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:11434/api/tags",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("respects a custom baseUrl", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ models: [{ name: "local" }] }));
    await listOllamaModels({ fetchImpl, baseUrl: "http://192.168.1.50:11434/" });
    expect(fetchImpl).toHaveBeenCalledWith("http://192.168.1.50:11434/api/tags", expect.anything());
  });

  it("throws OllamaRequestError on a non-OK HTTP response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500, statusText: "Error" }));
    await expect(listOllamaModels({ fetchImpl })).rejects.toThrow(OllamaRequestError);
  });

  it("throws when the payload is not a models array", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }));
    await expect(listOllamaModels({ fetchImpl })).rejects.toThrow(/unexpected payload/);
  });
});

describe("pickListedOllamaModel", () => {
  it("prefers an exact match", () => {
    expect(pickListedOllamaModel("Stheno:latest", ["llama3.1:latest", "Stheno:latest"])).toBe("Stheno:latest");
  });

  it("maps an untagged preferred name to a tagged variant", () => {
    expect(pickListedOllamaModel("llama3.1", ["Stheno:latest", "llama3.1:latest"])).toBe("llama3.1:latest");
  });

  it("falls back to the first listed model when nothing matches", () => {
    expect(pickListedOllamaModel("missing", ["Stheno:latest", "qwen2.5:7b"])).toBe("Stheno:latest");
  });

  it("returns undefined for an empty list", () => {
    expect(pickListedOllamaModel("llama3.1", [])).toBeUndefined();
  });
});

describe("completeOllamaChat", () => {
  it("posts stream:false and returns message.content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ message: { role: "assistant", content: '{"appearance":"a"}' } })
    );
    await expect(
      completeOllamaChat({
        model: "stheno-custom:latest",
        messages: [{ role: "user", content: "hi" }],
        fetchImpl,
        maxTokens: 500
      })
    ).resolves.toBe('{"appearance":"a"}');
    const call = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.stream).toBe(false);
    expect(body.options.num_predict).toBe(500);
  });
});
