import { describe, it, expect } from "vitest";
import { closeReplyIfCut, formatPass1UserContent, splitPlayerAgency, stripPass1InstructionLeak } from "@context/PlayerAgency";

describe("splitPlayerAgency", () => {
  it("keeps the player's walk and rejects Emma yodeling", () => {
    const split = splitPlayerAgency(
      "*As I walk to Emma she starts Yoddling*",
      ["Emma", "emma"],
      "she"
    );
    expect(split.playerFacts.toLowerCase()).toContain("walk to emma");
    expect(split.rejectedClaims.join(" ").toLowerCase()).toMatch(/yoddl/);
  });

  it("rejects the player writing Emma's request", () => {
    const split = splitPlayerAgency(
      "*Emma asks if she can spend the night with me*",
      ["Emma"],
      "she"
    );
    expect(split.playerFacts).toBe("");
    expect(split.rejectedClaims[0]?.toLowerCase()).toContain("emma asks");
  });

  it("rejects I-see-Emma puppeteering", () => {
    const split = splitPlayerAgency(
      "*I see Emma starting to dance to the Jazz music*",
      ["Emma"],
      "she"
    );
    expect(split.rejectedClaims.join(" ").toLowerCase()).toContain("dance");
  });

  it("does not flag the player's own sleep or a question", () => {
    expect(splitPlayerAgency("*I fall asleep*", ["Emma"], "she").rejectedClaims).toEqual([]);
    expect(splitPlayerAgency("*I walk to Emma*", ["Emma"], "she").rejectedClaims).toEqual([]);
    expect(
      splitPlayerAgency("I ask Emma if she wants to dance", ["Emma"], "she").rejectedClaims
    ).toEqual([]);
  });
});

describe("formatPass1UserContent", () => {
  it("leaves ordinary lines as the player text", () => {
    expect(formatPass1UserContent("Can you dance", ["Emma"], "she", "Emma")).toBe("Can you dance");
  });

  it("tells the model not to perform a puppeteered action", () => {
    const content = formatPass1UserContent(
      "*As I walk to Emma she starts Yoddling*",
      ["Emma", "emma"],
      "she",
      "Emma"
    );
    expect(content).toContain("[Player action — this happened]");
    expect(content).toContain("walk to Emma");
    expect(content).toContain("Do not write it happening");
    expect(content).toContain("Yoddling");
    expect(content).not.toMatch(/^\*As I walk to Emma she starts Yoddling\*/);
  });
});

describe("stripPass1InstructionLeak", () => {
  it("drops a trailing parenthetical that parrots writing rules", () => {
    expect(
      stripPass1InstructionLeak(
        'Emma nods. "Cheers." (Present tense. Third person about Emma. No invented places. Character actions are not controlled by the player.)'
      )
    ).toBe('Emma nods. "Cheers."');
  });

  it("leaves ordinary narration in parentheses", () => {
    expect(stripPass1InstructionLeak("She pauses (just a second) then pours.")).toBe(
      "She pauses (just a second) then pours."
    );
  });
});

describe("closeReplyIfCut", () => {
  it("drops a trailing fragment when the token wall hit", () => {
    expect(
      closeReplyIfCut('Emma nods. "Stay." She reaches for the', true)
    ).toBe('Emma nods. "Stay."');
  });

  it("drops a trailing fragment even when the provider did not flag length", () => {
    expect(
      closeReplyIfCut(
        `Emma's hand slides down to grasp his. "Let's make a pact, you and I."\n\nWith that, she pulls him down into a`,
        false
      )
    ).toBe(`Emma's hand slides down to grasp his. "Let's make a pact, you and I."`);
  });
});
