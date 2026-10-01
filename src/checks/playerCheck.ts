import { usesGameRules } from "../state/playMode";
import type { Session } from "../state/StateSchema";
import { charactersHere } from "../state/sceneFocus";
import { whatNowBlocksComposer, resolveWhatNowIntercept } from "../state/whatNowGate";
import { CheckResultSchema, resolveCheck, type CheckResult, type Difficulty } from "./CheckEngine";

export function playerCheckStats(session: Session) {
  if (!usesGameRules(session)) return [];
  return (session.ruleset?.attributes ?? []).flatMap((def) => {
    if (def.kind !== "number") return [];
    const raw = session.player?.stats?.[def.id];
    if (raw === undefined || !raw.trim()) return [];
    const value = Number(raw);
    const min = def.min ?? 0;
    const max = def.max ?? 100;
    if (!Number.isFinite(value) || max <= min || value < min || value > max) return [];
    return [{ id: def.id, name: def.name, value, min, max }];
  });
}

export function playerCheckActions(session: Session) {
  const stats = playerCheckStats(session);
  return (session.ruleset?.actions ?? []).filter((action) => stats.some((stat) => stat.id === action.attributeId));
}

export function rollPlayerCheck(session: Session, input: {
  id: string; action: string; targetId: string; attributeId: string; difficulty: Difficulty; actionId?: string;
}, rng?: () => number): CheckResult {
  if (!usesGameRules(session)) throw new Error("Fan Fiction does not use game-rule checks.");
  if (whatNowBlocksComposer(session)) throw new Error("Choose the next story beat before attempting a check.");
  if (resolveWhatNowIntercept(session, input.action).kind !== "pass") {
    throw new Error("This action opens a story choice. Use the chat to choose that beat first.");
  }
  if (!charactersHere(session).includes(input.targetId)) throw new Error("The other character must be here.");
  const definition = input.actionId ? playerCheckActions(session).find((action) => action.id === input.actionId) : undefined;
  if (input.actionId && !definition) throw new Error("This action is unavailable with your current stats.");
  if (definition && definition.attributeId !== input.attributeId) throw new Error("Use the stat defined by this action.");
  const stat = playerCheckStats(session).find((item) => item.id === input.attributeId);
  if (!stat) throw new Error("Set a numeric stat on the campaign's You sheet first.");
  return resolveCheck({ id: input.id, action: input.action, targetId: input.targetId, attributeId: input.attributeId, difficulty: input.difficulty,
    ...(definition ? { actionDefinition: definition } : {}), attributeName: stat.name, value: stat.value, min: stat.min, max: stat.max }, rng);
}

/** A pending visual roll must still match the live scene when committed. */
export function validatePlayerCheck(session: Session, result: CheckResult): CheckResult {
  const parsed = CheckResultSchema.parse(result);
  const current = rollPlayerCheck(session, { ...parsed, ...(parsed.actionDefinition ? { actionId: parsed.actionDefinition.id } : {}) }, () => (parsed.roll - 0.5) / 100);
  if (["attributeName", "value", "min", "max", "target"].some((key) =>
    current[key as keyof CheckResult] !== parsed[key as keyof CheckResult])) {
    throw new Error("The scene or stat changed after this roll.");
  }
  if (JSON.stringify(current.actionDefinition) !== JSON.stringify(parsed.actionDefinition)) {
    throw new Error("The action definition changed after this roll.");
  }
  return parsed;
}
