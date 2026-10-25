import { z } from "zod";
import type { Session } from "@state/StateSchema";
import { displayCharacterName, narratorLabel } from "@session/createSession";
export const IDEA_KINDS = ["plot", "character", "world"] as const;
export const IDEA_LABELS = { plot: "Plot", character: "Character", world: "World" };
export const IdeaSchema = z.object({
    id: z.string().min(1),
    title: z.string().trim().min(1, "Give your idea a title.").max(120),
    description: z.string().trim().min(1, "Describe your idea.").max(50000),
    kind: z.enum(IDEA_KINDS),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    source: z.object({
        conversationId: z.string().min(1),
        conversationTitle: z.string(),
        excerpts: z.array(z.object({
            turn: z.number().int().nonnegative(),
            role: z.enum(["player", "character", "system"]),
            speaker: z.string(),
            content: z.string(),
        })).min(1),
    }),
});
export type Idea = z.infer<typeof IdeaSchema>;
/** Snapshot only the explicitly selected messages; no prompts, flags or other session state. */
export function captureIdea(session: Session, turns: Iterable<number>, title: string): Idea {
    const selected = new Set(turns);
    const excerpts: Idea["source"]["excerpts"] = [];
    for (const raw of session.conversation) {
        if (!raw || typeof raw !== "object")
            continue;
        const message = raw as Record<string, unknown>;
        if (typeof message.turn !== "number" || !selected.has(message.turn) || typeof message.content !== "string")
            continue;
        if (message.role !== "player" && message.role !== "character" && message.role !== "system")
            continue;
        const id = typeof message.speaker === "string" ? message.speaker : "";
        const character = session.characters[id];
        const speaker = message.role === "player" ? "You" : message.role === "system" ? "System" : narratorLabel(session) || (character ? displayCharacterName(id, character.name, character.familyName, character.middleName) : id || "Character");
        excerpts.push({ turn: message.turn, role: message.role, speaker, content: message.content });
    }
    if (!excerpts.length)
        throw new Error("Select at least one message to capture an idea.");
    const now = new Date().toISOString();
    return IdeaSchema.parse({
        id: crypto.randomUUID(),
        title: excerpts[0]!.content.trim().replace(/\s+/g, " ").slice(0, 80) || "A new idea",
        description: excerpts.map(e => `${e.speaker}: ${e.content}`).join("\n\n"),
        kind: "plot",
        createdAt: now,
        updatedAt: now,
        source: { conversationId: session.id, conversationTitle: title, excerpts },
    });
}
