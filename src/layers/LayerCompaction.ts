import { z } from "zod";
import type { LLMAdapter } from "@llm/LLMAdapter";
import { retryWithBackoff, type RetryOptions } from "@llm/retry";
import { extractJsonCandidate } from "@session/ProposalExtraction";
import type { Layer, LayerType } from "@state/StateSchema";
import { displayLayerType } from "./layerPlacement";

/**
 * Player-triggered compaction of overlapping layers.
 * Automatic merge would rewrite who a character is without a review step;
 * this module only runs when the player asks, then StateEngine commits
 * the replacement as one undoable mutation.
 */

const CompactedContentsSchema = z.object({
  contents: z.array(z.string().min(1)).min(1).max(3)
});
const CompactedArraySchema = z.array(z.string().min(1)).min(1).max(3);

function asContents(json: unknown): string[] | null {
  const asObject = CompactedContentsSchema.safeParse(json);
  if (asObject.success) return asObject.data.contents;
  const asArray = CompactedArraySchema.safeParse(json);
  if (asArray.success) return asArray.data;
  return null;
}

export type CompactableType = "core" | "relationship" | "environment";

export interface LayerCompactGroup {
  type: CompactableType;
  layers: Layer[];
}

export type LayerCompactor = (type: CompactableType, contents: string[]) => Promise<string[] | null>;

export function isPendingAiLayer(layer: Layer): boolean {
  return layer.aiGenerated && !layer.active;
}

export function groupLayersForCompaction(layers: Layer[], characterIds: string[]): LayerCompactGroup[] {
  const buckets: Record<CompactableType, Layer[]> = {
    core: [],
    relationship: [],
    environment: []
  };

  for (const layer of layers) {
    // Keep storyline/rule material separate from world lore.
    if (layer.purpose && layer.purpose !== "world") continue;
    const shown = displayLayerType(layer, characterIds);
    if (shown === "core" || shown === "relationship" || shown === "environment") {
      buckets[shown].push(layer);
    }
  }

  return (Object.entries(buckets) as [CompactableType, Layer[]][])
    .filter(([, group]) => group.length >= 2)
    .map(([type, group]) => ({ type, layers: group }));
}

export function parseCompactedContents(rawText: string, inputCount: number): string[] | null {
  const tryParse = (text: string): unknown => {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };

  const direct = tryParse(rawText.trim());
  const nested = direct === undefined ? tryParse(extractJsonCandidate(rawText) ?? "") : undefined;
  const parsed = asContents(direct) ?? asContents(nested);
  if (!parsed) return null;

  const contents = parsed.map((text) => text.trim()).filter(Boolean);
  if (contents.length === 0 || contents.length > inputCount) return null;
  return contents;
}

export function compactionIsUseful(before: string[], after: string[]): boolean {
  if (after.length === 0 || after.length > before.length) return false;
  if (after.length < before.length) return true;
  const beforeLen = before.join("").length;
  const afterLen = after.join("").length;
  return afterLen <= Math.floor(beforeLen * 0.85);
}

export function flagsForCompactedGroup(layers: Layer[]): { active: boolean; aiGenerated: boolean } {
  const allPending = layers.every(isPendingAiLayer);
  if (allPending) return { active: false, aiGenerated: true };
  return { active: layers.some((layer) => layer.active), aiGenerated: false };
}

/**
 * Compacted notes keep a keyword gate only if every source layer had one.
 * Mixing always-on notes with gated lore must not hide the always-on text.
 */
export function keywordsForCompactedGroup(layers: Layer[]): string[] {
  if (layers.some((layer) => (layer.keywords?.length ?? 0) === 0)) return [];
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const layer of layers) {
    for (const keyword of layer.keywords ?? []) {
      const key = keyword.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      keywords.push(keyword);
    }
  }
  return keywords;
}

export function createLLMLayerCompactor(
  llmAdapter: LLMAdapter,
  options: { maxAttempts?: number; baseDelayMs?: number; sleepImpl?: RetryOptions["sleepImpl"] } = {}
): LayerCompactor {
  const maxAttempts = options.maxAttempts ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 200;

  return async (type, contents) => {
    if (contents.length < 2) return null;
    try {
      return await retryWithBackoff(
        async () => {
          let collected = "";
          for await (const chunk of llmAdapter.streamCompletion({
            messages: [
              {
                role: "system",
                content: [
                  "You compact overlapping standing notes for a roleplay engine.",
                  `These notes are all type "${type}".`,
                  "Merge them into as few short standing instructions as possible (usually one).",
                  "Keep distinct facts. Drop repetition and near-paraphrases. Do not invent new traits.",
                  "Do not write first-person narration. Write as a behavioral instruction about the character or place.",
                  "Respond with ONLY JSON, no markdown:",
                  '{"contents": ["<compact note>", "...optional second note"]}',
                  `Return at most ${Math.min(3, contents.length)} notes, and fewer than the input when they overlap.`
                ].join("\n")
              },
              {
                role: "user",
                content: contents.map((text, index) => `${index + 1}. ${text}`).join("\n")
              }
            ]
          })) {
            if (chunk.type === "text_delta") collected += chunk.text;
            else if (chunk.type === "error") throw new Error(chunk.message);
          }
          return parseCompactedContents(collected, contents.length);
        },
        { maxAttempts, baseDelayMs, sleepImpl: options.sleepImpl }
      );
    } catch {
      return null;
    }
  };
}

export function selectPendingForCompaction(layers: Layer[], characterIds: string[]): LayerCompactGroup[] {
  return groupLayersForCompaction(layers.filter(isPendingAiLayer), characterIds);
}

export function selectEstablishedForCompaction(
  layers: Layer[],
  characterIds: string[],
  type: CompactableType
): LayerCompactGroup[] {
  const established = layers.filter((layer) => !isPendingAiLayer(layer));
  return groupLayersForCompaction(established, characterIds).filter((group) => group.type === type);
}

