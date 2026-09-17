import type { AuthoritySource } from "@state/AuthorityResolver";
import type { Layer, LayerType, Session } from "@state/StateSchema";
import { isUngroundedInvention } from "@state/WorldCanon";
import { displayLayerType } from "./layerPlacement";

/**
 * Layer Policy — Master Spec §14-15, and the "AI-Generated Layers" item
 * from the project plan: AI-proposed layers must pass through the same
 * kind of choke point as any other AI proposal and cannot bypass
 * authority rules.
 *
 * Three rules:
 *  - Adding a layer is allowed from any source, AI included — except AI
 *    environment layers that invent rooms or creatures not in canon.
 *    Those are discarded, not queued inactive for the player to approve.
 *  - AI-added layers that do pass are force-created inactive.
 *  - Activating a layer is privileged: AI can never do it. The player
 *    also cannot approve a leftover ungrounded AI environment layer.
 */

const AI_SOURCES: ReadonlySet<AuthoritySource> = new Set(["ai_approved_state_mutation", "ai_inference"]);

function isAiSource(source: AuthoritySource): boolean {
  return AI_SOURCES.has(source);
}

/** AI-added layers are always forced inactive on creation, regardless of what was requested. */
export function mustForceInactiveOnAdd(source: AuthoritySource): boolean {
  return isAiSource(source);
}

export interface LayerActivationDecision {
  allowed: boolean;
  reason: string;
}

export function resolveLayerActivationChange(source: AuthoritySource): LayerActivationDecision {
  if (isAiSource(source)) {
    return {
      allowed: false,
      reason: "AI-sourced requests can never activate or deactivate a layer, even one the AI itself proposed."
    };
  }
  return { allowed: true, reason: "Player/system-initiated layer activation change." };
}

export type LayerDiscardDecision = { discard: true; reason: string } | { discard: false };

function ungroundedEnvironmentReason(content: string): string {
  return `Cannot invent a place or thing that is not in the scene, story, objects, or active place notes: ${content}`;
}

/**
 * AI environment notes that invent lodging or a stray animal are not
 * queued for Approve — same WorldCanon bar as Pass 2 positions.
 * Player-authored layers may still name a guest room; that is how canon grows.
 */
export function shouldDiscardAiLayerProposal(
  source: AuthoritySource,
  layer: { type: LayerType; content: string },
  session: Session
): LayerDiscardDecision {
  if (!isAiSource(source)) return { discard: false };
  if (layer.type !== "environment") return { discard: false };
  if (!isUngroundedInvention(layer.content, session)) return { discard: false };
  return { discard: true, reason: ungroundedEnvironmentReason(layer.content) };
}

/** Leftover pending AI place-notes: Approve must not make them canon. */
export function shouldBlockLayerActivation(
  layer: Pick<Layer, "type" | "content" | "aiGenerated">,
  session: Session
): LayerDiscardDecision {
  if (!layer.aiGenerated) return { discard: false };
  const characterIds = Object.keys(session.characters);
  if (displayLayerType(layer, characterIds) !== "environment") return { discard: false };
  if (!isUngroundedInvention(layer.content, session)) return { discard: false };
  return { discard: true, reason: ungroundedEnvironmentReason(layer.content) };
}
