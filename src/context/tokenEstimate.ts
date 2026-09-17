/**
 * Token estimation for Context Budget Manager (§11).
 *
 * This is a heuristic (~4 characters per token for English/Swedish-ish
 * text), NOT a real tokenizer. Real tokenizers are provider- and
 * model-specific (tiktoken for OpenAI, SentencePiece variants elsewhere)
 * and pull in heavy WASM dependencies. For budget *planning* purposes —
 * deciding what to drop before a token-metered API call — an
 * approximation is sufficient as long as it's conservative.
 *
 * If precise counts become important (e.g. billing reconciliation),
 * swap this for the provider's actual tokenizer at the LLMAdapter layer;
 * ContextBudgetManager's interface (a plain `estimateTokens(text) => number`
 * function) doesn't need to change.
 */
const CHARS_PER_TOKEN_ESTIMATE = 4;

export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  // Round up: better to overestimate and trim a bit early than to
  // silently exceed a hard ceiling because of rounding down.
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}
