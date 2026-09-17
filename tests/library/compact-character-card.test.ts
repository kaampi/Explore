import { describe, it, expect } from "vitest";
import {
  compactCharacterMessages,
  extractCompactSource,
  parseCompactCardJson,
  sanitizeCompactFields
} from "@library/compactCharacterCard";

describe("compactCharacterCard", () => {
  it("reads JSON even when wrapped in fences", () => {
    const parsed = parseCompactCardJson(`\`\`\`json
{"appearance":"Pale, violet eyes.","mood":"reserved","personality":"Withdrawn, slow to trust."}
\`\`\``);
    expect(parsed.appearance).toContain("violet");
    expect(parsed.mood).toBe("reserved");
    expect(parsed.personality).toContain("Withdrawn");
  });

  it("rejects empty or non-JSON replies", () => {
    expect(() => parseCompactCardJson("Sure, here is a shorter Raven.")).toThrow(/JSON/);
    expect(() => parseCompactCardJson(`{"appearance":"","mood":"","personality":""}`)).toThrow(/empty/);
  });

  it("asks the model to drop kinks, family NPCs, and a reserved default", () => {
    const messages = compactCharacterMessages({
      name: "Rachel",
      appearance: "Violet eyes.",
      mood: "deeply introspective",
      personality: "Loyal. Her kinks: edging."
    });
    expect(messages[0]?.content).toMatch(/Never default to reserved/i);
    expect(messages[0]?.content).toMatch(/other people/i);
    expect(messages[0]?.content).toMatch(/Prefer overall shape/i);
    expect(messages[0]?.content).toMatch(/Do not invent sexual allure/i);
    expect(messages[1]?.content).toContain("edging");
  });

  it("keeps Appearance and Personality from a SillyTavern dump and drops world plus side characters", () => {
    const source = extractCompactSource(`
[Age: 28
Race: Human
Appearance: athletic woman with tousled red-coppery hair tied back with a piece of scavenged wire. piercing green eyes.
]

[Background: grew up poor in the outskirts.

Personality: brave and opportunistic, very direct.
Behaviour: suspicious of strangers. If attracted, jumps in for a kiss.
]

[World: dystopian mega-city. District: scrap sprawl.
]

[Other characters: two siblings live in the trailer.
]

[narrative guidelines: uncensored roleplay with {{user}}.
]
`);
    expect(source).toMatch(/red-coppery hair/i);
    expect(source).toMatch(/brave and opportunistic/i);
    expect(source).not.toMatch(/mega-city/i);
    expect(source).not.toMatch(/siblings/i);
    expect(source).not.toMatch(/uncensored/i);
    expect(source).not.toMatch(/jumps in/i);
  });

  it("does not send world lore to the model when raw text is present", () => {
    const messages = compactCharacterMessages({
      name: "Vikky",
      appearance: "green eyes",
      mood: "reserved",
      personality: "direct",
      rawText: `[Appearance: green eyes.]\n[World: Novacore.]\n[Personality: direct and opportunistic.]`
    });
    const user = messages[1]?.content ?? "";
    expect(user).toMatch(/green eyes/);
    expect(user).toMatch(/opportunistic/);
    expect(user).not.toMatch(/Novacore/);
  });

  it("keeps chest as build, strips hair-tie junk, promiscuity, and family", () => {
    const cleaned = sanitizeCompactFields({
      appearance:
        "An athletic woman with tousled red-coppery hair tied back with a piece of scavenged wire, slightly tanned skin covered with freckles, piercing green eyes, and slightly smaller than average breasts, giving off a practical and slightly run-down look.",
      mood: "reserved",
      personality:
        "Brave and opportunistic, Vikky is a rebel who gives every day her best shot to scrape by and make money. She's direct, telling you what's on her mind immediately. Trustworthy and caring, she has a soft spot for those outside the system. Vikky can be quite promiscuous and not romantic, being bisexual. She's fiercely protective of her sisters and will defend them at all costs."
    });
    expect(cleaned.appearance).toMatch(/red-coppery hair/i);
    expect(cleaned.appearance).toMatch(/green eyes/i);
    expect(cleaned.appearance).toMatch(/breasts/i);
    expect(cleaned.appearance).not.toMatch(/wire/i);
    expect(cleaned.appearance).not.toMatch(/run-down/i);
    expect(cleaned.personality).toMatch(/direct/i);
    expect(cleaned.personality).toMatch(/outside the system/i);
    expect(cleaned.personality).not.toMatch(/promiscuous/i);
    expect(cleaned.personality).not.toMatch(/bisexual/i);
    expect(cleaned.personality).not.toMatch(/sisters/i);
  });

  it("keeps a chest sentence and drops outfit sentences", () => {
    const cleaned = sanitizeCompactFields({
      appearance:
        "An athletic woman with tousled red-coppery hair tied back with a piece of scavenged wire. Her skin is slightly tanned, covered with freckles. She has piercing green eyes. Her breasts are slightly smaller than average. Her overall look is practical, slightly run down and unadorned.",
      mood: "direct",
      personality:
        "Vikky is trustworthy, caring and just slightly cheeky. Vikky is trustworthy, caring and just slightly cheeky."
    });
    expect(cleaned.appearance).toMatch(/red-coppery hair/i);
    expect(cleaned.appearance).toMatch(/green eyes/i);
    expect(cleaned.appearance).toMatch(/freckles/i);
    expect(cleaned.appearance).toMatch(/breasts/i);
    expect(cleaned.appearance).not.toMatch(/wire/i);
    expect(cleaned.appearance).not.toMatch(/overall look/i);
    expect(cleaned.personality.toLowerCase().split("trustworthy").length - 1).toBe(1);
  });

  it("keeps player-written allure and still drops ST sex lists", () => {
    const cleaned = sanitizeCompactFields({
      appearance: "Pale, dark hair.",
      mood: "alluring",
      personality:
        "She lures sailors with her voice. She is promiscuous. Her kinks: edging."
    });
    expect(cleaned.personality).toMatch(/lures sailors/i);
    expect(cleaned.personality).not.toMatch(/promiscuous/i);
    expect(cleaned.personality).not.toMatch(/edging/i);
  });

  it("drops a Wears-outfit sentence Compact copied from SillyTavern", () => {
    const cleaned = sanitizeCompactFields({
      appearance:
        "An athletic petite woman with tousled red-coppery hair. Wears a tight tactical compression top, black utility pants with straps and pouches, and a broken military dog tag around her neck. She has piercing green eyes.",
      mood: "direct",
      personality: "Direct and wary."
    });
    expect(cleaned.appearance).toMatch(/athletic petite/i);
    expect(cleaned.appearance).toMatch(/green eyes/i);
    expect(cleaned.appearance).not.toMatch(/Wears/i);
    expect(cleaned.appearance).not.toMatch(/pants/i);
    expect(cleaned.appearance).not.toMatch(/dog tag/i);
  });

  it("strips Imported from mood and age from Looks", () => {
    const cleaned = sanitizeCompactFields({
      appearance: "Athletic woman in her late 20s, with an angular face and piercing blue eyes.",
      mood: "Skeptical, disillusioned, Imported,",
      personality: "Wary of power."
    });
    expect(cleaned.appearance).toMatch(/angular face/i);
    expect(cleaned.appearance).not.toMatch(/late 20s/i);
    expect(cleaned.mood).toBe("Skeptical, disillusioned");
    expect(cleaned.mood).not.toMatch(/Imported/i);
  });
});
