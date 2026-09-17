import { z } from "zod";
import type { LLMAdapter } from "@llm/LLMAdapter";
import { retryWithBackoff, type RetryOptions } from "@llm/retry";
import { extractJsonCandidate } from "@session/ProposalExtraction";
import { coerceProposedLayerType } from "./layerPlacement";

/**
 * AI-Generated Layers — the "AI generation" half of the Left Panel's
 * "management, AI generation, and prioritization of active layers"
 * (project_spec.md Phase 5). Deliberately a separate extractor from
 * Pass 2's state-mutation proposals — layers persist and shape *future*
 * turns, a mutation is a one-off state change, and conflating their
 * JSON shapes would make both harder to validate reliably.
 *
 * The authority story is already fully handled by
 * `LayerPolicy`/`StateEngine.addLayer`: whatever this extractor
 * proposes is always force-created inactive, tagged `aiGenerated: true`.
 * This module's only job is turning dialogue into a well-formed
 * proposal (or, tolerantly, no proposal at all).
 */

const NoLayerProposalSchema = z.object({ propose: z.literal(false) });
const LayerProposalSchema = z.object({
  propose: z.literal(true),
  type: z.enum(["core", "relationship", "environment"]),
  content: z.string().min(1)
});
const LayerProposalResultSchema = z.union([NoLayerProposalSchema, LayerProposalSchema]);

export interface LayerProposal {
  type: "core" | "relationship" | "environment";
  content: string;
}

export type LayerProposalExtractor = (
  dialogueText: string,
  characterId: string
) => Promise<LayerProposal | null>;

export function parseLayerProposal(rawText: string): LayerProposal | null {
  const candidate = extractJsonCandidate(rawText);
  if (!candidate) return null;

  let json: unknown;
  try {
    json = JSON.parse(candidate);
  } catch {
    return null;
  }

  const parsed = LayerProposalResultSchema.safeParse(json);
  if (!parsed.success || !parsed.data.propose) return null;

  return { type: parsed.data.type, content: parsed.data.content };
}

export interface LLMLayerProposalExtractorOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleepImpl?: RetryOptions["sleepImpl"];
  onFailure?: (error: unknown) => void;
}

export function createLLMLayerProposalExtractor(
  llmAdapter: LLMAdapter,
  options: LLMLayerProposalExtractorOptions = {}
): LayerProposalExtractor {
  const maxAttempts = options.maxAttempts ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 200;

  return async (dialogueText: string, characterId: string): Promise<LayerProposal | null> => {
    try {
      return await retryWithBackoff(
        async () => {
          let collected = "";
          for await (const chunk of llmAdapter.streamCompletion({
            messages: [
              {
                role: "system",
                content: [
                  `You are reviewing one turn of roleplay dialogue from character "${characterId}"`,
                  "to decide whether it reveals a durable personality trait, relationship shift, or",
                  "environmental detail worth remembering as a standing behavioral layer for FUTURE turns —",
                  "not just what happened this once.",
                  "",
                  "Type rules — follow these strictly:",
                  `- core: who ${characterId} IS (personality, demeanor, speech, habits). The subject is the person.`,
                  `- relationship: how ${characterId} relates to the player (trust, warmth, rivalry).`,
                  "- environment: the PLACE only (room, lighting, music, layout, crowd).",
                  "Do not invent a room, hotel, or animal that is not already in the scene.",
                  `Never tag ${characterId}'s demeanor, professional manner, or habits as environment,`,
                  "even if they are standing in that place.",
                  "",
                  "Respond with ONLY a JSON object, no prose, no markdown fences.",
                  'If nothing durable is worth capturing: {"propose": false}',
                  "Otherwise:",
                  '{"propose": true, "type": "core"|"relationship"|"environment", "content": "<the behavioral instruction>"}',
                  "",
                  "Propose a layer RARELY — only for something that should genuinely persist and shape how",
                  "this character behaves going forward, not for routine dialogue."
                ].join("\n")
              },
              { role: "user", content: dialogueText }
            ]
          })) {
            if (chunk.type === "text_delta") collected += chunk.text;
            else if (chunk.type === "error")
              throw new Error(`Provider error during layer proposal: ${chunk.message}`);
          }

          // A malformed/unparseable response is treated as "no
          // proposal" rather than retried — proposing a layer is
          // opportunistic and rare by design; it's not worth burning
          // retries chasing a well-formed refusal-shaped response.
          const parsed = parseLayerProposal(collected);
          return parsed ? coerceProposedLayerType(parsed, characterId) : null;
        },
        { maxAttempts, baseDelayMs, sleepImpl: options.sleepImpl }
      );
    } catch (err) {
      options.onFailure?.(err);
      return null;
    }
  };
}
