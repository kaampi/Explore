import { describe, expect, it } from "vitest";
import { chooseChatExpression, parseExpressionChoice } from "../src/ui/studio/chatExpression";
import type { LLMProvider } from "../src/llm/types";

describe("chat portrait expression selection", () => {
  it("accepts only an exact available expression and fails closed on malformed output", () => {
    expect(parseExpressionChoice('{"expression":"shocked"}', ["neutral", "shocked"])).toBe("shocked");
    for (const raw of ['{"expression":"angry"}', '{"expression":null}', '{"expression":"Shocked"}', 'shocked', 'null']) {
      expect(parseExpressionChoice(raw, ["neutral", "shocked"])).toBeNull();
    }
  });
  it("sends the completed reply and available images to AI and reads its structured choice", async () => {
    const provider: LLMProvider = {
      name: "test", capabilities: { streaming: true, structuredOutput: false, cancellation: true },
      async *streamCompletion(request) {
        const data = JSON.parse(request.messages[1]!.content);
        expect(data.reply).toBe("She freezes, eyes wide. That cannot be true.");
        expect(data.player).toBe("Stay calm.");
        expect(data.available).toEqual(["neutral", "shocked"]);
        yield { type: "text_delta", text: '{"expression":' };
        yield { type: "text_delta", text: '"shocked"}' };
        yield { type: "done", finishReason: "stop" };
      }
    };
    const input = { character: "Emma", current: "neutral", available: ["neutral", "shocked"], player: "Stay calm.", reply: "She freezes, eyes wide. That cannot be true." };
    expect(await chooseChatExpression(provider, input, new AbortController().signal)).toBe("shocked");
    const cancelled = new AbortController(); cancelled.abort();
    expect(await chooseChatExpression(provider, input, cancelled.signal)).toBeNull();
  });
  it("ignores truncated or failed model responses", async () => {
    const provider: LLMProvider = {
      name: "test", capabilities: { streaming: true, structuredOutput: false, cancellation: true },
      async *streamCompletion() {
        yield { type: "text_delta", text: '{"expression":"shocked"}' };
        yield { type: "done", finishReason: "length" };
      }
    };
    expect(await chooseChatExpression(provider, { character: "Emma", current: "neutral", available: ["shocked"], player: "", reply: "" }, new AbortController().signal)).toBeNull();
  });
});
