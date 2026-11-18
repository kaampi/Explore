import { adventureHistoryEntry, storySegments } from "../../game/AdventureEngine";
import { statName } from "../../game/narration";
import type { ActionCheck } from "../../game/EncounterSchema";
import type { Session } from "../../state/StateSchema";
import { isCombatRecord } from "../components/CombatLog";

type Turn = {
  turn: number;
  role: string;
  content: string;
  actionId?: string;
  actionSceneId?: string;
  speakerId?: string;
  speakerName?: string;
  ai?: { kind?: string };
};

/** One line of the story, as it is drawn. The kinds are the kinds the design lists. */
export type StoryRow =
  | { kind: "divider"; key: string; place: string; minutes: number; current: boolean }
  /** Running prose: no bubble, no label. */
  | { kind: "narrator"; key: string; turn: number; text: string }
  /** What the player said: "YOU · SAY", a quote. */
  | { kind: "say"; key: string; turn: number; text: string }
  /** What the player did: "YOU · DO", the name of the action. */
  | { kind: "do"; key: string; turn: number; label: string }
  /** What a person said. `improvised` is a line the AI wrote, with no prepared answer behind it. */
  | {
      kind: "person";
      key: string;
      turn: number;
      name: string;
      text: string;
      improvised: boolean;
      sceneId?: string;
    }
  /** A roll, in one line: who, which skill, the roll against the chance, and how it went. */
  | {
      kind: "check";
      key: string;
      actor: string;
      skill: string;
      roll: number;
      target: number;
      degree: ActionCheck["degree"];
      damage?: number;
    };

/**
 * The story as rows. By default only the place the player is in; with `earlier`, every place they
 * have been in, each under a divider with its name and the time they came. Fights are left out:
 * they are told by the combat view.
 */
export function storyRows(session: Session, options: { earlier?: boolean } = {}): StoryRow[] {
  const turns = session.conversation as Turn[];
  const player = session.encounter?.state.actors[session.encounter.definition.playerId];
  const nameOfActor = (actorId: string | undefined) =>
    actorId
      ? (session.encounter?.state.actors[actorId]?.name ?? session.adventure?.actors[actorId]?.name)
      : undefined;
  const segments = storySegments(session);
  const shown = options.earlier ? segments : segments.slice(-1);
  const rows: StoryRow[] = [];
  for (const [position, segment] of shown.entries()) {
    rows.push({
      kind: "divider",
      key: `place:${segment.from}`,
      place: segment.place,
      minutes: segment.minutes,
      current: segment === segments.at(-1) && position === shown.length - 1,
    });
    for (let index = segment.from; index < segment.to; index++) {
      const turn = turns[index];
      if (!turn || typeof turn !== "object") continue;
      const entry = index ? adventureHistoryEntry(session, turn, index) : undefined;
      if (isCombatRecord(entry)) continue;
      if (turn.role === "player") {
        const first = entry?.events[0];
        const interaction =
          first?.kind === "interaction"
            ? session.encounter?.definition.interactions.find((i) => i.id === first.interactionId)
            : undefined;
        // Words the player typed: a line nobody prepared an answer for, a greeting, or a line the
        // engine matched to a conversation, whose label is then not the words that were said.
        const spoken =
          !!entry &&
          (entry.events.some((e) => e.kind === "say" || e.kind === "speech-reply") ||
            (!!interaction && interaction.label !== entry.label));
        rows.push(
          spoken
            ? { kind: "say", key: `t${turn.turn}`, turn: turn.turn, text: turn.content }
            : { kind: "do", key: `t${turn.turn}`, turn: turn.turn, label: turn.content },
        );
        continue;
      }
      for (const [i, check] of (entry?.checks ?? []).entries())
        rows.push({
          kind: "check",
          key: `t${turn.turn}:c${i}`,
          actor: nameOfActor(check.actorId) ?? check.actorId,
          skill: session.encounter
            ? statName(session.encounter.definition, check.stat)
            : check.stat,
          roll: check.roll,
          target: check.target,
          degree: check.degree,
          ...(check.damage ? { damage: check.damage } : {}),
        });
      const speaker = nameOfActor(turn.speakerId ?? entry?.speakerId) ?? turn.speakerName;
      const improvised = turn.ai?.kind === "free-reply";
      rows.push(
        speaker && speaker !== player?.name
          ? {
              kind: "person",
              key: `t${turn.turn}`,
              turn: turn.turn,
              name: speaker,
              text: turn.content,
              improvised,
              ...(turn.actionSceneId ? { sceneId: turn.actionSceneId } : {}),
            }
          : { kind: "narrator", key: `t${turn.turn}`, turn: turn.turn, text: turn.content },
      );
    }
  }
  return rows;
}
