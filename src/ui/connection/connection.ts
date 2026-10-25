import {
  listOllamaModels,
  pickListedOllamaModel,
} from "@llm/providers/OllamaProvider";

export type Discovery = {
  state: "checking" | "available" | "unavailable";
  models: string[];
  unsupportedModels?: string[];
};
export type Readiness =
  | "checking"
  | "unavailable"
  | "empty"
  | "missing-model"
  | "ready";
export function installedModelName(
  model: string,
  models: string[],
): string | undefined {
  if (models.includes(model)) return model;
  return models.includes(`${model}:latest`) ? `${model}:latest` : undefined;
}
export function modelReadiness(discovery: Discovery, model: string): Readiness {
  if (discovery.state !== "available") return discovery.state;
  if (!discovery.models.length) return "empty";
  return installedModelName(model, discovery.models)
    ? "ready"
    : "missing-model";
}
export function initialModel(preferred: string, models: string[]): string {
  // A saved preference belongs to the user. Only the first setup gets an automatic choice.
  return preferred || pickListedOllamaModel("", models) || "";
}
export async function discoverOllama(
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<Discovery> {
  try {
    const timeout = AbortSignal.timeout(2500);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;
    const models = await listOllamaModels({
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      signal,
    });
    const fetcher = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const supported = new Set<string>();
    const unsupportedModels: string[] = [];
    // /api/show reports capabilities without generating prose or loading a conversation.
    // Older Ollama versions may omit this metadata; keep their installed models available.
    for (let offset = 0; offset < models.length; offset += 4) {
      await Promise.all(
        models.slice(offset, offset + 4).map(async (model) => {
          try {
            const response = await fetcher("http://localhost:11434/api/show", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ model }),
              signal,
            });
            const payload: unknown = response.ok ? await response.json() : null;
            const capabilities =
              payload &&
              typeof payload === "object" &&
              "capabilities" in payload
                ? payload.capabilities
                : undefined;
            if (
              Array.isArray(capabilities) &&
              !capabilities.includes("completion")
            )
              unsupportedModels.push(model);
            else supported.add(model);
          } catch {
            supported.add(model);
          }
        }),
      );
    }
    return {
      state: "available",
      models: models.filter((model) => supported.has(model)),
      unsupportedModels,
    };
  } catch {
    return { state: "unavailable", models: [] };
  }
}
