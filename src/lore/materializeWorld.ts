import { newCharacterTemplate, newPlaceTemplate, newRealmTemplate } from "@library/LibrarySchema";
import { LorebookSchema, type Lorebook } from "./LorebookSchema";

export function selectedWorldEntries(book: Lorebook) {
  return book.entries.filter(entry => entry.approved && entry.mode !== "dormant" && !entry.reasons.length && entry.entity);
}

/** Explicit opt-in: only typed, reviewed rows become playable library cards. */
export function materializeWorld(input: Lorebook) {
  const book = LorebookSchema.parse(input);
  if (!book.origin) throw new Error("This source does not supply typed world entries.");
  if (book.materializedRealmId) throw new Error("This import already created a world. Edit its cards in the library.");
  const entries = selectedWorldEntries(book);
  if (!entries.some(e => e.entity!.kind === "location" || e.entity!.kind === "character")) throw new Error("Select at least one supported character or location to create a world.");
  const oversized = entries.find(e => (e.entity!.kind === "character" || e.entity!.kind === "location" || e.entity!.category === "world") && e.content.length > 4000);
  if (oversized) throw new Error(`“${oversized.title}” is too long for a starting library card. Save as lore only, deselect it, or shorten the original and import again.`);
  const realmId = `imported-world-${book.id}`;
  const realm = newRealmTemplate({ id: realmId, name: book.name, source: "player", note: entries.filter(e => e.entity!.category === "world").map(e => e.content).join("\n\n") });
  const tags = ["imported", book.origin.format];
  const characters = entries.filter(e => e.entity!.kind === "character").map(e => newCharacterTemplate({
    id: `${realmId}-character-${encodeURIComponent(e.id)}`, name: e.entity!.name, personality: e.content, tags, source: "player",
  }));
  const places = entries.filter(e => e.entity!.kind === "location").map(e => newPlaceTemplate({
    id: `${realmId}-place-${encodeURIComponent(e.id)}`, name: e.entity!.name, realmId, note: e.content, brief: e.content, tags, source: "player",
  }));
  return { book: { ...book, binding: { kind: "realm" as const, targetId: realmId }, materializedRealmId: realmId, materializedCharacterIds: characters.map(c => c.id) }, realm, characters, places };
}
