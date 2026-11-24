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

## Optional AI help for building a Storyboard scene

- [ ] Explore a future Storyboard feature for first-time authors. Let the author describe what the player should be able to do in one scene. Use the surrounding adventure to propose editable Storyboard actions, conditions, outcomes and links. For example, a key and a conversation might both open a door, but only the conversation establishes that someone saw the player.
- Show which existing characters, items and scenes the proposal would use. Ask a follow-up question when the answer changes how the scene plays. Let the author adjust the preview, apply it, playtest each route and request a focused revision.

Track this separately from the adventure creation guide.

### Continue an existing adventure with the guide

- [ ] After the current guide project, add **Bygg vidare…** to a selected Storyboard scene and **Bygg vidare härifrån** to the author's playtest. Both open the same guide at that scene in the saved adventure, including manual Storyboard edits.
- Offer **Fortsätt härifrån**, **Lägg till ett vägval** and **Fördjupa scenen**. For a selected link, use [Elaborate in Storyboard](#elaborate-in-storyboard) to develop the stretch between its endpoints.
- Preview added choices, scenes and changes to existing routes before applying them. Let the author test the addition from the selected scene and replay the whole adventure from its original start.

### Elaborate in Storyboard

- [ ] **Expand selected text.** Let the author mark a passage, describe what to develop, then edit, accept or discard the proposed wording before it changes the adventure.
- [ ] **Develop part of the adventure.** Let the author select a scene or a link and say what the player should experience along the way. Keep the selected route’s start and destination unless the author chooses to change them. For example, expand the lighthouse-to-boathouse link into a visit to the pier, a conversation with a fisherman, and a photograph in a locked room that reveals the boathouse.
- Read the current saved scenes, actions, items, conditions and consequences, including hand-built adventures and later manual edits. Ask when the author's intent affects the design. Show the existing and proposed routes side by side, including whether the old link would be replaced or kept as an intentional shortcut.
- Check the proposed route for broken dependencies, such as a key only reachable behind its own locked door. Let the author playtest the selected stretch before applying it. Save accepted changes as ordinary, manually editable Storyboard content that plays without AI.

## Shared image styles and character reference cards via Kaampi Codex

- [ ] Revisit after the adventure creation guide is complete. Start by checking how Codex already shares records and image attachments between apps.
- Let authors share a custom style from Comic via Codex and select it in Explore with its name, prompt and optional preview image.
- Let Explore, Comic and Write refer to the same versioned character reference card. An author could use Emma’s photographic card in Write and pair it with a drawn style in Explore or Comic.
- Record the selected style and reference-card versions in the project. Let the author decide when to adopt a newer version. Include the approved game images with the adventure so it plays offline.

## Mature content and player-selected alternatives

Revisit after the adventure creation guide is complete.

- [ ] In Storyboard, let authors mark an image or a whole scene for nudity, combat or graphic violence. For a marked image, offer an alternate image. For a marked scene, let the author write a toned-down scene or an alternate route that preserves essential clues and player choices.
- [ ] Give the finished game a **Show mature content** switch, off by default and changeable during play. Use the authored alternatives offline.
- [ ] For each combat outcome, support a standard message and an optional more detailed description. Both describe the same resolved event, with the same hit location, damage and turn order. For example, both versions can tell the player that Mara was hit in the shoulder. Use the standard message when a detailed version is absent.
- [ ] Apply the current setting to the combat log, including after loading a saved game. Let authors playtest both settings in Storyboard and identify missing alternatives before export.

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

## Updating the desktop app

The installer is published on GitHub Releases as the pre-release `alpha-latest` (see [release-download.sv.md](release-download.sv.md)). Next steps, not designed yet:

- [ ] **Update from inside the app** with Tauri's updater plugin: "A new version is available – Update and restart". Needs an updater signing key stored as a GitHub secret, `createUpdaterArtifacts` in `tauri.conf.json`, and a `latest.json` on the release. Keep the manual download as a fallback.
- [ ] **Sign the Windows installer** so SmartScreen stops warning. Needs a code-signing certificate; decide when the alpha is ready for testers outside the team.
- [ ] **What's new:** show a short list of changes since the installed version before updating, written for players and authors, not commit messages.

## Carrying capacity

Not designed yet. The pack in the play view (see [ornaments.sv.md](ornaments.sv.md)) shows slots, but the engine has no limit. Decide later whether how much the player carries should matter.

- [ ] Decide whether carrying matters at all, per adventure or per rule-set. Default off, so free play and story-driven adventures are not slowed down by bookkeeping.
- [ ] Choose a simple measure: size classes (small, normal, large, very large) rather than kilograms. Objects already have an optional `weight` in `ObjectTemplateSchema`, but it never reaches the engine; map it to a size class or replace it.
- [ ] Capacity from the character: a fixed number of slots, or derived from a rule-set attribute such as strength.
- [ ] What happens when overloaded, decided by the engine, never by the AI: longer travel times (fits [game-time-and-journeys-ideas.md](game-time-and-journeys-ideas.md)), harder physical checks, or simply not being able to pick up more. Always tell the player why, in the pack and when the effect applies.
- [ ] Containers: a backpack or a cart that adds capacity, and things that can be left at a place and picked up later (needs persistent place state, above).

## Outcomes that change values (next after the play view)

**Designed:** see [outcome-values.sv.md](outcome-values.sv.md). The format proposal goes to the ChatGPT track for review before building.

Needed for genres other than fighting: horror (Sanity that drops), romance (closeness that grows), everyday persuasion. Checked in the engine on main: a check can already roll against any value in the rule-set (`check: { stat, modifier }`), and outcomes can set facts, take or give items, unlock or open doors, start a fight and move resources. Bribing a bus driver or flirting to open new choices can be built today. What is missing:

- [ ] **An effect that changes a value**, on the player or on a person: "Sanity −10", "Trust +5". With the rule-set's limits, and something that happens at the limit (Sanity at 0: an outcome, a scene, or the game ends). Today only combat changes health.
- [ ] **Relationship values reach the game.** Trust, familiarity and tension set for a person in a scene in Storyboard are dropped when the game starts, as mood was before step 6 of the play view. Carry them into the game, let outcomes change them, and let choices and AI replies depend on them.
- [ ] **More than two outcomes.** The engine already works out four degrees (exceptional, success, failure, severe), but an author can write only success and failure. Allow optional outcomes for exceptional and severe, falling back on success and failure.
- [ ] **The play view shows the rule-set's own values.** "Your character" shows a health bar whatever the game is, and people can be labelled "Hostile". Show the rule-set's main values (Sanity, Trust) instead, and hide health when the rule-set has no combat. *Done with the combat step of the play view, since it reworks the columns anyway.*
- [ ] Design decision first: what happens at a limit, whose values change, and how much of the numbers the player sees. Ties in with "Character values that colour the story" under Explore 2.0, which needs values that change to have anything to colour.

## Connections: clearer, simpler, deeper

Part of the Adventure Builder pass (see the per-view checklist). Today the connection panel in Storyboard has From, To and "What the player chooses", then three long lists of fact checkboxes ("Open after all of these discoveries", and under "More conditions & consequences": "Keep closed after these discoveries", "Record these facts on arrival"). Travel time (`minutes`) and "requires an open door" (`requiresOpenBarriers`) exist in the engine but cannot be set there.

**Clearer**

- [ ] One word for it everywhere. The play view says "From here" and ways; Storyboard says connection. Choose one (suggestion: "way" / "väg") and use it in Storyboard, the map, the play view and the guide.
- [ ] A preview of how the player sees it, live in the panel: "The Mill · 10 min", or closed with its reason.
- [ ] A text for why it is closed, written by the author and shown to the player ("The gate is barred from inside"). Today a closed connection is simply missing or unexplained.
- [ ] Small marks on the line in Storyboard: closed until something, closes after something, takes time, records something.

**Simpler**

- [ ] The default is three things: from, to and what the player chooses. Everything else is added as sentences, not fact lists: "Open when the player knows that …", "Closes when …", "On the way the player learns …", "Takes … minutes", "Needs … to be open".
- [ ] Two-way as a switch ("The player can come back"), instead of drawing two connections.
- [ ] Make a connection from the card's menu ("Connect to …") as well as by dragging, so it works with keyboard and touch.
- [ ] Travel time set in the panel and kept in step with the map's routes.

**Deeper**

- [ ] Kinds of way, each a ready setup: open, door (locked, opened with a key or a check), hidden (not shown until found), one-way (a drop, a collapse), only at certain times (night, a given day), and with a check (climb, swim) whose failure leads somewhere else or costs something.
- [ ] A text for the journey, written by the author ("You climb down the wet ladder …"), used without AI and as a starting point for the AI.
- [ ] Consequences on other ways and choices: see "Choices and connections with consequences" under Explore 2.0. Build the simpler panel first, so the consequences have somewhere clear to live.

## Explore 2.0

Ideas agreed for after the current plan (phases 1–6). Not designed yet: each item needs a design decision before it is built.

### Share an adventure so others can play it

The game engine works without AI, so a shared adventure can be played with its written texts even by someone with no local model. AI adds free replies and reading of free text when a model is connected.

- [ ] **Adventure file.** "Export adventure" in Adventure Builder writes one file with the adventure and everything it uses: people, places, the world and its map, things, rule-set, narrator voice, body plans, factions and pictures. "Import adventure" shows a summary first and then adds the adventure, playable and editable.
  - Imported cards get new IDs and never overwrite the recipient's own cards.
  - The file has a version. Importing a newer version of the same adventure offers "Replace" or "Keep both". Games already started are not changed, since they keep their own copy.
  - Pictures are embedded. Export shows the file size and can compress pictures.
- [ ] **Play without spoilers.** A "play only" import opens the adventure straight into play and keeps it out of Adventure Builder until the player chooses "Open in builder". This prevents accidental spoilers but is not a lock, since the file can always be opened; say so in the interface.
- [ ] **Stand-alone game for itch.io.** "Export as game" in Adventure Builder writes a ZIP with `index.html`, the player and the adventure file, ready to upload as an HTML game on itch.io. Only the play view, no editor; built after the new play view, so the game has its theme and ornaments.
  - **Works without AI** for everyone: written texts and choices; free text is hidden or matched only against existing commands.
  - **"Playable without AI?" check before export.** The engine lists what depends on AI: scenes without a written arrival text, people without written lines, goals that can only be reached by free text, and invented residents that will not appear without a model. The author gets the list with a link to each place to fix it, a button to test-play the adventure with AI switched off, and a choice for the itch.io page: "Playable without AI" (recommended) or "Best with your own AI". Using AI while writing the adventure is fine; what matters is that the finished game does not need it.
  - **AI is an option** on a "Connect your AI (optional)" screen with a test button. itch.io runs HTML games in a frame on its own domain, so Ollama must allow that origin (`OLLAMA_ORIGINS`) and be restarted, and browsers may ask the player for permission to reach the computer's own services or block it (Safari). Show the exact origin to allow, step by step, and say plainly when it cannot work in this browser.
  - **Saves** live in the browser's storage for the itch.io frame, which can be cleared. Offer "Save to file" and "Load from file".
  - **Desktop download on the same itch.io page:** the same player built with Tauri as a Windows download, for players who want AI without browser settings, since it reaches the local AI the same way Explore does.
  - Check itch.io's current limits for HTML uploads (file count and sizes) and compress pictures on export.
  - The export reminds the author of rights to pictures and characters, and that itch.io asks creators to disclose AI-generated content. The game links to Explore's source code (AGPL).

Decisions to make first:

- [ ] Safety on import: the adventure's background and person descriptions are sent to the AI as trusted text. Show what an imported adventure contains before it is added, and mark it as imported. The engine still protects the game state, since the AI can never change it.
- [ ] Rights: pictures and cards may come from elsewhere (SillyTavern import, Codex manuscripts). Remind the author to share only what they may share, and decide whether a licence can be stated in the file.
- [ ] Personal content: the player's portrait and name from the You step are included unless the author chooses otherwise.
- [ ] A shared gallery with accounts and moderation is a separate project. Start with files.

Suggested order: adventure file → play without spoilers → web game.

### Choices and connections with consequences

Example: the player can bribe a guard or fight him. Whoever fights can no longer bribe him later. A choice can also open a new connection somewhere else, or close one the player already knows about.

The engine can already do most of this with facts (flags): a connection can require facts (`requiresFlags`), be kept closed by facts (`requiresAbsentFlags`, "Keep closed after these" in Storyboard) and record facts (`setsFlags`), and scene actions can set facts through their outcomes. What is missing is making it something an author can see and do without inventing flag names and typing the same name in several places.

- [ ] **Consequences in words.** On a choice or a connection, a section "What this changes" with ready rows: "Opens …", "Closes …", "Closes the other choices here" (bribe or fight), "Changes how … sees you". The author picks the connection, choice or person from a list; the facts are created and named behind the scenes and never shown as flag names.
- [ ] **Mutually exclusive choices** as one setting: mark choices in a scene as "only one of these", for example bribe, fight or sneak past. Choosing one closes the others for the rest of the game, or until a fact changes.
- [ ] **Consequences elsewhere.** A choice can open or close connections and choices in other scenes, also ones the player has already found. Show it in Storyboard: when a connection or choice is selected, lines to what it opens (solid) and closes (dashed) appear, using the routing in [storyboard-links.sv.md](storyboard-links.sv.md).
- [ ] **The player notices.** A connection the player knew that is now closed stays in "From here" as closed, with the reason in plain words ("The guard will not take your money after the fight"). A newly opened connection is marked as new, and both are noted in the journal. Nothing changes silently.
- [ ] **Check before play.** The adventure check warns about consequences that can never happen, connections that can never open, and choices that lock the player out of reaching the goal.
- [ ] Later: more effects on a connection than facts, the same as on outcomes (give or take an item, start a fight, pass time).

### Start page and cut-scenes

An adventure should be able to open with its own start page, and to tell parts of the story that the player watches rather than plays: an introduction, a journey, something that happens.

Today an adventure has "Intro for the player" in Adventure Builder (`playerIntro`). It is shown on the adventure's card on the home page and in the "Choose where to enter" box, but not when the adventure starts in the play view. The arrival on a new place (step 8 of the play view) is the only moment of its kind in play.

- [ ] **Start page.** Title, cover picture, the intro text (`playerIntro`, also shown when the adventure starts), the author, how long it takes, "Playable without AI" or "Best with your own AI", content notes, and "Begin". Shown when the adventure starts and when it is opened from a shared file. It is also the page an itch.io export opens on.
- [ ] **Cut-scenes** (design decision: [cutscenes.sv.md](cutscenes.sv.md)). A scene the player watches: text (and optionally a picture, music and a short delay per paragraph), then "Continue". Written by the author, so it works without AI; with AI the narrator may only read it out in the adventure's voice, never change what happens. No choices in it, and the engine state does not change while it runs, except for what the author puts on its end (facts, travel time).
- [ ] **What starts a cut-scene.** Three triggers, the same in every adventure:
  - **A connection is taken**: a journey on the way ("Three days on the road …"), shown before arrival, with the connection's travel time.
  - **A scene is entered**: the first time only (the default), or every time. The opening of the adventure is this trigger on the first scene, after the start page.
  - **Something becomes true**: an event when a fact is set ("When the gate is open, the bells start ringing …"), also when it happens in another scene than the one the player is in. An ending is this trigger on the goal (an epilogue, one per ending).
  - Each cut-scene is shown once unless the author says otherwise. When two are due at the same moment, they come in the order: connection, then fact, then scene.
- [ ] **In Storyboard** a cut-scene is its own kind of card, with a different look from playable scenes, so the author sees the rhythm of play and watching.
- [ ] **In the play view** it takes over the middle column in the theme's frame, with "Continue" and "Skip" (and a setting to always skip seen ones on a replay). It is kept in the story log and the journal, so the player can read it again.

Ties in with "A text for the journey" under *Connections: clearer, simpler, deeper*, the When / If rules under *Ideas from RPG in a Box*, and the itch.io export, which opens on the start page.

### Character values that colour the story

Example: a Horror rule-set with Sanity. Low Sanity makes descriptions hallucinatory, people react to the player's state, and some choices change. The same mechanism works for exhaustion, drunkenness, injuries, reputation or an attribute such as Charisma, so build it generally, not as a horror feature.

- [ ] **Value bands in the rule-set.** A rule-set maps ranges of a value (for example Sanity above 60, 30–60, below 30) to three things:
  - **Narrator tone:** a short instruction the AI uses for arrival texts and narration, such as "details feel wrong, sounds without a source".
  - **People's attitude:** how characters react to the player in that state (nervous, suspicious, not taking them seriously).
  - **Available choices:** choices that appear or disappear, such as a panicked option, or a persuasion option that needs high Charisma.
- [ ] **Works without AI.** Authors can write alternative scene texts and outcomes with conditions on a value ("when Sanity is below 30"), so shared adventures work with no model connected.
- [ ] **Hallucinations never lie to the engine.** The AI may describe things that are not there, but they never become game objects or commands. "What you know" stays true; what was experienced in a low state is saved as uncertain ("You think you saw …"). An illusion the player can interact with is authored as a real thing with the condition "visible only when Sanity is low", so the engine decides.
- [ ] **Connections and journeys too.** The same value bands colour how the AI describes a connection and the way to it: a corridor that seems to breathe, a door that was not there a moment ago. As everywhere, this is only description: a connection the AI describes but the engine does not have can never be taken, and a real connection is never hidden by a hallucination unless the author has made that a rule.
- [ ] **Shown in the play view, sparingly:** a faint vignette, text that occasionally flickers, or worn frames (see [ornaments.sv.md](ornaments.sv.md)). Always off with reduced motion and "Simple frames".

Decisions to make first: whether value conditions share the same form as discovery conditions (`requiresFlags`), and how the player sees which state they are in without numbers taking over.

### Ideas from RPG in a Box

Compared with [RPG in a Box](https://rpginabox.com/), a tool for making graphical role-playing games.

- [ ] **Dialogue as a flowchart.** A conversation tree per person in a scene: what they say, the player's choices, conditions and effects. The tree decides; the AI gives voice to free talk around it.
- [ ] **When / If / Then rules.** Effects can today only be the outcome of an action. Let the author also attach them to events: "when the player arrives here", "when this discovery is made". The idea is already described in [rule-based-play-plan.sv.md](rule-based-play-plan.sv.md). Built from ready blocks; no scripting language.
- [ ] **Encounters on the map.** Map places and routes already have an encounter setup (frequency, participants, tone) that nothing reads. Let the engine decide whether and who, and the AI narrate. Fits "encounters along the way" in free play (phase 5) and [game-time-and-journeys-ideas.md](game-time-and-journeys-ideas.md).
- [ ] Equipment that adds to values (rings, armour), and more than one currency.
- [ ] Abilities with effects that can be used in combat, besides weapons. Needs a rules decision on what an ability may do.

Not for Explore: voxel art, grid maps, real-time combat, a scripting language of its own.
