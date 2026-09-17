import {
  CompactCardError,
  compactCharacterMessages,
  parseCompactCardJson,
  type CompactCardFields
} from "@library/compactCharacterCard";
import {
  completeOllamaChat,
  DEFAULT_OLLAMA_MODEL,
  listOllamaModels,
  OllamaRequestError,
  pickListedOllamaModel
} from "@llm/providers/OllamaProvider";

export function compactFailureMessage(err: unknown): string {
  if (err instanceof CompactCardError) return err.message;
  if (err instanceof OllamaRequestError) {
    return "Ollama refused the request. Is the model pulled, and is OLLAMA_ORIGINS set for this page?";
  }
  if (err instanceof Error && /failed to fetch|networkerror|load failed/i.test(err.message)) {
    return "Could not reach Ollama. Start it, and allow this origin (OLLAMA_ORIGINS).";
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return "Compact failed.";
}

export async function compactCharacterCardWithOllama(
  input: {
    name: string;
    appearance: string;
    mood: string;
    personality: string;
    rawText?: string;
  },
  signal?: AbortSignal
): Promise<CompactCardFields> {
  let model = DEFAULT_OLLAMA_MODEL;
  try {
    const names = await listOllamaModels({ ...(signal ? { signal } : {}) });
    model = pickListedOllamaModel(model, names) ?? model;
  } catch {
    // Use the default name; completeOllamaChat will fail if Ollama is down.
  }
  const content = await completeOllamaChat({
    model,
    messages: compactCharacterMessages(input),
    temperature: 0.2,
    maxTokens: 500,
    ...(signal ? { signal } : {})
  });
  return parseCompactCardJson(content);
}
