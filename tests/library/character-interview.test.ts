import { describe, expect, it } from "vitest";
import { CharacterTemplateSchema } from "@library/LibrarySchema";
import { characterTemplateFromGenerated } from "@library/characterGenerator";
import {
  conductCharacterInterview,
  INTERVIEW_OPENING,
  interviewFromModelText,
  localInterview,
  OLLAMA_UNREACHABLE_NOTE,
  OLLAMA_UNREADABLE_NOTE
} from "@library/characterInterview";

const WISH = "a warm healer, korthugget";

describe("localInterview", () => {
  it("opens with one question and no card", () => {
    const step = localInterview([], 3);
    expect(step.card).toBeNull();
    expect(step.question).toBe(INTERVIEW_OPENING);
    expect(step.imagePrompt).toBe("");
  });

  it("turns a short wish into a card and asks about the gap", () => {
    const step = localInterview([WISH], 5);
    expect(step.card?.mood).toBe("warm");
    expect(step.card?.tags).toContain("healer");
    expect(step.card?.speech).toMatch(/clipped/i);
    expect(step.question).toBe("How do you picture them? Body and face.");
    expect(step.imagePrompt).toContain(step.card?.appearance);
    expect(step.imagePrompt).not.toMatch(/jacket|kink|sister/i);
  });

  it("keeps the same person when a later reply only fills a gap", () => {
    const first = localInterview([WISH], 5);
    const second = localInterview([WISH, "Tall, with green eyes."], 5);
    expect(second.card?.name).toBe(first.card?.name);
    expect(second.card?.familyName).toBe(first.card?.familyName);
    expect(second.card?.speech).toBe(first.card?.speech);
    expect(second.card?.appearance).toMatch(/Tall and spare build/);
    expect(second.card?.appearance).toMatch(/green eyes/);
    expect(second.question).toBe("Is this the person you had in mind?");
  });

  it("rolls someone else from the original wish and keeps a correction on the same name", () => {
    const first = localInterview([WISH], 5);
    const other = localInterview([WISH, "Someone else."], 5);
    expect(`${other.card?.name} ${other.card?.familyName}`).not.toBe(`${first.card?.name} ${first.card?.familyName}`);
    expect(other.card?.speech).toMatch(/clipped/i);
    expect(other.question).toBe("How do you picture them? Body and face.");

    const corrected = localInterview([WISH, "nej, hon är sträng"], 5);
    expect(corrected.card?.name).toBe(first.card?.name);
    expect(corrected.card?.pronoun).toBe("she");
    expect(corrected.card?.mood).toBe("stern");
    expect(corrected.card?.speech).toMatch(/clipped/i);
  });

  it("stops asking once the player confirms, and repeats for the same messages", () => {
    const confirmed = localInterview([WISH, "Tall, with green eyes.", "yes"], 8);
    expect(confirmed.question).toBe("");
    expect(confirmed.card).toEqual(localInterview([WISH, "Tall, with green eyes."], 8).card);
    expect(localInterview([WISH, "ja"], 8)).toEqual(localInterview([WISH, "ja"], 8));
  });

  it("does not copy clothes or a kink from the wish onto the card", () => {
    const step = localInterview(["hon, 34, vaksam bartender med rött hår, wears a leather jacket, kink"], 4);
    const card = step.card;
    expect(card).not.toBeNull();
    if (!card) return;
    expect(CharacterTemplateSchema.parse(characterTemplateFromGenerated(card, "talk-1")).id).toBe("talk-1");
    expect(`${card.appearance} ${card.personality} ${card.speech} ${step.imagePrompt}`).not.toMatch(/jacket|kink/i);
    expect(card.appearance).toMatch(/auburn hair/i);
  });

  it("still casts a loose wish the keyword list does not know", () => {
    const step = localInterview(["Jag vill skapa en hjältefigur till ett Sci-Fi äventyr."], 12);
    expect(step.card?.name.length).toBeGreaterThan(1);
    expect(step.question).toBe("How do they speak?");
    expect(`${step.card?.appearance} ${step.card?.personality}`).not.toMatch(/sci-fi|äventyr|hjälte/i);
  });
});

describe("interviewFromModelText", () => {
  const local = localInterview([WISH], 5);

  it("keeps a clean model card and one question", () => {
    const shaped = interviewFromModelText(
      JSON.stringify({
        name: "Nova",
        middleName: "",
        familyName: "Keene",
        approximateAge: 36,
        pronoun: "she",
        appearance: "Tall and spare build, dark hair, grey eyes. A calm, unlined face.",
        mood: "steady",
        speech: "Speech is quiet, and each sentence finishes.",
        personality: "Nova measures a risk before she moves. People get a straight answer.",
        tags: ["pilot", "Healer"],
        imagePrompt: "Head-and-shoulders portrait. Tall and spare build, dark hair, grey eyes.",
        question: "How do they treat people? What is their home ship?"
      }),
      local,
      WISH
    );
    expect(shaped?.card?.name).toBe("Nova");
    expect(shaped?.card?.familyName).toBe("Keene");
    expect(shaped?.card?.tags).toEqual(["pilot", "healer"]);
    expect(shaped?.question).toBe("How do they treat people?");
  });

  it("drops a field that copies clothes and keeps the local face", () => {
    const shaped = interviewFromModelText(
      '{"name":"Nova","familyName":"Keene","approximateAge":36,"pronoun":"she","appearance":"Wears a leather jacket.","mood":"warm","speech":"Speech is clipped.","personality":"A sister in the fleet.","tags":["kink"],"imagePrompt":"Uniform and boots.","question":"How do they speak?"}',
      local,
      WISH
    );
    expect(shaped?.card?.name).toBe("Nova");
    expect(shaped?.card?.appearance).toBe(local.card?.appearance);
    expect(shaped?.card?.personality).toBe(local.card?.personality);
    expect(shaped?.card?.tags).toEqual(local.card?.tags);
    expect(shaped?.imagePrompt).toContain(local.card?.appearance);
    expect(shaped?.imagePrompt).not.toMatch(/jacket|uniform|boots/i);
  });

  it("returns null when the model does not name a person", () => {
    expect(interviewFromModelText("not json", local, WISH)).toBeNull();
    expect(interviewFromModelText('{"question":"How do they speak?"}', local, WISH)).toBeNull();
  });

  it("clears the question when the player confirms", () => {
    const shaped = interviewFromModelText(
      '{"name":"Nova","approximateAge":36,"pronoun":"she","appearance":"Tall and spare build, dark hair, grey eyes. A calm face.","mood":"warm","speech":"Speech is clipped.","personality":"Nova is easy to be around.","question":"Anything else?"}',
      local,
      "yes"
    );
    expect(shaped?.question).toBe("");
  });
});

describe("conductCharacterInterview", () => {
  it("uses the local card when the model cannot be reached", async () => {
    const result = await conductCharacterInterview({ messages: [WISH], seed: 5 }, async () => {
      throw new Error("failed to fetch");
    });
    expect(result.source).toBe("local");
    expect(result.note).toBe(OLLAMA_UNREACHABLE_NOTE);
    expect(result.reply.card?.tags).toContain("healer");
  });

  it("uses the local card when the reply is not a card", async () => {
    const result = await conductCharacterInterview({ messages: [WISH], seed: 5 }, async () => "I think a hero.");
    expect(result.source).toBe("local");
    expect(result.note).toBe(OLLAMA_UNREADABLE_NOTE);
  });

  it("keeps a model card when the reply is JSON", async () => {
    const result = await conductCharacterInterview({ messages: [WISH], seed: 5 }, async (messages) => {
      expect(messages[0]?.content).toMatch(/No clothes/);
      expect(messages[1]?.content).toContain(WISH);
      return '{"name":"Nova","familyName":"Keene","approximateAge":36,"pronoun":"she","appearance":"Tall and spare build, dark hair, grey eyes. A calm face.","mood":"warm","speech":"Speech is clipped. Few words, and no padding.","personality":"Nova is easy to be around and hard to fool. People get a second chance.","tags":["healer"],"imagePrompt":"Head-and-shoulders portrait. Tall and spare build, dark hair, grey eyes.","question":"How do you picture them? Body and face."}';
    });
    expect(result.source).toBe("ollama");
    expect(result.note).toBe("");
    expect(result.reply.card?.name).toBe("Nova");
    expect(result.reply.question).toMatch(/picture them/i);
  });
});
