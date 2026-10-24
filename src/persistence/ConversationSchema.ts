import { z } from "zod";
import type { Session } from "@state/StateSchema";
import { formatPersonName } from "@library/personName";

export const ConversationEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastOpenedAt: z.string().datetime().optional(),
  archived: z.boolean().default(false),
  preview: z.string().max(220).default(""),
  participants: z.array(z.string()).default([]),
  world: z.string().default(""),
  messageCount: z.number().int().nonnegative().default(0),
});
export type ConversationEntry = z.infer<typeof ConversationEntrySchema>;
export type ConversationCatalog = {
  entries: ConversationEntry[];
  unreadable: number;
};
export function conversationEntry(
  session: Session,
  previous?: ConversationEntry,
  now = new Date().toISOString(),
): ConversationEntry {
  const participants = Object.entries(session.characters)
    .map(([id, character]) =>
      character.name
        ? formatPersonName(
            character.name,
            character.familyName,
            character.middleName,
          )
        : id,
    )
    .slice(0, 8);
  const messages = session.conversation.filter(
    (entry): entry is { content: string } =>
      Boolean(
        entry &&
          typeof entry === "object" &&
          "content" in entry &&
          typeof entry.content === "string",
      ),
  );
  return ConversationEntrySchema.parse({
    id: session.id,
    title:
      previous?.title ??
      (participants.length
        ? `Conversation with ${participants.join(", ")}`
        : session.scene?.location || "A new conversation"
      ).slice(0, 120),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    ...(previous?.lastOpenedAt ? { lastOpenedAt: previous.lastOpenedAt } : {}),
    archived: previous?.archived ?? false,
    preview: (messages.at(-1)?.content ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220),
    participants,
    world: session.scene?.realm || session.scene?.location || "",
    messageCount: messages.length,
  });
}
export function recentConversations(
  entries: ConversationEntry[],
): ConversationEntry[] {
  return entries
    .filter((entry) => !entry.archived)
    .sort(
      (a, b) =>
        Math.max(
          Date.parse(b.updatedAt),
          Date.parse(b.lastOpenedAt ?? b.updatedAt),
        ) -
          Math.max(
            Date.parse(a.updatedAt),
            Date.parse(a.lastOpenedAt ?? a.updatedAt),
          ) || a.id.localeCompare(b.id),
    );
}
