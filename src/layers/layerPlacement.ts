import type { Layer, LayerType } from "@state/StateSchema";

/**
 * UI placement for layers. The stored `type` is whatever the proposer
 * claimed; Stheno-style RP models often stamp personality notes as
 * "environment" because the scene is a bar. Placement is derived from
 * content so the player-facing Characters / Place split stays honest
 * without rewriting stored state.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TRAIT_WORDS =
  /\b(demeanor|personality|small talk|solitude|introspective|professional manner|avoids small talk|slow to (open|trust)|dry-witted)\b/i;

function nameAsBehaviorSubject(content: string, characterId: string): boolean {
  const name = escapeRegExp(characterId);
  return new RegExp(
    `\\b${name}\\b\\s+(is|maintains|avoids|prefers|speaks|tends|remains|seems|acts|appears|rarely|never)\\b`,
    "i"
  ).test(content);
}

export function readsAsCharacterTrait(content: string, characterIds: string[]): boolean {
  const mentioned = characterIds.filter((id) => new RegExp(`\\b${escapeRegExp(id)}\\b`, "i").test(content));
  if (mentioned.length === 0) return false;
  return mentioned.some((id) => nameAsBehaviorSubject(content, id) || TRAIT_WORDS.test(content));
}

export function displayLayerType(layer: Pick<Layer, "type" | "content">, characterIds: string[]): LayerType {
  if (layer.type === "environment" && readsAsCharacterTrait(layer.content, characterIds)) {
    return "core";
  }
  return layer.type;
}

export function coerceProposedLayerType(
  proposal: { type: "core" | "relationship" | "environment"; content: string },
  characterId: string
): { type: "core" | "relationship" | "environment"; content: string } {
  if (proposal.type === "environment" && readsAsCharacterTrait(proposal.content, [characterId])) {
    return { ...proposal, type: "core" };
  }
  return proposal;
}
