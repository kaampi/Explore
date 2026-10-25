import { IDEA_LABELS, IdeaSchema, type Idea } from "./IdeaSchema";
/**
 * Uses StoryBook-AI's existing manuscript-backup importer (format 2),
 * with a NEW notebook ID on every export. Never targets an existing book.
 * Verified against core/manuscriptBackup.ts, BookSchema.ts and brainstormNotes.ts.
 * sandboxIdeas is additive: Storybook ignores it; portable provenance stays in the file.
 */
export function exportIdeas(input: Idea[], now = new Date().toISOString(), notebookId = crypto.randomUUID()) {
    if (!input.length)
        throw new Error("Choose at least one idea to export.");
    const ideas = input.map(idea => IdeaSchema.parse(idea));
    const notes = ideas.map((idea, index) => ({
        id: idea.id,
        text: `${idea.title}\n\n${idea.description}\n\n[${IDEA_LABELS[idea.kind]} idea from SandboxAI · ${idea.source.conversationTitle}]`,
        x: 24 + (index % 3) * 284,
        y: 24 + Math.floor(index / 3) * 280,
        color: idea.kind === "plot" ? "paper" as const : idea.kind === "character" ? "lilac" as const : "sage" as const,
    }));
    return {
        kind: "storybook-ai.manuscript" as const,
        format: 2,
        exportedAt: now,
        note: "SandboxAI ideas. Import as a separate notebook, then open Brainstorm. These are suggestions, not established story facts.",
        book: {
            id: `sandbox-ideas-${notebookId}`,
            title: ideas.length === 1 ? `Sandbox ideas — ${ideas[0]!.title}` : "Sandbox ideas",
            voice: "",
            brainstorm: notes.map(note => note.text).join("\n\n"),
            brainstorm_notes: notes,
            synopsis: "",
            chapters: [],
            facts: [],
            created_at: now,
            updated_at: now,
        },
        adaptationChapters: [],
        sandboxIdeas: { kind: "sandbox-ai.ideas" as const, format: 1, ideas },
    };
}
export function downloadIdeas(ideas: Idea[]) {
    const payload = exportIdeas(ideas);
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    try {
        const link = document.createElement("a");
        link.href = url;
        link.download = `sandbox-ideas-${payload.exportedAt.slice(0, 10)}.json`;
        document.body.appendChild(link);
        try {
            link.click();
        }
        finally {
            link.remove();
        }
    }
    finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
