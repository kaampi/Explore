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
- [ ] Visibility/discovery per entity, with discovery state stored per session and no leakage through player-facing labels or shapes.
- [ ] Island entity: land shape above water with its own coastline.
- [ ] Waterfall pattern should take visual precedence over overlapping rapids.
- [ ] Terrain effects by travel mode, including explicit impassability for particular vehicles.
- [ ] Grid-based house plans, irregular rooms, connected stairs/floors and keyed doors, as discussed.

## Game time and journeys

- [ ] Design narrative time, journey stages, overnight stops, encounters, simple rest and injury effects when developing gameplay. See [game-time-and-journeys-ideas.md](game-time-and-journeys-ideas.md) for agreed directions and open questions. These are future design notes, not implemented gameplay.
