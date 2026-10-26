import { newCharacterTemplate, newStoryTemplate, type CharacterTemplate, type StoryTemplate } from "@library/LibrarySchema";
import { splitPersonName } from "@library/personName";
import type { Lorebook } from "./LorebookSchema";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const words = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && !!v.trim()) : [];
const approved = (book: Lorebook, index: number): boolean =>
  !!book.entries[index]?.approved && book.entries[index]?.mode !== "dormant" && !book.entries[index]?.reasons.length;

function safePortrait(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // Do not fetch remote URLs, embed SVG, or retain unexpectedly large data URLs.
  if (value.length > 2_000_000) return undefined;
  return /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(value) ? value : undefined;
}
function character(name: string, description: string, traits: string[], visual: RecordValue, tags: string[], portrait?: unknown): CharacterTemplate {
  const names = splitPersonName(name);
  const appearance = Object.entries(visual)
    .filter(([, v]) => typeof v === "string" && !!v.trim())
    .map(([k, v]) => `${k.replace(/([a-z])([A-Z])/g, "$1 $2")}: ${v}`).join("; ");
  return newCharacterTemplate({
    name: names.given, middleName: names.middle, familyName: names.family,
    personality: [description, traits.length ? `Traits: ${traits.join(", ")}` : ""].filter(Boolean).join("\n\n"),
    appearance, tags: [...new Set(["Imported", "Aventuras", ...tags])],
    source: "player", ...(safePortrait(portrait) ? { portraitDataUrl: safePortrait(portrait) } : {}),
  });
}

export function aventurasLibraryPreview(book: Lorebook): { characters: CharacterTemplate[]; stories: StoryTemplate[]; warnings: string[] } {
  const root = record(book.raw);
  if (book.origin?.format !== "aventuras" || root?.format !== "aventuras-exchange") throw new Error("Not an Aventuras exchange import.");
  const data = record(root.data);
  if (!data) throw new Error("Missing exchange payload.");
  const characters: CharacterTemplate[] = [];
  const stories: StoryTemplate[] = [];
  const warnings: string[] = [];
  if (root.entity === "character" && approved(book, 0)) {
    characters.push(character(text(data.name), text(data.description), words(data.traits), record(data.visualDescriptors) ?? {}, words(data.tags), data.portrait));
    if (data.portrait && !safePortrait(data.portrait)) warnings.push("External or unsupported portrait retained only in original JSON.");
  }
  if (root.entity === "scenario") {
    if (approved(book, 0)) {
      const premise = [text(data.description), text(data.settingSeed)].filter(Boolean).join("\n\n");
      if (premise) stories.push(newStoryTemplate({ name: text(data.name), premise, source: "player" }));
      else warnings.push("Scenario has no premise and cannot become a story.");
    }
    const npcs = Array.isArray(data.npcs) ? data.npcs : [];
    for (let i = 0; i < npcs.length; i++) {
      if (!approved(book, i + 1)) continue;
      const npc = record(npcs[i]);
      if (!npc || !text(npc.name)) continue;
      const description = [text(npc.description), text(npc.role) && `Role: ${text(npc.role)}`, text(npc.relationship) && `Relationship: ${text(npc.relationship)}`].filter(Boolean).join("\n\n");
      characters.push(character(text(npc.name), description, words(npc.traits), {}, ["NPC"]));
    }
    warnings.push("Opening messages, alternate greetings, and starting time are preserved in original JSON, not executed.");
  }
  return { characters, stories, warnings };
}
