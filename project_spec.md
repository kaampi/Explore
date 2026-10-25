# AI Sandbox Engine — Project Spec

Living status against Master Specification v2.2. The core rule has not changed:

> **State Engine owns truth. The AI proposes. The player can override. Memory is history. Context Engine decides what the model sees.**

The original six phases below are the Master Spec roadmap. Phases 1–5 are in the product. Phase 6 is not. Studio, Adventure, canon, objects, spatial writes, party, closeness, and UI pictures grew on top of that roadmap and are now part of what we ship.

---

## Principle in play

- Nothing outside `StateEngine` writes canonical session state.
- Pass 1 streams prose. Pass 2 may propose lockable mutations. The player can reject layers, lock fields, and undo.
- Dialogue is not the map. Canon is the current scene, ground story, active place notes, and **objects placed in the scene**. Ground story and the object list are writer fact; a character only knows what they have seen or been told. Hearing a name is not having lived that past. A thing the player shows is only the words they used — Pass 1 does not invent a famous owner or a hidden history for it.
- The player controls only their own body. Lines that dictate what a character does or says are wishes, not facts. Asking for a kiss or hug is a request; live meters decide whether it happens this beat. A night, a time-skip, or walking back to the bar is the next beat of the same scene — not a new customer, and not a new crisis, unless an authored **once-beat** is firing this turn.
- Attributes (rule-set fields) are labels the model can read. They are not dice. Pass 2 may **nudge** a number only when that field’s **Move / beat** (`maxShift`) is above 0 — closeness meters, not a fight. Default 0 keeps Styrka still. Checks, object rolls, and combat are not wired. The live pattern to extend is **Favor** (engine d100, Pass 1 narrates). A later CheckEngine starts at object cards (`checkAttribute`), player-tapped, scale-normalized like trait bands — not a D&D ruleset and not Pass 2 rolling on its own. If a fight is ever resolved, **the engine owns the outcome, then Pass 1 narrates it**. (Friends & Fables had to take 5e combat off by default after AI-narrated mechanics proved unreliable.)
- Pictures (portraits, place thumbs, chat backdrops) and **place audio** are **UI only**. They are never assembled into the prompt.
- The public bar is dressed. An undressed state stays in a private room unless the player said they'd walk out like that. Walking back to work restores indoor clothes (an apron if they tend bar). Live wearing and holding are tracked as fact, not assumed: an undressed character has no dress pocket; empty hands are empty.
- Until a given name is spoken in chat, narration uses Pronoun (`she` / `her`, `he` / `his`). The writer still knows the true name so they can introduce themselves. There is no nickname field — a name the player has not heard is not on the card.

UI is English. Engines are framework-free TypeScript; React (`src/ui/`) consumes them.

---

## What we have now

### Conversation workspace

Home and **My conversations** support multiple saved conversations with unique IDs, recent entries, search, custom names, reversible archive/restore, and a separately retained theme/background per conversation. Switching restores the snapshot into a fresh engine instance; histories, relationships, and runtime story flags stay isolated. Runtime flags do not update the shared campaign template. Starting a new scene keeps the old conversation; an explicitly drafted handoff is scoped to its source conversation.

Database v10 adds a lightweight conversation index. The existing `demo-session` and other older snapshots are indexed in place. Unreadable records are retained and reported. Appearance preferences gain additive per-conversation snapshots; sharing remains step 2.


### Engine (Master Spec Phases 1–5)

**State.** Zod canonical session: characters (lockable position, mood, pose, energy, clothing, holding, optional stats, pronouns, UI portrait), scene (location, environment, optional venue/room pictures), story, narrator voice, rule-set, player (lockable position/status plus optional name, looks, who they are, pronoun, UI portrait, rule-set labels), party (`partyIds` max 3, `partyPendingIds` max 2, `partyHoldIds`), Pre-defined Replies, relationships (lockable trust / familiarity / tension), layers, memory, conversation, events. Proximity zones exist on the schema; they are not used as live spatial logic in play.

**State Engine.** Mutation pipeline: resolve lockable target → coerce → authority/lock → state version → commit. AI cannot invent lodging (`spare room`, `hotel`, …) unless that phrase is already in scene, story, place notes, or placed objects. Named rooms in canon (including `Emmas room`) are real; Pass 2 may not collapse them back to the venue title. Event log, undo, lock changes, layer add/remove/compact, conversation append/edit.

**Spatial (player body).** Walking, entering, climbing, or going to bed in a named room is engine truth, written as `player_manual_state` before Pass 1 (`playerDestination`). Chat has a **Go** row: focals reachable from Here (Reachable from on the place card), plus the landmark when they are in a side room. On the landmark floor, Go also lists **other landmarks in this realm** — a tap swaps Here (rooms, intro, pictures) and walks the player and traveling companions there. Leave a side room to the floor first. Chat has **My Party** (your portrait plus three companion slots) and **Prospects** (two grey waitlist slots). A volunteer to travel — Pass 2 `party.offer`, or join phrases in the reply — lands in Prospects. They cannot force themselves into the party, and the player cannot tap someone in from Cast. Tap a Prospect to recruit (only while still on tonight’s map, and only if a party slot is free). Max three in the party. Traveling members follow Go and typed walks. **Stay** under a portrait keeps the slot but they do not walk until **Come**. Tap an accepted portrait to drop them back to Prospects. Direct Pass 2 writes to `partyIds` / `partyPendingIds` are rejected. A focal **Door** may be always open, visible but closed until opened, or hidden until named. Closed/hidden lift when chat hits Also match words, a listed Reply goes there, or the player opens it in Inspector. A tap is the same walk as typing it. A focal may list **Reachable from**; walking and the Go row only use those links (empty = from the landmark floor, not from every other room). Also match then only counts from those rooms (a hatch in Main room, not from outside). The player’s own body is not a favor. Co-location in a private-room / in-bed beat can move the focused character with them. Inspector `here` is the current room, not the bar jazz, when the player is in a side room. The current room’s **prompt** (`brief`, or the intro if that field is empty) is trusted state (`Here`); walking in tells Pass 1 to establish the space from that text. The long **intro** is player-facing (chat typewriter and Cast) and is not sent when a prompt is filled.

**LLM.** Provider-agnostic streaming adapter. Production play uses local **Ollama**. Default model: `stheno-custom:latest` (the picker snaps to the first installed model if that name is missing). Pass 1 = dialogue. Status-bar **reply** sets Pass 1 `num_predict`: short 96 / beat 128 / long 160, plus 64 tokens of headroom so the last sentence is not clipped. Pass 2 is uncapped. Pass 2 = structured proposals with tolerant JSON recovery. Layer proposals and optional layer compaction are separate Pass-2-style calls. Pass 2 failure never fails a turn whose prose already reached the player.

**Context.** Budgeted assembly (target 3,500 / hard ceiling 8,000). Instruction hierarchy (writing instructions, not in-world law > narrator > story > state > layers > memory > dialogue). Untrusted blocks wrapped. State summary includes scene, player (name and looks when set), party / prospects / stay, characters, meters, stats, listed objects, named rooms, and **Here** (the current place or room prompt) — never data-URL pictures, never the long typewriter intro when a compact prompt exists. Standing **core identity** (personality and always-on lore, no keyword gate) is required like Here — chat overflow must not make a bartender forget the bar. Keyword lore, relationship notes, memory, and old chat still trim. Pass 1 writes **third person, present tense**, one beat (not a chapter or epilogue). Until the given name is heard in chat, Pass 1 narrates the public label, not Emma. The player's body is theirs — Pass 1 does not invent sensations or reactions the player did not write themselves. Hearing a name is not shared history; Pass 1 does not invent family ties among people the player mentioned. Player lines that puppeteer an NPC are split before the model: the player’s own action is fact; the NPC claim is rejected.

**Closeness.** Live trust / familiarity / tension plus rule-set numbers (e.g. Trygghet, Värme) are labeled in Pass 1. Authored **high/low/mid trait meanings** travel with the live band of each number. A **warm beat** (kiss/hug when asked) gates on relationship trust (always 0–100) plus the live **band** of the one rule-set field marked **Closeness signal** (`role: "desire"`) — not raw 50/80 on a 0–100 scale. A 14/18 high fires; a high Boldness does not, unless that field is the marked signal. No field marked: trust alone. Live meters outrank a reserved mood, a bartender job, or “slow to open up”. There is no separate romance-mode flag. Favor (d100 vs trust) is **rooms and objects only** — not hugs.

**Session.** State machine (idle → awaiting_response → streaming → extracting → committing). Turn idempotency. **Regenerate** the last NPC beat from a turn manifest (optional player note is a writing instruction, not a spoken line). **Replay** an earlier beat: later chat is undone, then Pass 1 runs again. Player message is committed and shown before tokens stream.

**Memory & layers.** Episodic / semantic / relational memory. Standing **notes** (character / place) are who someone is and what a place is. A chat recap is only what happened in beats that left the live window — it is told not to copy those notes. Recap fires when the 8,000-token ceiling would drop beats, when a count-based batch is due, or when the player changes named room / venue (bar talk closes; the doorway stays live). Core, relationship, environment, and state-trigger layers. **Once-beats** (Campaign Builder **Triggers**, or Cast → Place → + Once beat) are player-approved layers that fire at most one turn: typically `return_to_bar` plus tokens already in play (said in chat ever, or in someone's hands). After that turn the engine marks them spent. AI-proposed layers are created **inactive** for player review — except AI **environment** notes that invent a room or creature not in canon, which are discarded (same WorldCanon bar as Pass 2). Player Compact merges similar notes. Inactive layers do not enter context. **Keyword layers:** an approved layer with `keywords` is in context only when recent chat hits one of those words (last 8 turns, whole-word / phrase). Unapproved layers never wake. Dormant keyword lore is not WorldCanon.

**Persistence.** IndexedDB. Session schema version 2. Library stores through DB v9 (characters, places, **realms**, stories, voices, rule-sets, objects, campaigns, studio prefs). Sequential migrations; invalid records fail load instead of poisoning the DB. The top bar **Export library** / **Import backup** writes one JSON of saved shelves (not live sessions). Import upserts by id and does not delete cards that are only on this machine. Port 5173 and 5174 are different archives. A **realm** (City of Dunbaar) owns **landmarks**; **focal points** are rooms on the landmark. The landmark is the default Here; focals are extra rooms. Realms and places may hold pictures, ambient loops, a player intro, and **For the model**. Pictures/audio are UI; realm media fills chat only if the landmark has none. At Start the session stores `scene.realm` / `realmNote` / `realmBrief` / `realmVisual`. Pass 1 gets Here (landmark or focal) plus a short `Realm — {name}:` line — not a city essay. Campaigns pick a **realm** on General; all landmarks in that realm are in the campaign. A scene copies onto a session at Start, including Triggers as once-beats. The live session stores `campaignId` / `sceneId`. **new scene** clears the night and opens that campaign on Scenes. Chat and trust do not carry. A short **handoff** does: why they arrived (the agreement). Cast and Scenes can edit it. Start copies it as trusted Pass 1 (`Why they are here`). Empty = a new meeting. **Story flags do carry**, unlike chat and trust: the campaign itself now has its own `storyFlags`, seeded onto the session at Start; as `setStoryFlag`/`clearStoryFlag` fire during play, the running session syncs its live flags back onto the campaign record, so the *next* Start in that campaign — even of a different scene — opens with them already set. A campaign save (the ordinary **Save campaign** button, not just Start) now round-trips every field it holds, `storyFlags` included — it used to rebuild a hand-picked subset and silently drop anything not on that list (`sceneLinks`, `chapters`, `placeIds`, `placeLens`), which would have quietly erased a built Storyboard on the very next save.

**Play UI.** Three zones: Cast (layers, meters, campaign intro if any, place thumb and intro for *here*, objects in the room) · Chat (streamed Pass 1, character portraits in NPC bubbles, place intro overlaid on the room/venue backdrop, no narrator/place title bar, **My Party**, **Prospects**, and **Go** rows) · Inspector (canonical snapshot, **prompt size** vs 3,500/8,000 with a breakdown, mutation chain, undo). Tap a chat beat to inspect that turn’s chain. Inspector also shows party / prospects / stay and the reply cap. Status bar: same prompt estimate, model picker, **reply** length, new scene. Inline edit of dialogue.

### Studio (not in the original six phases)

Library shelves, independent of any one session. A card’s name is the title: click the pencil line and type. Other fields stay below.

| Shelf | What it is |
| --- | --- |
| Characters | Archive identity on a 960px sheet: given / middle / family name, optional **Approximate age**, **Personality**, typical mood, pronoun, Looks, portrait, and **tags**. Library shelves (Characters, Locations, Objects, Voices, Stories, Rule-sets) use a **520px** two-column portrait list; Campaigns does not. **Create new** and **Import SillyTavern** sit side by side; **Male / Female / Imported** checkboxes filter the character shelf (unchecked = everyone). Example Emma is not a locked row (she still exists for **Load the bar example**). Keyword **lore** lives on that person in **Campaign Builder**, not on the archive card. Field labels are uppercase. Narration uses the given name once it has been spoken in chat; until then Pronoun (`she` / `her`, `he` / `his`). Pronoun sits under the portrait. Scene position and rule-set stats are not on the card. |
| Locations | **Realm → landmark → focal** as three columns. Realms use the two-column portrait shelf; **Landmarks** and **Focal points** stay one column (narrower). Landmark **tags** (bar, oasis) are this shelf only. A realm **Intro** is a postcard (a couple of short paragraphs). **For the model** is two or three facts for Pass 1 (`Realm — City of Dunbaar:`) — not Here, and not a tour of the city unless they leave this landmark. The long atmosphere (souk, night, intrigue) is **not** on the realm card: it is the campaign **Intro for the player** (Cast, never the prompt). Pictures/audio are UI; they fill chat only if the landmark has none. **City of Dunbaar** is the example realm; **The Aurora Room** is its landmark. The **landmark** is the default Here (the bar, the cabin). Extra focals are rooms: Emma's room, cellar, toilets, guest room. The form is the last thing you clicked. Venue fields live on the landmark; a room has its own intro, Here text, pictures and sound. Pass 1 reads Here for the current landmark or focal. |
| Objects | A named thing that can sit in a room. **Tags** (relic, key) are this shelf only. Optional home story/place is a hint, not a lock. Optional weight / difficulty / check attribute are stored for later checks. No object pictures yet. |
| Voices | Narrator instruction (how the scene is told). |
| Stories | Ground story / premise (what the world is). Optional; a campaign can hold this as its start prompt instead. |
| Rule-sets | Named bundles of attributes. Characters do not own the fields; a campaign picks a set and fills values on cast. Each number field has **high / low / optional mid** meaning (legacy single meaning still works). Write `{{char}}` / `{{they}}` / `{{them}}` / `{{their}}` / `{{themselves}}` — the engine fills them from that NPC's given name and pronoun. Do not hardcode She. Bands follow that field's own min–max (0–100 or 1–18). The matching band is trusted Pass 1 fact. **Closeness signal** (at most one number field) is the meter for a warm beat; Boldness is not a built-in gate. **Move / beat** (`maxShift`) is how far Pass 2 may shift the number; 0 stays put. A text field may list **choices** as chips (Calm / Wary / Bold is a one-click start); `+` adds more. Adventure picks from those chips, with `+` for a one-off. Empty choices stay free text. |

**Adventure** is a one-off assembler. **Campaign Builder** is where the shelves become a playable night. A left panel lists **General · You · Characters · Objects · Scenes**; the form for that part sits to the right. **General** holds the model, **realm**, rule-set, narrator, **Intro for the player**, and **Background for the story (What AI knows)**. **You** is the player sheet for this campaign (given name, portrait, pronoun, looks, who they are, rule-set stats as labels). Not a Characters-shelf card, not in Who is here. Start copies it onto the session; Pass 1 may use the name, looks, and those labels. The portrait is UI only. Pass 2 still only moves `player.position` and `player.status`. The realm is the map: every landmark under it belongs to the campaign. A scene's **Where** is a landmark plus **Starts at**: the landmark’s name, or a listed focal. Start writes the player there (Here). Keyword lore for a person is authored on that campaign member (Characters), not the library card. **Look for** is a tag lens on that shelf only: character tags on Characters, object tags on Objects. All / Unsorted / a tag hide the left list, not who already belongs. On Characters, **Young / Adult / Elder** (≤25 / 26–54 / ≥55) further hide the shelf by **Approximate age**. Tags live on the cards. Scenes are not tagged; they already belong to a campaign. Library shelves still create the cards. After play, **new scene** returns to that campaign's Scenes (chat and trust from that night are gone). **Pre-defined Replies** may be several triggers, each with **Triggered by** words and up to three ready-made reply buttons. A tap is that line as the player’s turn — not a line the cast has to speak. They stay hidden until that trigger’s words are in chat. Empty Triggered by: someone in the scene invites them along, or the player tries an off-map leave (hotel, street, sleep). First matching words win; leave/invite uses the first trigger with no words (else the first). Then the box is gone and only those buttons count. Other triggers on the scene may still wait. Asking “do you have a room?” is still chat; listed rooms are the answer, not a hotel. **Goes to** may be a listed room, the landmark, or **this beat** (no new room — a lie, a door, a stone). Typing a listed room still counts as going there. Empty list means no fork. Not a graph and not a later visit yet. Returning to the landmark is `at the bar` when the place is a bar; otherwise `at {landmark}`. Room names and aliases come from that place card (labels and keywords), not a hardcoded Emma or bar. **If they come back** (Triggers) copy onto the session as once-beats: if tokens are already in play and they return to the landmark, that prose fires once. A night away counts too.

SillyTavern character import opens a review: raw card text on the left, our fields on the right. Prefill `name` (drop Princess/Lord), `personality`, Looks from `Body/Appearance=` or `description`, age/pronoun from fields or prose, PNG as a JPEG portrait. Nothing is saved until Import. Skip `scenario`, `first_mes`, and `mes_example`. **Compact** (Ollama) proposes shorter Looks, typical mood, and personality from Appearance/Personality only (not world, side characters, or RP rules). Looks prefers overall shape (athletic, petite, stocky) over specific body-part descriptions — the player may still write belly or chest; Compact must not invent one. Compact does not invent romantic or sexual framing; if the player's own text already has it, it may stay. Drops clothing descriptions, explicit content, ST-specific tags, orientation labels, and family NPCs; the player keeps or edits; Undo restores the previous three fields. Same Compact lives on an already-saved character sheet.

### Live state the model may move

Pass 2 may write, when unlocked and grounded:

- `characters.{id}.position | mood | energy | clothing | holding | pose`
- `characters.{id}.stats.{field}` when that field's **Move / beat** (`maxShift`) is above 0, clamped to ± that amount and the field's min–max
- `relationships.{id}.trust | familiarity | tension` (small absolute shifts)
- `player.position | player.status` (sleep stays in the established scene; no invented bedrooms)
- `party.offer` (id or given name) — fills **Prospects**. Not a lockable field. Direct `partyIds` / `partyPendingIds` writes are rejected. The player still taps to recruit.

A player request of a character for a **room or object** is a **d100 vs trust**: grant only when the roll is lower than live trust. A grant still has to fit this scene — it does not invent rooms or objects. The roll is not about closeness. The player's own body (I sit, I leave, I fall asleep, I kiss) is not a favor.

**Group scenes.** Each turn has one focus (portrait, SPEECH, Pass 2 meters). Named address wins; then a unique he/she pointer ("the man", "bredvid en tjej"); then the last speaker; then the first cast member. Others in the room stay in the beat and may react. Pronoun on the card is what makes "a man" find Pierre.

Looks on the character card is body and face. Outfit and handheld things are scene fields. Empty holding means empty hands.

`maxShift` 0 (the default) keeps Styrka and Orientation still. Approving a layer does not by itself change meters. A kiss raising Värme is a nudge. A sword hitting AC is not — that would be engine resolution, which we do not have and are not asking the model to fake.

---

## What we do not have yet

### Master Spec Phase 6

- PIN/password-protected export (AES-256-GCM, Argon2id/PBKDF2)
- Crypto work off the UI thread (`src/crypto/crypto.worker.ts` is still a stub)
- Diagnostics / SLA (TTFT, latency, tokens) — `src/diagnostics/DiagnosticsEngine.ts` is still a stub. Inspector prompt size is a **heuristic** (~4 characters/token) for the budget trimmer, not SLA telemetry.
- Privacy model spelled out for local vs remote LLM
- Encrypted / PIN export of sessions (AES-256-GCM). Plain JSON **library backup** is in the Studio top bar.

Phase 6 does not block play, Studio, or context slices.

### Designed, not built

- **Checks vs meters.** Trust / Värme already **gate closeness in Pass 1**. Trust is 0–100. The desire signal is the marked field’s **band** (same high/low/mid as Pass 1 meanings), so a 1–18 scale works. Authored high/low/mid trait meanings are in Pass 1 as required state. Number attributes used as *dice checks* (strength vs a stone) are not wired. Pass 2 may move a **cast** rule-set number only when that field's `maxShift` is above 0. Campaign **You** stats exist as Pass 1 labels (same as cast); they are not dice, and Pass 2 does not move them.
- **Object rolls / CheckEngine (later).** Object cards already store weight / difficulty / `checkAttribute`. Nothing rolls them. When they do: a new isolated `CheckEngine` (pure code, no LLM, same test shape as StateEngine). Input `{ attribute, character, difficulty }` → `{ roll, target, success }`. Reuse the Favor pattern already in play (d100 in code; Pass 1 only narrates). Normalize the live number onto 0–100 with the same per-field min–max as trait bands: `(value − min) / (max − min) × 100` — do not hardcode a 0–100 threshold (that was the warm-beat bug). **Player-initiated** only: a Cast/object button (“try to lift the stone”), never Pass 2 deciding to roll. The outcome is required Pass 1 fact, like Here or a band meaning. First and only check type until that feels right: **object interaction**. Not skills, saves, or combat on day one. Do not import a RoleForge/D&D architecture — generalize Favor. **3D dice (UI only):** `@3d-dice/dice-box` (BabylonJS + AmmoJS, web workers, React examples; same family as D&D Beyond / Roll20 rollers). Lives in `src/ui/`, never in an engine. CheckEngine still owns the number — the box is the throw the player sees, not a second RNG. Same rule as portraits and place audio: not assembled into the prompt.
- **Combat / 5e-style resolution.** Out of scope until object checks are proven. Same order as Favor: engine owns the outcome, then Pass 1 narrates. Friends & Fables had to take AI-narrated 5e combat off by default; do not start here.
- **Object pictures.** Same UI-only pair as places (thumb in Cast, high-res reveal when the player actually holds the thing). Pickup is not first-class inventory yet (`holding` is a free string).
- **Relative positioning / proximity zones** as live play logic.

### Context slices (not new Master Spec phases)

These are product increments on Phase 2 (context) and Phase 4 (layers), plus library import. They are **not** Phase 7–10. Phase 6 (crypto/diagnostics) is a different thread and does not block them.

Do not clone SillyTavern World Info (probability, sticky, recursion, scan-depth UI, regex keys). Chat-as-canon stays out.

| Slice | Size | What “done” means |
| --- | --- | --- |
| **Macros** `{{user}}` / `{{char}}` | Hours | Expand in voice, story, layers, and character text at assemble time. The player already has a display name and looks on the session (Campaign **You**). Rule-set trait meanings already expand `{{char}}` / `{{they}}`. |
| **Greeting + example dialogue** | Deferred | `first_mes` / `mes_example` are a play kit, not archive identity. Skip on import. If we want them later: greeting seeds the first NPC turn; examples are a style block, not fake chat history. |
| **Keyword layers (MVP)** | **Shipped** | Player-enabled layer + keyword hit on recent chat → inject this turn. Cast shows waiting vs awake. Unapproved layers never fire. Dormant keyword lore is not canon. Not ST World Info. |
| **Character book on import** | Follower | V2/V3 `character_book` → keyword layers. Now possible. |
| **Insertion depth** | Later, maybe never | ST “after message −N”. We already budget by priority and send chat as real turns. Only if keyword lore lands in the wrong place in the prompt. |

Order remaining: macros can ship anytime; greeting/examples stay skipped unless we add a scene opening later; character-book import rides on keywords; insertion depth only if needed. Object pictures / pickup-reveal stay a separate thread from Phase 6. Object rolls wait on CheckEngine (object interaction first). Combat stays behind that.

---

## Original phases (checklist)

### Phase 1 — Core architecture and data model — **done** (caveat: proximity unused in play)

Minimal canonical model, State Engine, event log, IndexedDB, schema versioning, system invariants and tests. Scene positioning *schema* includes intimate / personal / social; play does not simulate it yet.

### Phase 2 — Context engine and core pipeline — **done**

LLM adapter, budgeted context, Pass 1 streaming, pre-turn snapshots, temperature/seed on the session. Production provider: Ollama. Pass 1 closeness and prompt-budget inspect sit on this phase.

### Phase 3 — State mutation and policy — **done**

Pass 2 extraction, validation pipeline, authority/locks, instruction hierarchy, session state machine, turn idempotency, tolerant structured-output recovery. World canon + favor (rooms/objects) sit here.

### Phase 4 — Memory and layers — **done**

Memory types + retrieval into context, rolling condensation, layer types and activation, AI-generated layers through State Engine, player compact.

### Phase 5 — UI and inspector — **done**

Three-zone play UI, inspector mutation chain, undo, regenerate, **replay** of an earlier beat, inline edit, prompt size, reply length. Studio + Adventure are extra surface on this phase (including place/room pictures and chat portraits/backdrops). My Party / Prospects / Stay / Come sit here.

### Phase 6 — Performance, security, diagnostics — **not started**

Encryption, workers, privacy model, SLA, diagnostics. Migration engine for *sessions* already exists from Phase 1; library store versioning is IndexedDB `onupgradeneeded`, not MigrationEngine.

---

## Tests

Vitest covers engines in isolation (invariants, session turns, context, layers, memory, persistence, library, spatial writes, party, scene backdrop). Each new surface extends that suite. Phase 6 still needs integration/SLA tests when those components exist.

