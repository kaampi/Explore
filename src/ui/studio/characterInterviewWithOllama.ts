import { conductCharacterInterview, type ConductedInterview } from "@library/characterInterview";
import {
  completeOllamaChat,
  DEFAULT_OLLAMA_MODEL,
  listOllamaModels,
  pickListedOllamaModel
} from "@llm/providers/OllamaProvider";

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/** Ask the local model to shape the card. A miss falls back inside conductCharacterInterview. */
export async function conductCharacterInterviewWithOllama(
  input: { messages: readonly string[]; seed: number },
  signal?: AbortSignal
): Promise<ConductedInterview> {
  let model = DEFAULT_OLLAMA_MODEL;
  try {
    const names = await listOllamaModels({ ...(signal ? { signal } : {}) });
    model = pickListedOllamaModel(model, names) ?? model;
  } catch (err) {
    if (isAbort(err)) throw err;
  }
  return conductCharacterInterview(input, (messages) =>
    completeOllamaChat({
      model,
      messages,
      temperature: 0.4,
      maxTokens: 700,
      ...(signal ? { signal } : {})
    })
  );
}
