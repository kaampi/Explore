import { describe, it, expect } from "vitest";
import {
  KEYWORD_SCAN_TURNS,
  keywordHitsText,
  keywordsMatchConversation,
  parseKeywordList
} from "@layers/keywords";

describe("parseKeywordList", () => {
  it("splits on commas and drops duplicates case-insensitively", () => {
    expect(parseKeywordList("Ring, ring, One Ring; precious")).toEqual(["Ring", "One Ring", "precious"]);
  });
});

describe("keywordHitsText", () => {
  it("matches a whole word, not a substring inside another word", () => {
    expect(keywordHitsText("I am bringing wine.", ["ring"])).toBe(false);
    expect(keywordHitsText("The One Ring is gone.", ["ring"])).toBe(true);
  });

  it("matches a multi-word phrase as a substring, case-insensitive", () => {
    expect(keywordHitsText("Ask her about the wine cellar later.", ["Wine Cellar"])).toBe(true);
  });
});

describe("keywordsMatchConversation", () => {
  it("only scans the most recent turns", () => {
    const conversation = Array.from({ length: KEYWORD_SCAN_TURNS + 2 }, (_, i) => ({
      turn: i + 1,
      content: i === 0 ? "We talked about the cellar." : "Hello."
    }));
    expect(keywordsMatchConversation(conversation, ["cellar"])).toBe(false);
    expect(keywordsMatchConversation(conversation.slice(0, 1), ["cellar"])).toBe(true);
  });
});
