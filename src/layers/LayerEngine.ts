import { estimateTokens } from "@context/tokenEstimate";
import type { Session, Layer } from "@state/StateSchema";
import { PRIORITY, type ContextBlock } from "@context/ContextBlock";
import { layerHasKeywordGate, keywordsMatchConversation, tokenKnownInPlay } from "./keywords";
import { isVenueFloor, sideRoomStage } from "@state/playerDestination";
import { storyFlagsSatisfied } from "@state/storyFlags";

/**
 * Layer Engine — Master Spec §12-15.
 * Modular behavioral control: Core, Relationship, Environment, and
 * State/Trigger layers. The single most important property this module
 * guarantees (§51 invariant: "inactive layers don't affect context") is
 * structural, not a convention: buildLayerBlocks() only ever produces
 * blocks for layers that are effectively active. There is no code path
 * that lets an inactive layer's content reach the LLM.
 */

export type TriggerHints = {
  /** Walking back to the venue, or a night/time-skip, this turn. */
  continuation?: boolean;
};

/**
 * Trigger format: "dot.path==value" — a minimal condition language —
 * or a named beat such as `return_to_bar`.
 */
function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  // Lockable fields are stored as {value, lock} — unwrap for comparison.
  if (current !== null && typeof current === "object" && "value" in (current as Record<string, unknown>)) {
    return (current as { value: unknown }).value;
  }
  return current;
}

export function evaluateTrigger(
  session: Session,
  trigger: string | undefined,
  hints: TriggerHints = {}
): boolean {
  if (!trigger) return false;
  const named = trigger.trim();
  if (named === "return_to_bar") {
    if (!hints.continuation) return false;
    if (sideRoomStage(session)) return false;
    const pos = session.player?.position.value?.trim() ?? "";
    return Boolean(pos) && isVenueFloor(pos, session);
  }
  const [path, expected] = named.split("==");
  if (!path || expected === undefined) return false;
  const actual = getByPath(session, path.trim());
  return String(actual) === expected.trim();
}

/**
 * Effective activation, per layer type:
 *  - spent once-layers: never.
 *  - once: persisted `active` AND trigger (if any) AND tokens already in play.
 *  - keyword gate (any type): persisted `active` AND a keyword hits recent chat.
 *    Unapproved layers never fire, even on a keyword hit.
 *  - core / relationship / environment: exactly the persisted `active` flag.
 *  - state_trigger: persisted `active` OR its trigger currently matches.
 *    A trigger layer with no trigger defined just falls back to its
 *    persisted flag, same as any other layer.
 *  - requiresFlags / requiresAbsentFlags (any type): a story-flag gate on
 *    top of the above — never active while unsatisfied, whatever the
 *    layer's own trigger/keyword state says.
 */
export function isEffectivelyActive(session: Session, layer: Layer, hints: TriggerHints = {}): boolean {
  if (layer.spent) return false;
  if (!storyFlagsSatisfied(session, layer.requiresFlags, layer.requiresAbsentFlags)) return false;
  if (layer.once) {
    if (!layer.active) return false;
    if (!layer.trigger && !(layer.keywords?.length)) return false;
    if (layer.trigger && !evaluateTrigger(session, layer.trigger, hints)) return false;
    if (layer.keywords?.length && !tokenKnownInPlay(session, layer.keywords)) return false;
    return true;
  }
  if (layerHasKeywordGate(layer)) {
    return layer.active && keywordsMatchConversation(session.conversation, layer.keywords ?? []);
  }
  if (layer.type === "state_trigger" && layer.trigger) {
    return layer.active || evaluateTrigger(session, layer.trigger, hints);
  }
  return layer.active;
}

export function getEffectiveActiveLayers(session: Session, hints: TriggerHints = {}): Layer[] {
  return session.layers
    .filter((layer) => isEffectivelyActive(session, layer, hints))
    .sort((a, b) => a.priority - b.priority);
}

export function onceLayersFiring(session: Session, hints: TriggerHints = {}): Layer[] {
  return session.layers.filter((layer) => layer.once && !layer.spent && isEffectivelyActive(session, layer, hints));
}

function priorityFor(layer: Layer): number {
  const base = layer.type === "core" ? PRIORITY.CORE_LAYER : PRIORITY.OTHER_LAYER;
  return base + layer.priority;
}

/**
 * Converts effectively-active layers into context blocks. Never called
 * with, and never produces blocks for, inactive layers — the filtering
 * happens once, here, at the source.
 *
 * Standing core identity (personality / always-on lore, no keyword gate)
 * is required context — the same trust as a room intro. Chat overflow
 * must not make a bartender forget the bar. Keyword lore, relationship
 * notes, and place extras still trim under budget.
 * An authored once-beat is required the turn it fires.
 */
export function buildLayerBlocks(session: Session, hints: TriggerHints = {}): ContextBlock[] {
  let importedTokens = 0;
  return getEffectiveActiveLayers(session, hints)
    .filter(layer => {
      if (!layer.loreSource) return true;
      const tokens = estimateTokens(layer.content);
      if (importedTokens + tokens > 1200) return false;
      importedTokens += tokens;
      return true;
    })
    .filter((layer) => !isDuplicatePlaceLayer(session, layer))
    .map((layer) => ({
      id: `layer-${layer.id}`,
      source: "active_layer" as const,
      content: layer.content,
      priority: priorityFor(layer),
      required: !layer.loreSource && ((layer.type === "core" && !layerHasKeywordGate(layer)) || Boolean(layer.once))
    }));
}

/** Here already carries venue copy. Do not send `layer-place` a second time. */
function isDuplicatePlaceLayer(session: Session, layer: Layer): boolean {
  if (layer.id === "layer-place") return true;
  if (layer.type !== "environment") return false;
  const text = layer.content.trim();
  if (!text) return true;
  const brief = session.scene?.brief?.trim();
  const note = session.scene?.note?.trim();
  return Boolean((brief && text === brief) || (note && text === note));
}

