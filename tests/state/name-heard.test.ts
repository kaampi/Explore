import { describe, it, expect } from "vitest";
import {
  maskUnheardGivenNames,
  nameHeardInConversation,
  narrationCallName,
  pass1NameOptions,
  publicCallName
} from "@state/nameHeard";
import type { Session } from "@state/StateSchema";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    schemaVersion: 2,
    id: "s1",
    runtime: { model: "test", temperature: 0.7, seed: null, provider: "test" },
    stateVersion: 0,
    characters: {
      emma: {
        name: "Emma",
        pronoun: "she",
        position: { value: "behind the bar", lock: "unlocked" },
        mood: { value: "reserved", lock: "unlocked" }
      }
    },
    scene: { location: "The Aurora Room", environment: {} },
    relationships: {},
    layers: [],
    memory: { episodic: [], semantic: [], relational: [] },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: [],
    ...overrides
  };
}

describe("nameHeardInConversation", () => {
  it("is unheard when chat is empty", () => {
    expect(nameHeardInConversation(makeSession(), "Emma")).toBe(false);
  });

  it("hears the given name as a whole word, in any language case", () => {
    const session = makeSession({
      conversation: [{ turn: 1, role: "player", content: "Hej Emma" }]
    });
    expect(nameHeardInConversation(session, "Emma")).toBe(true);
  });

  it("does not treat Emmanuel as Emma", () => {
    const session = makeSession({
      conversation: [{ turn: 1, role: "player", content: "Hi Emmanuel" }]
    });
    expect(nameHeardInConversation(session, "Emma")).toBe(false);
  });

  it("ignores the given name in narration, and hears it in quoted speech", () => {
    const leaked = makeSession({
      conversation: [
        {
          turn: 1,
          role: "character",
          speaker: "emma",
          content: "Emma looks up from wiping down the bar. 'Evening.'"
        }
      ]
    });
    expect(nameHeardInConversation(leaked, "Emma")).toBe(false);

    const spoken = makeSession({
      conversation: [
        {
          turn: 1,
          role: "character",
          speaker: "emma",
          content: "The bartender looks up. \"I'm Emma. What can I get you?\""
        }
      ]
    });
    expect(nameHeardInConversation(spoken, "Emma")).toBe(true);
  });
});

describe("publicCallName", () => {
  it("uses the subject pronoun until the given name is heard", () => {
    expect(publicCallName(makeSession().characters.emma!)).toBe("she");
  });

  it("does not infer a job from a bar post", () => {
    expect(
      publicCallName({
        name: "Emma",
        pronoun: "she",
        position: { value: "behind the bar", lock: "unlocked" },
        mood: { value: "reserved", lock: "unlocked" }
      })
    ).toBe("she");
  });

  it("falls back to they when pronoun is unset", () => {
    expect(
      publicCallName({
        name: "Emma",
        position: { value: "in the cabin", lock: "unlocked" },
        mood: { value: "reserved", lock: "unlocked" }
      })
    ).toBe("they");
  });
});

describe("pass1NameOptions", () => {
  it("narrates pronouns until the given name is spoken", () => {
    const session = makeSession();
    expect(pass1NameOptions(session, "emma")).toEqual({
      characterName: "she",
      unheardGiven: "Emma"
    });
    expect(narrationCallName(session, "emma")).toBe("she");
  });

  it("switches to the given name once the player uses it", () => {
    const session = makeSession({
      conversation: [{ turn: 1, role: "player", content: "Hej Emma" }]
    });
    expect(pass1NameOptions(session, "emma")).toEqual({ characterName: "Emma" });
    expect(narrationCallName(session, "emma")).toBe("Emma");
  });
});

describe("maskUnheardGivenNames", () => {
  it("turns Emma's room into her room until the name is heard", () => {
    expect(maskUnheardGivenNames(makeSession(), "Rooms here (real): Emma's room.")).toBe(
      "Rooms here (real): her room."
    );
  });

  it("leaves the given name in place once it has been spoken", () => {
    const session = makeSession({
      conversation: [{ turn: 1, role: "player", content: "Emma?" }]
    });
    expect(maskUnheardGivenNames(session, "Emma's room")).toBe("Emma's room");
  });
});
