import type { AnatomyTemplate, CharacterState, Session } from "../state/StateSchema";
import { BUILTIN_ANATOMY_TEMPLATES } from "../state/builtinAnatomy";
import { isAnatomyPartRemoved } from "../state/anatomy";

/** A figure's body plan and factions stay short so many figures fit in the prompt. */
export const MAX_FIGURE_WORDS = 30;

const SIDE_WORDS = new Set(["left", "right", "front", "hind", "back", "upper", "lower"]);
const NUMBER_WORDS = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** "front_left_leg" and "hind_right_leg" are both a "leg". */
function kindOf(partId: string): string {
  return partId
    .split("_")
    .filter((word) => !SIDE_WORDS.has(word) && !/^\d+$/.test(word))
    .join(" ");
}

function plural(kind: string): string {
  if (kind.endsWith("oof")) return `${kind.slice(0, -3)}ooves`;
  if (kind.endsWith("foot")) return `${kind.slice(0, -4)}feet`;
  if (/(s|x|sh|ch)$/.test(kind)) return `${kind}es`;
  if (/[^aeiou]y$/.test(kind)) return `${kind.slice(0, -1)}ies`;
  return `${kind}s`;
}

function phrase(kind: string, count: number): string {
  if (count === 1) return kind;
  const number = NUMBER_WORDS[count] || String(count);
  return `${number} ${plural(kind)}`;
}

/** How much a part says about the body: what it moves, holds or senses comes first. */
function weight(part: AnatomyTemplate["parts"][number]): number {
  if (part.capabilities.includes("locomote")) return 3;
  if (part.capabilities.some((c) => c === "grasp" || c === "manipulate")) return 2;
  if (part.capabilities.includes("sense")) return 1;
  return 0;
}

/** What a body summary needs to know about a figure: the same on a live character and on a card. */
export type BodyFigure = Pick<CharacterState, "anatomyTemplateId" | "anatomyOverrides">;
export type FactionFigure = Pick<CharacterState, "factionIds">;

function templateFor(
  session: Pick<Session, "anatomyTemplates">,
  character: BodyFigure,
): AnatomyTemplate | undefined {
  const id = character.anatomyTemplateId;
  if (!id) return undefined;
  return session.anatomyTemplates?.[id] ?? BUILTIN_ANATOMY_TEMPLATES.find((item) => item.id === id);
}

/**
 * A short description of a figure's body: its plan and the parts that matter, such as
 * "Arachnid: eight legs, two pedipalps, chelicerae". A human body with nothing changed
 * says nothing, since the model assumes it. Parts taken away or added are always said.
 */
export function bodyPlanSummary(
  session: Pick<Session, "anatomyTemplates">,
  character: BodyFigure,
): string | undefined {
  const template = templateFor(session, character);
  if (!template) return undefined;
  const removed = character.anatomyOverrides?.removedParts ?? [];
  const added = character.anatomyOverrides?.addedParts ?? [];
  const isHuman = template.id === "builtin-humanoid";
  if (isHuman && removed.length === 0 && added.length === 0) return undefined;

  const kept = template.parts.filter((part) => !isAnatomyPartRemoved(template, removed, part.id));
  const groups = new Map<string, { count: number; weight: number }>();
  for (const part of kept) {
    const kind = kindOf(part.id) || part.id;
    const group = groups.get(kind) ?? { count: 0, weight: 0 };
    group.count += 1;
    group.weight = Math.max(group.weight, weight(part));
    groups.set(kind, group);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].weight - a[1].weight);
  const labelOf = (id: string) =>
    template.parts.find((part) => part.id === id)?.label.toLowerCase() ?? id.replaceAll("_", " ");
  const changes = [
    ...(removed.length ? [`without ${removed.map(labelOf).join(", ")}`] : []),
    ...(added.length ? [`with extra ${added.join(", ")}`] : []),
  ].join("; ");

  const head = `${template.name}:`;
  const tail = changes ? `; ${changes}` : "";
  let text = head;
  for (const [kind, group] of ordered) {
    const next = `${text}${text === head ? " " : ", "}${phrase(kind, group.count)}`;
    if (words(next + tail) > MAX_FIGURE_WORDS) break;
    text = next;
  }
  return text === head ? `${template.name}${tail}` : `${text}${tail}`;
}

/** The names of the factions a figure belongs to, as pinned when the game began. */
export function factionSummary(
  session: Pick<Session, "factions">,
  character: FactionFigure,
): string | undefined {
  const names = (character.factionIds ?? [])
    .map((id) => session.factions?.[id]?.name.trim())
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return undefined;
  const kept: string[] = [];
  for (const name of names) {
    if (words(kept.concat(name).join(", ")) > MAX_FIGURE_WORDS) break;
    kept.push(name);
  }
  return kept.join(", ");
}
