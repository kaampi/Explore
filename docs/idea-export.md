# kaampi Explore idea export

Capture one message with **Save as idea**, or select multiple messages with **Capture ideas**. Save an editable title, description and type (`plot`, `character`, `world`). My ideas retains the selected source text separately, even after the original conversation is edited, archived or deleted. Cancelling does not save; failed storage keeps the editor open for retry.

## kaampi Write compatibility

kaampi Write currently imports manuscript backups, not standalone idea bundles. kaampi Explore therefore exports the existing `storybook-ai.manuscript` format 2 envelope. Import it using kaampi Write's manuscript import and open Brainstorm. Every idea becomes a free-board card; none has a `send_index`. Plot ideas use paper, character ideas lilac, and world ideas sage.

The exported manuscript has a fresh `sandbox-ideas-<UUID>` ID on every export, a title, empty voice, empty chapters and facts, empty synopsis, timestamps, and both `brainstorm_notes` and the matching joined `brainstorm` text. Other manuscript settings use kaampi Write's existing defaults. This opens a separate notebook; it does **not** merge cards into an existing book or change canonical facts. For an existing book, use **Copy idea**, then paste into a Brainstorm card there.

The JSON also includes `sandboxIdeas: { kind: "sandbox-ai.ideas", format: 1, ideas: [...] }`. This preserves the editable types and source snapshots for external consumers. Each idea contains `id`, `title`, `description`, `kind`, ISO `createdAt` / `updatedAt`, and `source: { conversationId, conversationTitle, excerpts: [{ turn, role, speaker, content }] }`. kaampi Write ignores this additional envelope field. Only the explicitly selected source messages are included; the rest of the session, prompts, model settings, flags and images are omitted.

The export is a suggestion notebook. Importing it neither accepts ideas as facts nor changes the source world.

## Validation

Read-only compatibility check against `ocedo-apps/StoryBook-AI` main commit `d197a150d6034b0b7d38afa80b9c9691e2ac1484`:

- `src/core/manuscriptBackup.ts` — `parseManuscriptBackup`, format 2.
- `src/core/BookSchema.ts` — `parseBook`, including required fields and default values.
- `src/core/brainstormNotes.ts` — note color, coordinates and text synchronization.
- `src/ui/BookStore.tsx` — the existing manuscript import path checks the book ID before offering replacement.

A temporary local harness loaded the current parser and its schema dependencies and accepted a JSON round trip with all three idea types. It verified three Brainstorm cards, Unicode text, no facts/chapters/synopsis, and a new notebook ID. Font asset URL imports and the unused document-export module were stubbed; the actual manuscript parser, book schema and note functions ran unchanged. No files or branches in kaampi Write were changed.

Repository tests cover selection order, source isolation, save/edit/reload, storage failure and retry, v10→v11 migration, retained unreadable records, archive/deletion of the source, and UI capture/edit/export flows. There is no live connection or automatic write to kaampi Write.
