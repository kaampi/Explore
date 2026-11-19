import { describe, expect, it } from "vitest";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { initialsOf, personCard, shortLine } from "../../src/ui/play/personCard";

const PICTURE = "data:image/png;base64," + "A".repeat(40);

function game(portrait?: string, personality?: string, mood?: string) {
  const built = connectedAdventureExample();
  if (portrait) built.characters[0]!.portraitDataUrl = portrait;
  if (personality !== undefined) built.characters[0]!.personality = personality;
  if (mood !== undefined) built.characters[0]!.mood = mood;
  const session = startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "card",
    [built.realm],
    { characters: built.characters },
  );
  return { session, id: `npc:${built.characters[0]!.id}` };
}

describe("shortLine", () => {
  it("takes the first sentence", () => {
    expect(shortLine("Calm and watchful. She trusts few people.", 80)).toBe("Calm and watchful.");
  });
  it("cuts a long sentence at a word and ends it with an ellipsis", () => {
    const line = shortLine("A ".repeat(60) + "very long sentence without any end", 40);
    expect(line.length).toBeLessThanOrEqual(40);
    expect(line.endsWith("…")).toBe(true);
    expect(line).not.toMatch(/\s…$/);
  });
  it("is empty for nothing, and keeps a short text whole", () => {
    expect(shortLine("", 80)).toBe("");
    expect(shortLine("  Quiet  ", 80)).toBe("Quiet");
  });
});

describe("initialsOf", () => {
  it("uses the first letters of the first two words, in capitals", () => {
    expect(initialsOf("Edda")).toBe("E");
    expect(initialsOf("mona sanchez")).toBe("MS");
    expect(initialsOf("The old warden of the gate")).toBe("TO");
    expect(initialsOf("")).toBe("?");
  });
});

describe("personCard", () => {
  it("shows the portrait, a short line and how the person seems now", () => {
    const { session, id } = game(PICTURE, "Calm and watchful. Trusts few.", "Tired but alert");

    const card = personCard(session, id, "Edda");

    expect(card).toEqual({
      id,
      name: "Edda",
      line: "Calm and watchful.",
      mood: "Tired but alert",
      portrait: PICTURE,
      initials: "E",
    });
  });

  it("has no portrait and a longer line for a person without a picture", () => {
    const long = "Edda keeps the well and the gossip of the whole village in careful order, ";
    const { session, id } = game(undefined, long + "and nobody leaves without a word.");

    const card = personCard(session, id, "Edda");

    expect(card.portrait).toBeUndefined();
    expect(card.initials).toBe("E");
    // 80 characters would have cut it; without a picture there is room for more.
    expect(card.line.length).toBeGreaterThan(80);
    expect(card.line.length).toBeLessThanOrEqual(160);
  });

  it("ignores something that is not a picture", () => {
    const { session, id } = game("not a picture");

    expect(personCard(session, id, "Edda").portrait).toBeUndefined();
  });

  it("is empty but still a card for a person nothing is written about", () => {
    const { session } = game();

    const card = personCard(session, "npc:invented", "Old Tam");

    expect(card).toMatchObject({ line: "", mood: "", initials: "OT" });
    expect(card.portrait).toBeUndefined();
  });
});
