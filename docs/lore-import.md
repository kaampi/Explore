# SillyTavern lore import

kaampi Explore uses an import adapter. Existing native lore, matching, priorities and saved conversations retain their behavior. kaampi Write is not modified.

## Supported inputs and review

Open **Lorebooks** from Home or Studio and import a JSON lorebook or PNG character card (up to 20 MB / 5,000 entries). Supported shapes are native SillyTavern World Info (`entries` keyed by ID), V2/V3 embedded `character_book`, a raw CharacterBook, and `{ spec: "lorebook_v3", data: ... }`.

Character import also offers an embedded lorebook. Character and lorebook are saved atomically, linked by the library character ID. A malformed embedded book is preserved as dormant and does not block importing the character.

No entries are selected automatically. **Use supported entries with Sandbox rules** or individual checkboxes explicitly approve translation to kaampi Explore's existing semantics:

- Last eight messages; case-insensitive; a single keyword matches whole words, a phrase matches a substring.
- Constant entries are always eligible within the imported-lore/context budgets.
- Source scan depth, insertion order, budget and before/after positioning are not reproduced.
- Title/memo is display metadata; only content enters context.

Secondary-key logic, regex, case-sensitive matching, probability, recursion, timed effects, groups, vectors, macros/decorators, automation, unknown source fields/extensions and unsupported prompt positions/roles remain dormant. Disabled, invalid and keyless nonconstant entries also stay dormant. There is no fallback from missing keywords to always-on content. Original JSON, entry extensions, disabled entries and reasons are retained.

## Reuse and snapshots

Choose an explicit binding: unlinked library storage, one character, one campaign, or all new conversations. Character scope uses stable library IDs, not display names. Campaign scope uses the campaign ID. Standalone lore imported from a character PNG remains unlinked until the user chooses a binding; it does not silently create a character.

Imported entries are copied as separate, optional environment layers only when a NEW conversation is created. Existing sessions are unchanged, including their source text after editing a library book. Imported lore shares a cap of 1,200 estimated tokens per assembled prompt and remains subject to the normal context ceiling. It is excluded from AI layer compaction and from `WorldCanon` map/creature/room validation; activation is not acceptance as established world truth. Imported scripts, roles and macros are never executed.

Each import creates a new copy with a new book ID. Reimport never overwrites an existing book or user changes. **Review & link** edits approvals/name/binding on an existing copy; changing the source content requires editing an exported original and importing that file. Original downloads are unchanged source JSON. Library backup format 2 includes lorebooks, raw data, approvals and bindings; older format-1 backups still load. Database v12 adds the lorebook store without rewriting saved sessions. Older app versions cannot be relied upon to restore the new lorebook data.

## Validation

Tests cover native/embedded/V3 shapes, Unicode PNG data, fail-closed activation, source text retention, explicit approval and bindings, fixed-budget optional context, compaction/map isolation, v11 upgrade, persistence and backup round trips, and atomic character/book validation. DOM flows cover import review, dormant entries, new-conversation activation, cancellation, storage retry and embedded character import. Existing native lore and UI regression suites also run.

Sources inspected: SillyTavern `public/scripts/world-info.js` (`convertCharacterBook`), the Character Card V2 and V3 specifications, and the official World Info documentation. This is a documented subset, not a SillyTavern runtime implementation.
