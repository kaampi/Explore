import { describe, it, expect } from "vitest";
import {
  SillyTavernImportError,
  characterFromCardData,
  importSillyTavernCard,
  reviewFromCardData
} from "@library/sillyTavernImport";
import { characterDraftFromTemplate, characterTemplateFromDraft, placeTemplateFromForm, storyTemplateFromForm, voiceTemplateFromForm } from "@library/fromForm";
import { parseCharacterTemplate } from "@library/LibrarySchema";
import { extractCompactSource } from "@library/compactCharacterCard";

const v2Card = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "Ada",
    description: "A cartographer with ink-stained fingers.",
    personality: "Curious, dry, slightly lost.",
    scenario: "A rain-soaked map shop after closing."
  }
};

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  return out;
}

function pngWithText(keyword: string, text: string): Uint8Array {
  const kw = new TextEncoder().encode(keyword);
  const payload = new TextEncoder().encode(text);
  const data = new Uint8Array(kw.length + 1 + payload.length);
  data.set(kw, 0);
  data[kw.length] = 0;
  data.set(payload, kw.length + 1);

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = pngChunk("IHDR", new Uint8Array(13));
  const textChunk = pngChunk("tEXt", data);
  const iend = pngChunk("IEND", new Uint8Array(0));
  const out = new Uint8Array(sig.length + ihdr.length + textChunk.length + iend.length);
  out.set(sig, 0);
  out.set(ihdr, sig.length);
  out.set(textChunk, sig.length + ihdr.length);
  out.set(iend, sig.length + ihdr.length + textChunk.length);
  return out;
}

describe("SillyTavern import", () => {
  it("maps parenthesized Alice-style fields without mistaking a childhood age for current age", async () => {
    const description = `[Character(Alice)
{
Sex(Female)
Age(18)
Occupation(A high school student)
Appearance(Short black hair + red eyes + fair skin)
Outfit(White collared shirt + black vest + black skirt)
Personality({{char}} pretends to be mean.
When alone (or with a trusted friend), she is shy and compassionate.)
Likes(Getting praised + sweets)
Dislikes(bullying (but does it anyway) + bugs)
Relationship(Her parents left her at an orphanage when she was 4 years old)
Description(She spends time alone.
Her parents left her in an orphanage when she was 4 years old.)
Scenario(She bumps into {{user}} in the school hallways.)
}]`;
    const raw = { spec: "chara_card_v2", data: { name: "Alice the bully", description, personality: "" } };
    // Both JSON files and embedded PNG cards use the same deterministic mapper.
    for (const review of [await importSillyTavernCard({ jsonText: JSON.stringify(raw) }), await importSillyTavernCard({ pngBytes: pngWithText("chara", btoa(JSON.stringify(raw))) })]) {
      expect(review.character).toMatchObject({ name: "Alice", approximateAge: 18, pronoun: "she", appearance: "Short black hair, red eyes, and fair skin.", personality: "Pretends to be mean.\nWhen alone (or with a trusted friend), she is shy and compassionate.", scenario: "" });
      expect(review.rawText).toBe(description);
      expect(review.character.appearance).not.toMatch(/Age|Outfit|Occupation|Scenario|orphanage/);
    }
    const compact = extractCompactSource(description);
    expect(compact).toContain("Short black hair");
    expect(compact).toContain("shy and compassionate");
    expect(compact).not.toMatch(/Age|Occupation|Outfit|Likes|Dislikes|Relationship|orphanage|hallways/);
  });

  it("recognizes structured identity without Character(...) and never infers an age from backstory over an unknown age", () => {
    const character = characterFromCardData({ name: "Rin", description: "Age(unknown)\nSex(Nonbinary)\nAppearance(Green eyes)\nPersonality(Quiet)\nDescription(They moved here at 4 years old.)" });
    expect(character.approximateAge).toBeUndefined();
    expect(character.pronoun).toBe("they");
    expect(character.appearance).toBe("Green eyes");
    expect(character.personality).toBe("Quiet");
    expect(characterFromCardData({ name: "Rin", age: 25, description: "Age(18)\nSex(Female)", gender: "they" })).toMatchObject({ approximateAge: 25, pronoun: "they" });
  });

  it("reads a v1 (flat) JSON card", () => {
    const character = characterFromCardData({
      name: "Jules",
      personality: "Soft-spoken.",
      description: "Always carrying a thermos.",
      scenario: "A kitchen at dawn.",
      first_mes: "Hi.",
      mes_example: "{{user}}: Hi\n{{char}}: Hello."
    });
    expect(character.name).toBe("Jules");
    expect(character.personality).toBe("Soft-spoken.");
    expect(character.appearance).toBe("Always carrying a thermos.");
    expect(character.personality).not.toContain("thermos");
    expect(character.personality).not.toContain("Hi.");
    expect(character.scenario).toBe("");
    expect(character.source).toBe("sillytavern");
  });

  it("splits a SillyTavern full name into given and family", () => {
    const character = characterFromCardData({
      name: "Emma Knucklewood",
      personality: "Dry.",
      scenario: "A quiet bar."
    });
    expect(character.name).toBe("Emma");
    expect(character.familyName).toBe("Knucklewood");
  });

  it("puts inner tokens of a SillyTavern name into middle name", () => {
    const character = characterFromCardData({
      name: "Emma Therese Knucklewood",
      personality: "Dry.",
      scenario: ""
    });
    expect(character.name).toBe("Emma");
    expect(character.middleName).toBe("Therese");
    expect(character.familyName).toBe("Knucklewood");
  });

  it("reads a v2 nested card into name, looks, and personality", () => {
    const character = characterFromCardData(v2Card);
    expect(character.name).toBe("Ada");
    expect(character.personality).toBe("Curious, dry, slightly lost.");
    expect(character.appearance).toBe("A cartographer with ink-stained fingers.");
    expect(character.scenario).toBe("");
  });

  it("reads a v3 nested card", () => {
    const character = characterFromCardData({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: { name: "Rin", personality: "Blunt.", description: "" }
    });
    expect(character.name).toBe("Rin");
  });

  it("maps SillyTavern gender onto he/she/it", () => {
    expect(characterFromCardData({ name: "Ada", gender: "female" }).pronoun).toBe("she");
    expect(characterFromCardData({ name: "Jules", gender: "male" }).pronoun).toBe("he");
    expect(characterFromCardData({ name: "The ship", gender: "it" }).pronoun).toBe("it");
    expect(characterFromCardData({ name: "Rin" }).pronoun).toBeUndefined();
  });

  it("reads age and she/he from description when the card has no gender field", () => {
    const she = characterFromCardData({
      name: "Ada",
      description: "Age: 30\nShe is a cartographer with ink-stained fingers."
    });
    expect(she.approximateAge).toBe(30);
    expect(she.pronoun).toBe("she");

    const yearOld = characterFromCardData({
      name: "Lina",
      description: "She is a 20 year old waitress."
    });
    expect(yearOld.approximateAge).toBe(20);
    expect(yearOld.pronoun).toBe("she");

    const he = characterFromCardData({
      name: "Jules",
      description: "He is 42. Pronouns: he/him"
    });
    expect(he.approximateAge).toBe(42);
    expect(he.pronoun).toBe("he");
  });

  it("lets an explicit gender field win over she/he in the prose", () => {
    const character = characterFromCardData({
      name: "Rin",
      gender: "they",
      description: "She is mentioned in a rumour."
    });
    expect(character.pronoun).toBe("they");
  });

  it("skips age when two different numbers look equally like years", () => {
    const character = characterFromCardData({
      name: "Ada",
      description: "She is a 20 year old who looks 35 years old."
    });
    expect(character.approximateAge).toBeUndefined();
    expect(character.pronoun).toBe("she");
  });

  it("pre-fills a W++ card without dumping the whole block into Looks", () => {
    const blob = `[Character=Princess Eryssara
{Race=Human
Age=22
Gender=Female, Woman
Personality=Spoiled, Tsundere, Pompous
Body/Appearance=Long red hair, green eyes, a thin yet curvy build.
Current Clothing=A simple white linen shirt and a cloak.
Backstory=Her kingdom fell. She enlisted {{user}}.
{{char}} should never speak for {{user}}.}]`;
    const { character, rawText } = reviewFromCardData({ name: "Princess Eryssara", description: blob });
    expect(character.name).toBe("Eryssara");
    expect(character.familyName).toBe("");
    expect(character.approximateAge).toBe(22);
    expect(character.pronoun).toBe("she");
    expect(character.appearance).toContain("Long red hair");
    expect(character.appearance).not.toContain("linen shirt");
    expect(character.appearance).not.toContain("should never speak");
    expect(character.personality).toContain("Spoiled");
    expect(character.tags).toEqual(["Imported"]);
    expect(rawText).toContain("Backstory");
  });

  it("accepts char_name as a fallback", () => {
    const character = characterFromCardData({ char_name: "Old Format" });
    expect(character.name).toBe("Old");
    expect(character.familyName).toBe("Format");
  });

  it("throws on cards with no name", () => {
    expect(() => characterFromCardData({ personality: "???" })).toThrow(SillyTavernImportError);
  });

  it("imports JSON text", async () => {
    const { character } = await importSillyTavernCard({ jsonText: JSON.stringify(v2Card) });
    expect(character.name).toBe("Ada");
  });

  it("rejects invalid JSON text", async () => {
    await expect(importSillyTavernCard({ jsonText: "{not json" })).rejects.toThrow(SillyTavernImportError);
  });

  it("reads a PNG tEXt chara chunk with Base64 JSON", async () => {
    const encoded = btoa(JSON.stringify(v2Card));
    const png = pngWithText("chara", encoded);
    const { character } = await importSillyTavernCard({ pngBytes: png });
    expect(character.name).toBe("Ada");
    expect(character.appearance).toContain("cartographer");
  });

  it("prefers ccv3 over chara when both exist", async () => {
    const chara = pngWithText("chara", JSON.stringify({ name: "Old" }));
    // Rebuild a PNG that contains both chunks by concatenating after signature+IHDR.
    const kw = new TextEncoder().encode("ccv3");
    const payload = new TextEncoder().encode(JSON.stringify({ spec: "chara_card_v3", data: { name: "New" } }));
    const data = new Uint8Array(kw.length + 1 + payload.length);
    data.set(kw, 0);
    data[kw.length] = 0;
    data.set(payload, kw.length + 1);

    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = pngChunk("IHDR", new Uint8Array(13));
    const charaBody = chara.subarray(8 + ihdr.length, chara.length - 12); // skip sig+ihdr, drop IEND
    const ccv3 = pngChunk("tEXt", data);
    const iend = pngChunk("IEND", new Uint8Array(0));
    const out = new Uint8Array(sig.length + ihdr.length + charaBody.length + ccv3.length + iend.length);
    let o = 0;
    for (const part of [sig, ihdr, charaBody, ccv3, iend]) {
      out.set(part, o);
      o += part.length;
    }

    const { character } = await importSillyTavernCard({ pngBytes: out });
    expect(character.name).toBe("New");
  });

  it("rejects a PNG with no character chunk", async () => {
    const png = pngWithText("Comment", "hello");
    await expect(importSillyTavernCard({ pngBytes: png })).rejects.toThrow(SillyTavernImportError);
  });
});

describe("library form mapping", () => {
  it("does not save drafts unless saveToLibrary is set", () => {
    expect(
      characterTemplateFromDraft({
        name: "Ada",
        personality: "Curious",
        mood: "",
        position: "",
        saveToLibrary: false
      })
    ).toBeNull();
  });

  it("round-trips a template through a scene draft", () => {
    const built = characterTemplateFromDraft({
      name: "Ada",
      personality: "Curious",
      mood: "alert",
      position: "at the desk",
      saveToLibrary: true,
      source: "player"
    });
    expect(built?.name).toBe("Ada");
    const draft = characterDraftFromTemplate(built!);
    expect(draft.saveToLibrary).toBe(false);
    expect(draft.libraryId).toBe(built!.id);
    expect(draft.personality).toBe("Curious");
    expect(draft.position).toBe("");
    expect(built?.position).toBe("");
  });

  it("keeps he/she/it on the archive card", () => {
    const built = characterTemplateFromDraft({
      name: "Emma",
      personality: "",
      mood: "",
      position: "",
      pronoun: "she",
      saveToLibrary: true
    });
    expect(built?.pronoun).toBe("she");
    expect(characterDraftFromTemplate(built!).pronoun).toBe("she");
  });

  it("does not store scene position on the archive card", () => {
    const built = characterTemplateFromDraft({
      name: "Emma",
      personality: "Dry-witted.",
      mood: "reserved",
      position: "behind the bar",
      saveToLibrary: true
    });
    expect(built?.position).toBe("");
    expect(characterDraftFromTemplate(built!).position).toBe("");
  });

  it("round-trips looks, portrait, and lore on the archive card", () => {
    const built = characterTemplateFromDraft({
      name: "Ada",
      personality: "Curious",
      mood: "alert",
      position: "",
      appearance: "Short ink-stained hair.",
      portraitDataUrl: "data:image/jpeg;base64,AAAA",
      lore: [
        {
          id: "atlas",
          title: "The atlas",
          content: "She keeps a stolen coastal chart behind the counter.",
          keywords: ["atlas", "chart"]
        }
      ],
      saveToLibrary: true
    });
    expect(built?.appearance).toBe("Short ink-stained hair.");
    expect(built?.portraitDataUrl).toBe("data:image/jpeg;base64,AAAA");
    expect(built?.lore).toEqual([
      {
        id: "atlas",
        title: "The atlas",
        content: "She keeps a stolen coastal chart behind the counter.",
        keywords: ["atlas", "chart"]
      }
    ]);
    const draft = characterDraftFromTemplate(built!);
    expect(draft.appearance).toBe("Short ink-stained hair.");
    expect(draft.lore ?? []).toEqual([]);
  });

  it("parses old character records that have no looks or lore", () => {
    const parsed = parseCharacterTemplate({
      id: "old-ada",
      name: "Ada",
      personality: "Curious",
      mood: "alert",
      position: "",
      scenario: "",
      source: "player",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    expect(parsed.appearance).toBe("");
    expect(parsed.lore).toEqual([]);
    expect(parsed.portraitDataUrl).toBeUndefined();
    expect(parsed.familyName).toBe("");
    expect(parsed.middleName).toBe("");
  });

  it("round-trips given and family name", () => {
    const built = characterTemplateFromDraft({
      name: "Emma",
      familyName: "Knucklewood",
      personality: "",
      mood: "",
      position: "",
      saveToLibrary: true
    });
    expect(built?.name).toBe("Emma");
    expect(built?.familyName).toBe("Knucklewood");
    expect(characterDraftFromTemplate(built!).name).toBe("Emma");
    expect(characterDraftFromTemplate(built!).familyName).toBe("Knucklewood");
  });

  it("does not keep a nickname on the archive card", () => {
    const built = characterTemplateFromDraft({
      name: "Emma",
      personality: "",
      mood: "",
      position: "",
      saveToLibrary: true
    });
    expect(built?.knownAs).toBe("");
    expect(characterDraftFromTemplate(built!)).not.toHaveProperty("knownAs");
  });

  it("round-trips a middle name", () => {
    const built = characterTemplateFromDraft({
      name: "Emma",
      middleName: "Therese",
      familyName: "Knucklewood",
      personality: "",
      mood: "",
      position: "",
      saveToLibrary: true
    });
    expect(built?.middleName).toBe("Therese");
    expect(characterDraftFromTemplate(built!).middleName).toBe("Therese");
  });

  it("splits a legacy full name on the archive card", () => {
    const parsed = parseCharacterTemplate({
      id: "old-emma",
      name: "Emma Knucklewood",
      personality: "",
      mood: "",
      position: "",
      scenario: "",
      source: "player",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    const draft = characterDraftFromTemplate(parsed);
    expect(draft.name).toBe("Emma");
    expect(draft.familyName).toBe("Knucklewood");
  });

  it("splits a three-part legacy name into given, middle, and family", () => {
    const parsed = parseCharacterTemplate({
      id: "old-emma-3",
      name: "Emma Therese Knucklewood",
      personality: "",
      mood: "",
      position: "",
      scenario: "",
      source: "player",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    const draft = characterDraftFromTemplate(parsed);
    expect(draft.name).toBe("Emma");
    expect(draft.middleName).toBe("Therese");
    expect(draft.familyName).toBe("Knucklewood");
  });

  it("builds a place template from the setup form", () => {
    const place = placeTemplateFromForm({
      saveToLibrary: true,
      name: "The map shop",
      lighting: "green glass lamps",
      noise: "rain",
      music: false,
      note: "Smells like paper."
    });
    expect(place?.name).toBe("The map shop");
    expect(place?.lighting).toBe("green glass lamps");
  });

  it("builds a story template from the setup form", () => {
    const story = storyTemplateFromForm({
      saveToLibrary: true,
      title: "The War of the Ring",
      premise: "Sauron's life-force is bound to the One Ring."
    });
    expect(story?.name).toBe("The War of the Ring");
    expect(story?.premise).toContain("One Ring");
  });

  it("derives a library name from the first line when the title is blank", () => {
    const story = storyTemplateFromForm({
      saveToLibrary: true,
      title: "",
      premise: "In the Second Age, Sauron forged the One Ring.\nThe Ring was lost."
    });
    expect(story?.name).toBe("In the Second Age, Sauron forged the One Ring.");
  });

  it("builds a narrator voice template from the setup form", () => {
    const voice = voiceTemplateFromForm({
      saveToLibrary: true,
      title: "Tolkien-äventyr",
      instruction: "Du är Spelledare för ett klassiskt fantasyäventyr."
    });
    expect(voice?.name).toBe("Tolkien-äventyr");
    expect(voice?.instruction).toContain("Spelledare");
  });
});

