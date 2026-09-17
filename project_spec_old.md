# Project Development Steps: AI Sandbox Engine

This document describes the recommended development steps for the AI Sandbox Engine, based on the Master Specification v2.2. The project is broken down into logical phases from the foundational data model to advanced UI features and security.

> **Note on testing:** Unit, integration, regression, and property tests (Master Spec §50) are not a one-time task confined to Phase 1 — each phase below should extend the test suite with tests appropriate to what it builds. Phase 1 establishes the framework and unit-test baseline; later phases add integration and regression coverage as new components come online.

## Phase 1: Core Architecture and Data Model (Foundation)
The purpose of this phase is to build the platform's foundation and define how data is structured, stored, and versioned.

*   **Minimal Canonical Data Model:** Implement the basic structures for session, characters, scene, relationships, layers, state, memory, and events.
*   **State Engine (Core):** Develop the authoritative source for the current scene and world state.
*   **Scene State Engine & Relative Positioning:** Implement spatial/positioning logic for characters, including proximity zones (intimate, personal, social) as a distinct sub-model of scene state.
*   **Event Log:** Create an event-driven history where all significant state changes and system events are logged with unique IDs.
*   **Persistence Layer:** Set up IndexedDB as the primary storage (for atomic write operations of session data) alongside schema versioning.
*   **System Invariants & Tests:** Establish the foundational rules (e.g., "AI can never overwrite player_locked state") and set up a structure for unit and property tests.

## Phase 2: Context Engine and Core Pipeline
This phase creates the bridge between the system's state and the AI model, with a strong focus on control and token budgeting.

*   **Provider-Agnostic LLM Adapter:** Build an abstraction layer handling streaming, structured output, cancellation functionality, and fallback models without tying the system to a specific provider. Define provider capability detection so the adapter can degrade gracefully (e.g., no structured-output support, no KV-cache reuse).
*   **Context Engine & Budget Manager:** Develop the logic for dynamic context assembly. Implement the explicit context budget (Target ≤ 3,500 tokens, Hard Ceiling ≤ 8,000 tokens) and the prioritization logic for budget overruns.
*   **Two-Pass Execution Pipeline (Part 1):**
    *   Implement "Pass 1", focused on roleplay, responsiveness, and natural dialogue via streaming (prioritizing low Time To First Token - TTFT).
*   **State Snapshots:** Set up the creation of immutable snapshots (including state version and hash) prior to each LLM turn.
*   **Reproducibility Hooks:** Where a provider/runtime supports it, capture the settings needed to reproduce a turn (model, model version, temperature, seed) as part of the snapshot/session state.

## Phase 3: State Mutation and Policy Resolution
The system must now be able to receive proposals from the AI and evaluate them against the platform's strict rule set.

*   **Two-Pass Execution Pipeline (Part 2):** Implement "Pass 2" to asynchronously analyze the dialogue and generate structured proposals for state changes (e.g., emotional or spatial shifts).
*   **Validation Pipeline:** Build the strict pipeline for state mutations: Schema Validation → Target/Type Validation → Authority/Lock Validation → State Version Check → Commit.
*   **Policy Engine & Authority Resolution:** Implement the authority hierarchy (where immutable constraints and player-locked state overrule the AI) and handle concurrency and race conditions via state versioning.
*   **Instruction Hierarchy & Prompt Injection Safety:** Define and enforce the precedence of instruction sources (system rules > scenario rules > layers > player input > AI-generated content), and implement context-safety checks so injected or adversarial text in player input, memory, or generated layers cannot escalate privilege or bypass the Policy Engine.
*   **Session State Machine:** Model the valid session lifecycle states (e.g., idle, awaiting-response, streaming, extracting, committing, error) and the allowed transitions between them.
*   **Turn Idempotency & Atomic State Commit:** Ensure a given turn can be retried safely without producing duplicate state commits, and that a commit either fully applies or fully rolls back — no partial mutations from cancelled or failed turns.
*   **Error Handling & Structured Output Recovery:** Build in tolerant extraction methods for scenarios where the LLM fails to return perfectly structured data, including asynchronous retries with exponential backoff.

## Phase 4: Memory and Layer Engines
This phase expands the AI's ability to act dynamically through historical context and behavioral constraints, fully separated from the core state.

*   **Memory Engine:** Implement the structured storage of memories (episodic, semantic, and relational).
*   **Memory Retrieval & Ranking:** Create mechanisms to select relevant memories to include in the context based on the current scene, importance, and recency.
*   **Rolling Conversation Memory:** Create background jobs that automatically condense and summarize older conversation history when it exceeds the defined context budget.
*   **Layer Engine:** Implement modular behavioral control (Core, Relationship, Environment, and State/Trigger layers), including priority and activation logic.
*   **AI-Generated Layers:** Implement the constrained pathway for AI-proposed layers, ensuring they pass through the same Policy Engine checks as any other AI proposal and cannot bypass authority rules.

## Phase 5: User Interface (UI/UX) and Inspector
In this phase, the system's internal processes are visualized for the player/director to provide total control and transparency.

*   **Three-Zone UI:**
    *   *Left Panel:* Layer Stack & Creator (management, AI generation, and prioritization of active layers).
    *   *Center Panel:* Chat, status bar (chips), and inline editing of dialogue.
    *   *Right Panel:* Inspector view displaying the canonical state tree.
*   **Inspector Mode:** Allow the player to track exactly why a state changed by following the chain: Current State → Last Mutation → Event → LLM Output.
*   **Undo, Replay & Regeneration:** Develop features to undo the latest mutation via the event log and provide the ability to regenerate dialogue based on preserved turn snapshots.

## Phase 6: Performance, Security, and Diagnostics
The final development phase ensures that the platform is secure, portable, and performs according to the defined SLA targets.

*   **Encryption & Secure Export:** Implement PIN/Password-protected export of session data and templates using AES-256-GCM and Argon2id/PBKDF2.
*   **Web Workers:** Offload heavy cryptographic operations (and other CPU-intensive tasks) from the main UI thread to Web Workers.
*   **Import/Migration Engine:** Build support for deterministic migration of older schema structures to the current internal model.
*   **Privacy Model:** Define what data leaves the client under which conditions, including handling for local/on-device LLM usage where no data should leave the machine at all.
*   **Performance Targets & SLA:** Define and validate explicit SLA targets (e.g., TTFT thresholds, total turn latency) rather than only collecting diagnostics data.
*   **Diagnostics & Observability:** Implement detailed tracking per turn (TTFT, total latency, input/output tokens, cache usage) to monitor and optimize platform performance.
*   **Integration & Regression Test Suite:** Consolidate cross-component integration tests (e.g., full turn pipeline, migration correctness) and regression tests guarding the System Invariants (§51) established in Phase 1.
