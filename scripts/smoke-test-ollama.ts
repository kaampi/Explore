/**
 * Manual smoke test against a REAL local Ollama server.
 * Not part of the automated suite (needs a running `ollama serve` +
 * a pulled model) — run it directly when you want to sanity-check the
 * actual local setup:
 *
 *   npx tsx scripts/smoke-test-ollama.ts llama3.1
 *
 * (or `npm install -D tsx` first if you don't have it)
 */
import { OllamaProvider } from "../src/llm/providers/OllamaProvider";
import { LLMAdapter } from "../src/llm/LLMAdapter";

const model = process.argv[2] ?? "llama3.1";

async function main() {
  console.log(`Testing Ollama with model "${model}" at http://localhost:11434 ...\n`);

  const provider = new OllamaProvider({ model });
  const adapter = new LLMAdapter({ primary: provider });

  let fullText = "";
  try {
    for await (const chunk of adapter.streamCompletion({
      messages: [
        { role: "system", content: "You are a terse test assistant. Reply in one short sentence." },
        { role: "user", content: "Say hello and confirm you are working." }
      ]
    })) {
      if (chunk.type === "text_delta") {
        process.stdout.write(chunk.text);
        fullText += chunk.text;
      } else if (chunk.type === "done") {
        console.log(`\n\n[done: ${chunk.finishReason}, provider: ${chunk.provider}]`);
      } else if (chunk.type === "error") {
        console.error(`\n\n[error from ${chunk.provider}]: ${chunk.message}`);
        process.exitCode = 1;
      }
    }
  } catch (err) {
    console.error("\nRequest failed:", err);
    console.error(
      "\nCommon causes:\n" +
        "  - Ollama isn't running: start it with `ollama serve`\n" +
        `  - Model "${model}" isn't pulled: run \`ollama pull ${model}\`\n` +
        "  - CORS: if this were called from a browser instead of Node, you'd also need\n" +
        "    OLLAMA_ORIGINS set to your dev server's origin.\n"
    );
    process.exitCode = 1;
    return;
  }

  if (!fullText.trim()) {
    console.warn("\nWarning: stream completed but no text was received.");
  }
}

main();
