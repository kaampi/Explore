# TODO

## Optional PIN lock for saved conversations

- [ ] Explore an optional PIN lock per saved conversation as a lightweight privacy feature. Deferred for later design; no implementation decision yet.

Intent: let players keep saved chats private from casual viewing on a shared computer. Unlock before displaying conversation content, keep it unlocked while in use, and lock again when leaving it. Consider hiding previews in conversation lists and other views, and optionally hiding the title.

Questions to revisit:
- PIN setup, change and removal, and what happens if the player forgets the code.
- When conversations should relock.
- Which entry points, previews, search results and exports need to respect the lock.
- Whether a UI-level privacy lock is sufficient or encryption of stored content is wanted. Clearly describe the protection provided; a UI lock alone does not protect the underlying stored data.

## Map design follow-ups agreed during testing

- [x] Settlement start shape and land/water clipping: settlements and forests are visually cut away over rivers/lakes; settlements take precedence over forest. Geometry and entity identity are retained on both banks.
- [ ] Optional explicit names for subareas; use type as editor fallback rather than a generated place name. Only explicit names should be shown on the player map.
- [ ] Rename generic Place to Point of Interest and use a compact marker; Region should use a subtle boundary rather than an opaque block.
- [ ] Visibility/discovery per entity, with discovery state stored per session and no leakage through player-facing labels or shapes. Player maps now remember visited places and actual arrival discoveries; explicit story-triggered map reveals remain to be connected.
- [ ] Island entity: land shape above water with its own coastline.
- [ ] Waterfall pattern should take visual precedence over overlapping rapids.
- [ ] Terrain effects by travel mode, including explicit impassability for particular vehicles.
- [ ] Grid-based house plans, irregular rooms, connected stairs/floors and keyed doors, as discussed.

## Game time and journeys

- [ ] Design narrative time, journey stages, overnight stops, encounters, simple rest and injury effects when developing gameplay. See [game-time-and-journeys-ideas.md](game-time-and-journeys-ideas.md) for agreed directions and open questions. These are future design notes, not implemented gameplay.

## Persistent place state and revisits

- [ ] Support visiting ordinary mapped houses and other places outside prepared adventure scenes, while respecting entrances, access rules and the adventure's allowed scope.
- [ ] Store persistent place state per saved playthrough, linked to the place's stable identity. Keep authored map/template information separate from changes established during play; a new game starts independently.
- [ ] If first-visit generation is allowed by the author, establish and save residents, interiors and relevant objects once. Respect authored facts and limits; do not invent quest-critical secrets or story consequences without permission from the adventure design.
- [ ] Persist residents' identities, encounters and relationships with the player, established facts, object ownership and changes to the place. Reuse these records on later visits rather than generating a different household or resetting the house.
- [ ] Restore relevant place state when returning, including after saving, closing and loading the game. Chat history and summaries can support narration, but must not be the only record of these facts.
- [ ] Define how elapsed time may change a place. Changes should follow explicit rules or recorded events, preserve established continuity and respect what the player knows.
- [ ] Verify a complete revisit: meet a resident, change something in the house, leave, save/load and return later. The same resident and house changes must remain, without altering another playthrough or overwriting the author's source material.

Intent: a house should remain the same house throughout a saved game, even when it is not part of the planned adventure. Stable map IDs already exist; automatic population and reliable place-specific continuity are future work.
