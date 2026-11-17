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

## Explore 2.0

Ideas agreed for after the current plan (phases 1–6). Not designed yet: each item needs a design decision before it is built.

### Share an adventure so others can play it

The game engine works without AI, so a shared adventure can be played with its written texts even by someone with no local model. AI adds free replies and reading of free text when a model is connected.

- [ ] **Adventure file.** "Export adventure" in Adventure Builder writes one file with the adventure and everything it uses: people, places, the world and its map, things, rule-set, narrator voice, body plans, factions and pictures. "Import adventure" shows a summary first and then adds the adventure, playable and editable.
  - Imported cards get new IDs and never overwrite the recipient's own cards.
  - The file has a version. Importing a newer version of the same adventure offers "Replace" or "Keep both". Games already started are not changed, since they keep their own copy.
  - Pictures are embedded. Export shows the file size and can compress pictures.
- [ ] **Play without spoilers.** A "play only" import opens the adventure straight into play and keeps it out of Adventure Builder until the player chooses "Open in builder". This prevents accidental spoilers but is not a lock, since the file can always be opened; say so in the interface.
- [ ] **Stand-alone web game.** Export to a single web page with the game and no editor, for example to publish on itch.io. Saving happens in the player's browser. AI works only with the player's own local model. The page must link to the source code, since Explore is AGPL-licensed.

Decisions to make first:

- [ ] Safety on import: the adventure's background and person descriptions are sent to the AI as trusted text. Show what an imported adventure contains before it is added, and mark it as imported. The engine still protects the game state, since the AI can never change it.
- [ ] Rights: pictures and cards may come from elsewhere (SillyTavern import, Codex manuscripts). Remind the author to share only what they may share, and decide whether a licence can be stated in the file.
- [ ] Personal content: the player's portrait and name from the You step are included unless the author chooses otherwise.
- [ ] A shared gallery with accounts and moderation is a separate project. Start with files.

Suggested order: adventure file → play without spoilers → web game.

### Ideas from RPG in a Box

Compared with [RPG in a Box](https://rpginabox.com/), a tool for making graphical role-playing games.

- [ ] **Dialogue as a flowchart.** A conversation tree per person in a scene: what they say, the player's choices, conditions and effects. The tree decides; the AI gives voice to free talk around it.
- [ ] **When / If / Then rules.** Effects can today only be the outcome of an action. Let the author also attach them to events: "when the player arrives here", "when this discovery is made". The idea is already described in [rule-based-play-plan.sv.md](rule-based-play-plan.sv.md). Built from ready blocks; no scripting language.
- [ ] **Encounters on the map.** Map places and routes already have an encounter setup (frequency, participants, tone) that nothing reads. Let the engine decide whether and who, and the AI narrate. Fits "encounters along the way" in free play (phase 5) and [game-time-and-journeys-ideas.md](game-time-and-journeys-ideas.md).
- [ ] Equipment that adds to values (rings, armour), and more than one currency.
- [ ] Abilities with effects that can be used in combat, besides weapons. Needs a rules decision on what an ability may do.

Not for Explore: voxel art, grid maps, real-time combat, a scripting language of its own.
