import type { Session } from "@state/StateSchema";
import type { Lorebook } from "./LorebookSchema";

/** Called only at NEW conversation creation. Existing conversations remain snapshots. */
export function attachLorebooks(session: Session, books: Lorebook[]): Session {
  const layers = [...session.layers];
  for (const book of books) {
    const binding = book.binding;
    const matches = binding.kind === "all" ||
      (binding.kind === "campaign" && Boolean(binding.targetId) && session.campaignId === binding.targetId) ||
      (binding.kind === "character" && Boolean(binding.targetId) && Object.values(session.characters).some(c => c.sourceLibraryId === binding.targetId));
    if (!matches) continue;
    for (const entry of book.entries) {
      if (!entry.approved || entry.mode === "dormant" || entry.reasons.length || !entry.content.trim()) continue;
      if (entry.mode === "keywords" && !entry.keywords.length) continue;
      if (layers.some(layer => layer.loreSource?.bookId === book.id && layer.loreSource.entryId === entry.id)) continue;
      layers.push({
        id: `imported-lore-${book.id}-${entry.id}`, type: "environment", priority: 40 + layers.length,
        content: entry.content,
        ...(entry.mode === "keywords" ? { keywords: [...entry.keywords] } : {}),
        active: true, aiGenerated: false,
        loreSource: { bookId: book.id, entryId: entry.id, bookName: book.name },
      });
    }
  }
  return { ...session, layers };
}
