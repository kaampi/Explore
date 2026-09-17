import type { Session } from "@state/StateSchema";
import { DEFAULT_OLLAMA_MODEL } from "@llm/providers/OllamaProvider";
import {
  EXAMPLE_AURORA_BRIEF,
  EXAMPLE_AURORA_LORE,
  EXAMPLE_AURORA_NOTE,
  EXAMPLE_AURORA_ROOMS
} from "@library/exampleTemplates";

export function createDemoSession(): Session {
  return {
    schemaVersion: 2,
    id: "demo-session",
    runtime: { model: DEFAULT_OLLAMA_MODEL, temperature: 0.8, seed: null, provider: "ollama" },
    stateVersion: 0,
    characters: {
      emma: {
        name: "Emma",
        pronoun: "she",
        appearance: "Dark hair, sharp features, hands used to glassware.",
        position: { value: "behind the bar", lock: "unlocked" },
        mood: { value: "reserved", lock: "unlocked" },
        clothing: { value: "a bartender's apron over indoor clothes", lock: "unlocked" },
        holding: { value: "", lock: "unlocked" },
        pose: { value: "polishing a glass", lock: "unlocked" }
      }
    },
    scene: {
      location: "The Aurora Room — a quiet late-night bar",
      environment: { lighting: "low, amber", noise: "a soft jazz record", music: true },
      note: EXAMPLE_AURORA_NOTE,
      brief: EXAMPLE_AURORA_BRIEF,
      rooms: EXAMPLE_AURORA_ROOMS
    },
    player: {
      position: { value: "at the bar", lock: "unlocked" },
      status: { value: "awake", lock: "unlocked" }
    },
    relationships: {
      emma: {
        trust: { value: 20, lock: "unlocked" },
        familiarity: { value: 10, lock: "unlocked" },
        tension: { value: 5, lock: "unlocked" }
      }
    },
    layers: [
      {
        id: "layer-core",
        type: "core",
        priority: 0,
        content:
          "Dry-witted, observant, and slow to open up. Speaks in short, precise sentences and rarely volunteers information about herself.",
        active: true,
        aiGenerated: false
      },
      {
        id: "layer-relationship",
        type: "relationship",
        priority: 10,
        content:
          "Emma has started to trust the player. She allows small moments of warmth to slip through her usual reserve.",
        active: false,
        aiGenerated: false
      },
      {
        id: "layer-place",
        type: "environment",
        priority: 10,
        content: EXAMPLE_AURORA_BRIEF,
        active: true,
        aiGenerated: false
      },
      ...EXAMPLE_AURORA_LORE.map((entry, index) => ({
        id: `layer-place-lore-${index + 1}`,
        type: "environment" as const,
        priority: 20 + index,
        content: entry.content,
        keywords: entry.keywords,
        active: true,
        aiGenerated: false
      }))
    ],
    memory: {
      episodic: [
        {
          id: "mem-1",
          createdAtTurn: 0,
          importance: 0.6,
          content: "The player mentioned they used to work in a bar too, years ago."
        }
      ],
      semantic: [],
      relational: []
    },
    conversation: [],
    events: [],
    snapshots: [],
    diagnostics: []
  };
}

export const DEMO_CHARACTER_ID = "emma";
export const DEMO_CHARACTER_NAME = "Emma";
