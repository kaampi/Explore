# External world imports

Open **Lorebooks → Import lorebook**. Select the source or leave automatic detection enabled. Imports are local and deterministic; no AI, account, API key or source-service connection is needed. Supported files are JSON and existing SillyTavern PNG cards, at most 20 MB and 5,000 entries. Every import keeps the original and starts unlinked with no approved entries.

## AI Dungeon

Accepts the official Story Cards JSON array. `keys` is a comma-separated string; `value` is the exact lore text. Title/type identify cards. `description` is editor metadata and is never copied into AI context. Both spellings of the documented Character Creator flag are retained without affecting runtime.

Malformed cards, missing keys/content, regex/macros/decorators and unknown card fields remain dormant. An empty array can be imported by selecting AI Dungeon explicitly. Scenario scripts, instructions, history and complete Adventure exports are not part of Story Cards.

Reviewed `character` cards can create library characters; `location`/`place` cards can create places. Other types remain lore. No type is inferred from prose.

## OnlyWorlds

Accepts the one-file Export world envelope with `format: "onlyworlds-world-export"`, `world.id` and `elements` keyed by category. Source world/element IDs and schema version are retained. The schema version is informational; supported fields are read independently of it. Folder exports, ZIP archives and API change feeds are not supported in this version.

Named elements produce keyword entries with known descriptive fields and references resolved to names plus original IDs. References never expand another element's prose into the selected entry. Unresolved references are labelled. Unknown categories, inconsistent types, duplicate IDs and missing names/IDs remain dormant. Other fields and custom extensions remain in the original; they are not evaluated. Images, numeric game statistics and map geometry are not imported into runtime systems.

Only explicitly approved `character` and `location` elements can become library cards. Other categories stay lore. World description, if selected, can become the new world's introduction.

## Azgaar Fantasy Map Generator

Accepts Full and Minimal JSON exports identified by their `info.description` and `pack`. Minimal JSON is recommended to avoid large cell/vertex arrays. `.map`, compressed maps, GeoJSON and Pack/Grid Cells exports are not supported.

Named states, provinces, burgs (settlements), cultures, religions, rivers, markers and routes become reviewable keyword entries. Generator sentinels and neutral index-zero entries are skipped; removed/invalid/duplicate rows remain dormant. Source indices and references are retained. Unnamed or unsupported sections stay in the original. The source's raw population value is labelled unconverted; it is not a literal inhabitant count. Coordinates are descriptive metadata.

Selected states, provinces and settlements can create library places. They form a flat list in one new world: borders, hierarchy, distance calculations, travel graphs, economy and interactive map geometry are not recreated. Azgaar does not supply NPCs through this adapter; users can create or use their own character to explore a place.

## Review, create and explore

The existing Sandbox activation rules remain unchanged: last eight messages, case-insensitive whole-word matching for single keys, substring matching for phrases, and a separate imported-lore context cap. No source-specific code, settings or triggers execute.

Choose either:

- **Save lorebook**: keep selected content as optional lore; no character/place cards are created. Bind it manually to a character, campaign, world or all new conversations.
- **Also create a world in my library → Save world & lore**: only approved supported typed rows create cards. A new local world and its character/place cards are saved with the source book in one IndexedDB transaction. Collisions abort the entire import; existing cards are never replaced. Starting cards over 4,000 characters must be shortened in the original or imported as optional lore only. Nothing is silently truncated.

Creating a world is an explicit acceptance of its selected descriptions as library character/place material. Imported lore alone still does not establish a physical map or modify StorybookAI canon. The source world ID is retained separately from the new local copy's ID. Reimport creates a new copy.

From Home, choose the new world, a place and a character, then **Begin exploring**. A newly imported character can also start a direct chat with its source-world lore, when no other place/world was selected. Selecting a place in a different world takes that world's lore binding instead. Existing conversations remain snapshots.

Source data and world/character IDs travel through existing library backup format 2. No database upgrade is needed; fields are additive. Older app versions may not understand the new world binding and provenance, so use this version or later when restoring these backups.

## Validation and references

Unit and simulated UI tests cover all three adapters, approval, malformed/dormant rows, original retention, stable references, duplicate handling, budget/map isolation, atomic rollback on collision, backup round trips, storage retry, optional creation and actual Home-to-conversation flows. Real local-model generation and visual browser verification remain separate checks.

References:

- AI Dungeon official Story Cards Import and Export: https://help.aidungeon.com/story-cards-import-and-export
- OnlyWorlds export envelope: https://onlyworlds.github.io/docs/development/api/changes
- OnlyWorlds fixture: https://github.com/OnlyWorlds/schema-dist/blob/main/example/world-export.json
- Azgaar exporter: https://github.com/Azgaar/Fantasy-Map-Generator/blob/master/src/services/io/export-json.ts
- Azgaar model definitions under `src/model/political` and `src/model/society` define the fields read by this adapter.
