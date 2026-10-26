import type { CompletionRequest, LLMProvider, ProviderCapabilities, StreamChunk } from "../types";

export const DEFAULT_STRATA_URL = "http://127.0.0.1:8080/v1";

export async function listOpenAIModels(baseUrl: string, signal?: AbortSignal): Promise<string[]> {
  const response = await fetch(baseUrl.replace(/\/$/, "") + "/models", { signal });
  if (!response.ok) throw new Error("Model discovery failed: HTTP " + response.status);
  const data = await response.json() as { data?: Array<{ id?: string }> };
  return (data.data ?? []).map((item) => item.id).filter((id): id is string => Boolean(id));
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities = { streaming: true, cancellation: true, structuredOutput: false };
  constructor(private readonly config: { model: string; baseUrl: string; name?: string }) {
    this.name = config.name ?? "openai-compatible:" + config.model;
  }
  async *streamCompletion(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    const response = await fetch(this.config.baseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: request.signal,
      body: JSON.stringify({
        model: this.config.model,
        messages: request.messages,
        stream: true,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
        ...(request.seed != null ? { seed: request.seed } : {})
      })
    });
    if (!response.ok) throw new Error("AI request failed: HTTP " + response.status + " " + (await response.text()).slice(0, 250));
    if (!response.body) throw new Error("AI server returned no stream.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;
    try {
      while (!finished) {
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true }).replace(/\r\n/g, "\n");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") { finished = true; break; }
          if (!data) continue;
          const event = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>; error?: { message?: string } };
          if (event.error) throw new Error(event.error.message ?? "AI stream error");
          const choice = event.choices?.[0];
          if (choice?.delta?.content) yield { type: "text_delta", text: choice.delta.content };
          if (choice?.finish_reason) {
            yield { type: "done", finishReason: choice.finish_reason === "length" ? "length" : "stop" };
            return;
          }
        }
      }
      yield { type: "done", finishReason: "stop" };
    } finally { reader.releaseLock(); }
  }
}
