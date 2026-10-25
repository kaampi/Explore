# AI Sandbox Engine

Modular, provider-agnostic sandbox for interactive AI-driven scenes.
Based on Master Specification v2.2. Core rule:

> **State Engine owns truth. The AI proposes. The player can override.
> Memory is history. Context Engine decides what the model sees.**

Living status (what is shipped vs still open) lives in [`project_spec.md`](project_spec.md).

UI is English. Engines are framework-free TypeScript; React (`src/ui/`) consumes them.

## Stack

- **TypeScript (strict)** — shared contract across module boundaries.
- **Vite + Vitest** — dev loop and tests. Engines have no framework lock-in.
- **Zod** — canonical session, library templates, LLM structured output, import.
- **React** — UI only (`src/ui/`).
- **fast-check** — property-based tests alongside Vitest examples.

## Getting started

On Windows, double-click **`start.bat`**. It installs dependencies if needed, starts Ollama when the CLI is installed but not answering, then opens the app in your browser. Leave that window open while you play.

```bash
npm install
npm run test         # vitest
npm run typecheck
npm start            # Vite, opens the browser (http://localhost:5173)
npm run dev          # same server, no browser
```

Play uses a local **Ollama** server. See [Using Ollama](#using-ollama).

First load opens **My space**: continue your saved conversation, create a character with just a name, import a character card through the library, or explore an existing world. **Create & chat** starts without a world file, campaign, rule-set, or prepared storyline. The built-in Emma example offers an immediate first meeting. Library tools and Campaign Builder remain available from the sidebar. Saved conversations stay available while you browse Home and Studio. Starting another creates a separate conversation and keeps the previous one.

## First conversation

Home offers **Create & chat** with only a name, character-card import, and the built-in Emma example. Creating characters and exploring themes work without an AI connection. A shared connection check finds Ollama, lists chat-capable models when capability metadata is available, and explains an unreachable server, an empty model list, or a missing saved model. Older Ollama releases without capability metadata remain compatible.

A ready connection stays out of the conversation's way. Otherwise **Set up AI** offers installation/start instructions, a retry, and an installed-model selector. You can write a draft while disconnected; sending, replaying, regenerating, and AI-driven travel wait for a usable connection. Reconnecting and changing models never automatically sends the draft. Model preferences are saved locally, and an existing conversation keeps its own model until you explicitly change it.

The connection check inspects model metadata, not a sample conversation, and does not download a model. Actual reply generation still depends on the selected model running successfully on your computer.

## Conversation library

Every new conversation gets a unique ID. Home shows recent conversations; **My conversations** adds search, custom names, and reversible archive/restore. Continuing a conversation restores its own history, relationships, story flags, model, and appearance. Unsent drafts are kept per conversation for the current browser tab when switching. The last selected non-archived conversation is available after reloading.

Creating a conversation never replaces an existing one. **new scene** in Settings keeps the current conversation and opens scene setup. If you explicitly continue into another campaign scene, its handoff can be drafted from the conversation you just left. Runtime story flags stay with their conversation and are no longer written back into the reusable campaign template; separate explorations start from the authored campaign settings.

Snapshots and their library metadata are saved atomically. The library reads a small index rather than loading every history and background image. Rename and archive state survive autosaves. There is no permanent-delete action in the conversation UI.

## Your soundtrack

Open **♫ Sound** in the play toolbar to add your own MP3, OGG, WAV, M4A, AAC or WebM tracks (up to 50 MB each). Choose one track, set volume and loop, then press **Play soundtrack**. Adding a file, changing tracks, resuming a conversation or returning from Home never starts soundtrack playback automatically. Playback stops when leaving the play view. Browser codec support determines which files can play.

Tracks are shared across your local audio library; track selection, volume and loop are saved separately for each conversation. Files are copied into this browser's IndexedDB, so the original does not have to stay in place. They are not uploaded, sent to AI, or included in session/library exports. Keep your own copies: clearing browser data removes this library. Removing a track explicitly clears its selection in all conversations. Existing place/room ambience has separate controls and can play alongside your soundtrack. No bundled tracks or streaming-service integrations are included.

## Import lorebooks

**Lorebooks** accepts SillyTavern World Info JSON, embedded V2/V3 character lore (JSON/PNG), and V3 lorebook JSON. Review entries and explicitly select supported ones to use SandboxAI’s existing activation rules. Unsupported/disabled entries stay dormant, and the original is retained. Link a book to a character, campaign or all new conversations; saved conversations keep their own snapshots. Character import offers embedded lore in the same review and saves both together.

Imported lore has a separate context limit and does not establish the world map. Library backups include lorebooks and original data. See [supported behavior and limitations](docs/lore-import.md).

## Import external worlds

**Lorebooks** also imports AI Dungeon Story Cards, OnlyWorlds world JSON and Azgaar Full/Minimal JSON. Format detection is automatic, with an explicit selector available. Review entries as usual. **Also create a world in my library** optionally creates a new world and only the selected, typed characters/places in one atomic save. Otherwise the file remains optional lore. Existing cards and conversations are preserved.

Choose the imported world, a place and a character from Home to begin exploring. Azgaar contributes places and world knowledge; use or create your own character. Source scripts, combat systems, map geometry and external images are not reproduced. Source IDs and originals remain available. See [formats, mapping and limits](docs/world-imports.md).

## Capture ideas

In play, use **Save as idea** on a message or **Capture ideas** to select several messages. Edit the title, description and type (Plot, Character or World), then save. **My ideas** is available from play and the Home sidebar. Ideas keep snapshots of only the selected messages, independent of later edits or archive actions.

**Export JSON** uses StorybookAI’s existing manuscript importer: import the file as a manuscript, then open **Brainstorm**. Each idea becomes a card in a **new, separate idea manuscript**, with no locked facts, synopsis or chapters. Exporting never targets an existing book. To use an idea in an existing manuscript, choose **Copy idea** and paste it into a Brainstorm card there. The JSON includes the saved idea and selected source messages; StorybookAI imports the card text. No StorybookAI changes are required. See [the export contract](docs/idea-export.md).

## Your space and appearance

The shared header connects SandboxAI with StorybookAI and ComicbookAI. When running locally with `npm start` or `npm run preview`, it checks StorybookAI at `http://localhost:5175/` and ComicbookAI at `http://localhost:5176/`. A verified running app opens directly from its header link; otherwise its presentation offers installation information, Try again, and a configurable address. Checks repeat every 30 seconds while visible and when the window receives focus. Unreachable means the app cannot be reached, not that it is uninstalled. Remote addresses can be opened manually; automatic probes stay on loopback. The hosted/static preview has no local status backend and keeps the presentation available.

In play, the conversation is central. **Cast**, **Settings** (including the model picker), and **Inspector** open on demand. **My space** returns home without deleting the current conversation. **My conversations** lists your active and archived conversations. Starting another keeps the current history, relationships, and state in its own saved snapshot.

Open **Appearance** from Home or play to choose Light/Dark for the app frame and one of four independent play themes: Parchment, Forest dusk, Neon city, and Quiet conversation. Adjust colors, panel opacity, background dimming, font, text size, and reading width with a live preview. Backgrounds can follow the scene, stay on your own uploaded image, or use a plain color. PNG/JPEG/WebP uploads are limited to 10 MB and resized locally to a maximum edge of 1920 pixels.

The status server first checks `/.well-known/storycore-app.json` for a matching `appId` and optional `version`. Existing sibling releases are recognized by their exact page titles as a compatibility fallback. SandboxAI exposes its own identity at the same path.

Named themes, default appearance, and each conversation’s appearance are saved in a separate local IndexedDB database (`sandboxai-appearance`). Theme choices for one conversation do not change another. Appearance never enters AI prompts. Storage errors are visible; clearing browser data removes these local preferences. Theme import/export and sharing are reserved for step 2.

## What you can do now

Phases 1–5 of the Master Spec are in the product. Studio, Adventure, world canon, objects, player-agency, closeness, and UI pictures grew on top of that roadmap.

- **Play.** Three zones: **Cast** (layers, meters, place thumb for the current room, objects) · **Chat** (streamed Pass 1, character portraits, optional place/room backdrop and looping sound) · **Inspector** (canonical snapshot, prompt size vs budget, mutation chain, undo). Status bar: prompt estimate, model picker (your saved model choice), new scene.
- **Studio library.** Characters (given / middle / family name, identity, looks, keyword lore, optional portrait; pronoun is She/He/It plus `+`; tags for the campaign lens), Places (venue + named rooms, intro on the picture, compact prompt for the model, optional pictures and looping sound — pictures and sound are UI only; tags), Objects (tags already filter the shelf), Voices, Stories, Rule-sets (high/low/mid meanings; `{{char}}` / `{{they}}` expand per NPC; text choices are chips with `+`). Stats stay on the campaign / scene, not the archive card. SillyTavern character import on the character shelf.
- **Campaign Builder.** Pick a realm on General (all its landmarks belong), fill **You** if the player has a name and looks tonight, then people and things. Each remaining shelf has its own tags (a person is not a harbour). **Look for** filters that shelf while you pick — it does not change who already belongs. A scene is a place the player can enter: a landmark in the campaign realm, who is here, what is in the room, and optional Pre-defined Replies (several triggers, each with its own buttons) / come-back events. Start copies that scene onto a live session. **new scene** comes back to that campaign's Scenes; chat and trust from the last night do not carry. A short **From last scene** agreement does (why they arrived). Empty = a new meeting. One-off Adventure remains for a night without a campaign.
- **Turns.** Player line is committed and shown before tokens stream. Pass 1 writes third person, present tense, one beat — not a chapter or epilogue. In a group, the turn’s focus is who you named, a unique he/she pointer, or the last speaker — that person’s portrait and meters. High trust + Värme is a warm beat (kiss/hug when asked). Favor is rooms and objects only. Pass 2 may propose lockable mutations; failure never fails a turn whose prose already reached the player. AI-proposed layers stay **inactive** until Approve. Approved layers with keywords stay out of the prompt until recent chat mentions them. Standing personality (no wake words) stays in even when chat overflows. Player Compact merges similar notes. Undo, regenerate, inline edit of dialogue.
- **Canon.** The map is the current scene, ground story, **in-context** place notes, named rooms on the place card (including their intros and compact prompts), and objects placed in the scene. Dormant keyword lore is not canon. Dialogue does not invent rooms. Walking into a named room is engine truth (`playerDestination`). AI `*.position` values that name lodging not in canon are rejected (`WorldCanon`). Pictures never go to the model.
- **Agency.** The player controls their own body. Lines that dictate what an NPC does or says are split: the player’s action is fact; the NPC claim is rejected (`PlayerAgency`).
- **Live state Pass 2 may write** (when unlocked and grounded): character `position | mood | energy | clothing | holding | pose`, relationship `trust | familiarity | tension`, `player.position | player.status`, and rule-set numbers whose **Move / beat** is above 0 (clamped). Looks is body, not clothes. Attribute **high/low/mid meanings** are trusted Pass 1 fact at the live band of each field's own scale; the numbers themselves are not dice.

## Module boundaries

```
src/
├── session/        SessionEngine, SessionStateMachine, ProposalExtraction, createSession
├── state/          StateEngine, StateSchema, AuthorityResolver, LockManager,
│                   StateVersioning, WorldCanon, playerDestination, placeIntro, sceneBackdrop, sceneAudio, deepFreeze
├── context/        ContextEngine, ContextBudgetManager, InstructionHierarchy, PlayerAgency, promptBudget
├── memory/         MemoryEngine, RollingMemory
├── layers/         LayerEngine, LayerPolicy, LayerProposalExtraction, LayerCompaction, keywords
├── llm/            LLMAdapter, providers/ (Ollama, Mock)
├── events/         EventLog
├── persistence/    IndexedDBRepository, MigrationEngine
├── library/        LibrarySchema, objectFilter, sillyTavernImport, exampleTemplates
├── crypto/         crypto.worker          (stub — Phase 6)
├── diagnostics/    DiagnosticsEngine      (stub — Phase 6)
└── ui/             play (Cast / Chat / Inspector) + studio/
```

**Rule:** engines never import from `ui/`. Nothing outside `state/` writes session state — everything goes through `StateEngine`.

IndexedDB: session schema version 2; database version 12 includes library stores, a lightweight conversation index, saved ideas and imported lorebooks. Existing snapshots, including the legacy `demo-session`, are indexed in place without rewriting their history. Unreadable snapshots remain stored and are reported. Invalid records fail load instead of poisoning the DB.

## Using Ollama

1. Install Ollama and have a model listed (`ollama list`). On first setup, the UI discovers installed chat models and makes an initial choice you can change. Saved model choices are preserved; a missing saved model requires an explicit selection.
2. Start the server: `ollama serve` (often already running as a service)
3. Use **Set up AI** on Home or in a conversation to check the connection and choose a model. The model picker is also under **Settings** in play. Programmatically:

```ts
import { OllamaProvider } from "@llm/providers/OllamaProvider";
import { LLMAdapter } from "@llm/LLMAdapter";

const adapter = new LLMAdapter({
  primary: new OllamaProvider({ model: "llama3.1" }),
  // fallbacks: [new OllamaProvider({ model: "smaller-backup-model" })]
});
```

4. Sanity check against a real local server (the automated suite mocks `fetch`):

```bash
npm run smoke:ollama -- llama3.1
```

**CORS:** a browser origin (Vite at `http://localhost:5173`) is rejected unless Ollama allows it:

```bash
OLLAMA_ORIGINS=http://localhost:5173 ollama serve
```

## Running a turn without the UI

```ts
import { StateEngine } from "@state/StateEngine";
import { EventLog } from "@events/EventLog";
import { LLMAdapter } from "@llm/LLMAdapter";
import { OllamaProvider } from "@llm/providers/OllamaProvider";
import { SessionEngine } from "@session/SessionEngine";
import { createLLMProposalExtractor } from "@session/ProposalExtraction";

const stateEngine = new StateEngine(mySession, new EventLog());
const pass1Adapter = new LLMAdapter({
  primary: new OllamaProvider({ model: "llama3.1" }),
});
const pass2Adapter = new LLMAdapter({
  primary: new OllamaProvider({ model: "llama3.1" }),
});
const proposalExtractor = createLLMProposalExtractor(pass2Adapter, {
  onFailure: (err) => console.warn("Pass 2 degraded to no proposals:", err),
});

const sessionEngine = new SessionEngine(
  stateEngine,
  pass1Adapter,
  new EventLog(),
  proposalExtractor,
);

const result = await sessionEngine.runTurn("turn-1", "emma", "Hej Emma!", {
  onTextDelta: (delta) => process.stdout.write(delta),
});
console.log(result.mutationsApplied);
```

Optional constructor args: rolling-memory summarizer, layer-proposal extractor. Same `runTurn` path as the UI (`onPlayerMessageAppended` fires after the player line is in history, before Pass 1 streams).

## Tests

```bash
npm run test
```

341 tests cover engines in isolation (invariants, turns, context, layers, memory, persistence, library, canon, agency). UI components are not in that suite (`tsc --noEmit` and `vite build` are the compile checks).

## Not yet

See [`project_spec.md`](project_spec.md) for the full list. Short version:

- **Phase 6:** PIN/password export (AES-256-GCM), crypto worker, DiagnosticsEngine / SLA, privacy model as a product. `crypto.worker.ts` and `DiagnosticsEngine.ts` are empty stubs. There is no ExportEngine.
- **Designed, not wired:** attribute _checks_ vs _meters_; object weight/difficulty rolls; player stats; live proximity zones (schema only); auto-reject of ungrounded AI environment layers (today they sit inactive until Approve).
