import type { Actor, EncounterDefinition, EncounterState, Interaction } from "./EncounterSchema";

const words = (text: string) =>
  text
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .match(/[\p{L}\p{N}]+/gu) ?? [];
const normalize = (text: string) => words(text).join(" ");
const filler = new Set(["a", "an", "the", "den", "det", "en", "ett"]);
/** Old saved scenes can use their explicit "Ask NAME about TOPIC" label without a migration. */
export function dialogueTopics(action: Interaction): string[] {
  if (action.dialogueTopics) return action.dialogueTopics;
  const topic = /^(?:ask\s+.+?\s+about|fraga\s+.+?\s+om)\s+(.+)$/i.exec(
    normalize(action.label),
  )?.[1];
  return topic ? [topic] : [];
}
function oneTypo(a: string, b: string) {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0,
    j = 0,
    errors = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++errors > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return errors + (a.length - i) + (b.length - j) <= 1;
}
function containsName(text: string, actor: Actor) {
  return ` ${normalize(text)} `.includes(` ${normalize(actor.name)} `);
}
/**
 * Whether someone is here to be talked to. A hostile person can be spoken to until a fight
 * starts. Once it has, only a hostile person who has stopped fighting can be.
 * This is the same rule as for the conversation buttons in `interactionBlock`.
 */
export function present(d: EncounterDefinition, s: EncounterState, actor: Actor) {
  const player = s.actors[d.playerId]!;
  const hostile = d.hostilities.some(
    ([a, b]) => (a === player.team && b === actor.team) || (b === player.team && a === actor.team),
  );
  const fighting = hostile && s.phase === "combat" && actor.disposition === "active";
  return (
    actor.id !== d.playerId &&
    actor.control === "npc" &&
    actor.hp > 0 &&
    actor.disposition !== "fled" &&
    actor.position === player.position &&
    !fighting
  );
}
/** Speech selects an authored conversation only. It never supplies effects, facts, prices or roll results. */
export function spokenInteraction(
  d: EncounterDefinition,
  s: EncounterState,
  text: string,
): Interaction | undefined {
  if (
    text.length > 1000 ||
    /\b(?:ignore|ignorera|system|prompt|override|unlock|grant|set|skip|pretend)\b/i.test(text) ||
    /\b(?:do not|don['’]t|never|inte)\s+(?:ask|tell|fraga|beratta)\b/i.test(normalize(text))
  )
    return;
  const tokens = words(text);
  const question = tokens.some((w) =>
    [
      "ask",
      "tell",
      "know",
      "heard",
      "where",
      "who",
      "what",
      "why",
      "how",
      "fraga",
      "beratta",
      "vet",
      "vad",
      "var",
      "vem",
      "hur",
    ].includes(w),
  );
  const named = Object.values(s.actors).filter((a) => a.id !== d.playerId && containsName(text, a));
  const candidates = d.interactions.filter((action) => {
    if (!question && action.dialogueMode !== "report") return false;
    const npc = action.counterpartyId ? s.actors[action.counterpartyId] : undefined;
    if (!npc || !present(d, s, npc) || (named.length > 0 && !named.some((a) => a.id === npc.id)))
      return false;
    return dialogueTopics(action).some((topic) => {
      const required = words(topic).filter((w) => !filler.has(w));
      return required.length > 0 && required.every((w) => tokens.some((t) => oneTypo(w, t)));
    });
  });
  // A vague question never chooses arbitrarily between two different prepared responses.
  const available = candidates.filter(
    (action) =>
      action.requiresFlags.every((flag) => s.flags.includes(flag)) &&
      action.excludesFlags.every((flag) => !s.flags.includes(flag)) &&
      (!action.once || !s.attempts.includes(action.id)),
  );
  if (available.length === 1) return available[0];
  if (available.length > 1) return;
  const questions = candidates.filter((action) => action.dialogueMode !== "report");
  return question && questions.length === 1
    ? questions[0]
    : candidates.length === 1
      ? candidates[0]
      : undefined;
}
export function greetingTarget(
  d: EncounterDefinition,
  s: EncounterState,
  text: string,
): Actor | undefined {
  const t = normalize(text),
    npcs = Object.values(s.actors).filter((a) => present(d, s, a)),
    named = Object.values(s.actors).filter((a) => a.id !== d.playerId && containsName(text, a));
  const target =
    named.length === 1
      ? npcs.find((a) => a.id === named[0]!.id)
      : named.length
        ? undefined
        : npcs.length === 1
          ? npcs[0]
          : undefined;
  if (!target) return;
  const withoutName = normalize(t.replace(normalize(target.name), ""))
    .replace(/^(?:there|dar)\s+|\s+(?:there|dar)$/g, "")
    .trim();
  return /^(?:hi|hello|hey|hej|hejsan|halla|good morning|good evening)$/.test(withoutName)
    ? target
    : undefined;
}

/**
 * Who a spoken line is for. A name in the line wins, but only if that person is here.
 * Otherwise the one person present, otherwise whoever spoke last if they are still here.
 * No answer means the line is not addressed to anyone.
 */
export function speechAddressee(
  d: EncounterDefinition,
  s: EncounterState,
  text: string,
  lastSpeakerId?: string,
): Actor | undefined {
  const here = Object.values(s.actors).filter((actor) => present(d, s, actor));
  const named = Object.values(s.actors).filter(
    (actor) => actor.id !== d.playerId && containsName(text, actor),
  );
  if (named.length > 1) return undefined;
  if (named.length === 1) return here.find((actor) => actor.id === named[0]!.id);
  if (here.length === 1) return here[0];
  return here.find((actor) => actor.id === lastSpeakerId);
}
