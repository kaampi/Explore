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

First load opens **Studio**: library shelves plus **Campaigns** (Campaign Builder — put a world together, then start a scene). **One-off scene** is still there for a night without a campaign. After a session exists it is restored from IndexedDB; **new scene** clears that night and, if you started from a campaign, opens it again on Scenes.

## What you can do now

Phases 1–5 of the Master Spec are in the product. Studio, Adventure, world canon, objects, player-agency, closeness, and UI pictures grew on top of that roadmap.

- **Play.** Three zones: **Cast** (layers, meters, place thumb for the current room, objects) · **Chat** (streamed Pass 1, character portraits, optional place/room backdrop and looping sound) · **Inspector** (canonical snapshot, prompt size vs budget, mutation chain, undo). Status bar: prompt estimate, model picker (default `stheno-custom:latest`), new scene.
- **Studio library.** Characters (given / middle / family name, identity, looks, keyword lore, optional portrait; pronoun is She/He/It plus `+`; tags for the campaign lens), Places (venue + named rooms, intro on the picture, compact prompt for the model, optional pictures and looping sound — pictures and sound are UI only; tags), Objects (tags already filter the shelf), Voices, Stories, Rule-sets (high/low/mid meanings; `{{char}}` / `{{they}}` expand per NPC; text choices are chips with `+`). Stats stay on the campaign / scene, not the archive card. SillyTavern character import on the character shelf.
- **Campaign Builder.** Pick a realm on General (all its landmarks belong), fill **You** if the player has a name and looks tonight, then people and things. Each remaining shelf has its own tags (a person is not a harbour). **Look for** filters that shelf while you pick — it does not change who already belongs. A scene is a place the player can enter: a landmark in the campaign realm, who is here, what is in the room, and optional Pre-defined Replies (several triggers, each with its own buttons) / come-back events. Start copies that scene onto a live session. **new scene** comes back to that campaign's Scenes; chat and trust from the last night do not carry. A short **From last scene** agreement does (why they arrived). Empty = a new meeting. One-off Adventure remains for a night without a campaign.
- **Turns.** Player line is committed and shown before tokens stream. Pass 1 writes third person, present tense, one beat — not a chapter or epilogue. In a group, the turn’s focus is who you named, a unique he/she pointer, or the last speaker — that person’s portrait and meters. High trust + Längtan is a warm beat (kiss/hug when asked). Favor is rooms and objects only. Pass 2 may propose lockable mutations; failure never fails a turn whose prose already reached the player. AI-proposed layers stay **inactive** until Approve. Approved layers with keywords stay out of the prompt until recent chat mentions them. Standing personality (no wake words) stays in even when chat overflows. Player Compact merges similar notes. Undo, regenerate, inline edit of dialogue.
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

IndexedDB: session schema version 2; library stores through DB v6 (characters, places, stories, voices, rule-sets, objects). Invalid records fail load instead of poisoning the DB.

## Using Ollama

1. Install Ollama and have a model listed (`ollama list`). The UI defaults to `stheno-custom:latest`; the picker uses the first installed name if that tag is missing.
2. Start the server: `ollama serve` (often already running as a service)
3. In the UI, pick the model from the status bar. Programmatically:

```ts
import { OllamaProvider } from "@llm/providers/OllamaProvider";
import { LLMAdapter } from "@llm/LLMAdapter";

const adapter = new LLMAdapter({
  primary: new OllamaProvider({ model: "llama3.1" })
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
const pass1Adapter = new LLMAdapter({ primary: new OllamaProvider({ model: "llama3.1" }) });
const pass2Adapter = new LLMAdapter({ primary: new OllamaProvider({ model: "llama3.1" }) });
const proposalExtractor = createLLMProposalExtractor(pass2Adapter, {
  onFailure: (err) => console.warn("Pass 2 degraded to no proposals:", err)
});

const sessionEngine = new SessionEngine(stateEngine, pass1Adapter, new EventLog(), proposalExtractor);

const result = await sessionEngine.runTurn("turn-1", "emma", "Hej Emma!", {
  onTextDelta: (delta) => process.stdout.write(delta)
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
- **Designed, not wired:** attribute *checks* vs *meters*; object weight/difficulty rolls; player stats; live proximity zones (schema only); auto-reject of ungrounded AI environment layers (today they sit inactive until Approve).
