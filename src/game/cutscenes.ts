import type { Session } from "../state/StateSchema";
import { SessionNotIdleError } from "../session/SessionStateMachine";
import { currentFlags } from "./AdventureEngine";
import type { CutscenePlacement } from "./CutsceneSchema";

/** Find new triggers in order, using the campaign order within each trigger kind. */
export function dueCutscenes(before: Session, after: Session): string[] {
  const run = after.adventure;
  if (!run?.cutscenes.length) return [];

  const links = new Set(
    run.transitions.slice(before.adventure?.transitions.length ?? 0).map((step) => step.linkId),
  );
  const beforeFlags = currentFlags(before);
  const afterFlags = currentFlags(after);
  const seen = new Set(run.cutscenesSeen);
  const pending = new Set(run.cutscenesPending);
  const films = new Set(run.cutsceneFilms.map(({ id }) => id));
  const due = { link: [] as string[], facts: [] as string[], scene: [] as string[] };
  for (const { id, filmId, trigger } of run.cutscenes) {
    if (!films.has(filmId)) continue;
    if (pending.has(id) || (seen.has(id) && !(trigger.kind === "scene" && trigger.every))) continue;
    switch (trigger.kind) {
      case "link":
        if (links.has(trigger.linkId)) due.link.push(id);
        break;
      case "facts":
        if (
          trigger.flags.every((flag) => afterFlags.has(flag)) &&
          !trigger.flags.every((flag) => beforeFlags.has(flag))
        )
          due.facts.push(id);
        break;
      case "scene":
        if (
          run.currentSceneId === trigger.sceneId &&
          before.adventure?.currentSceneId !== trigger.sceneId
        )
          due.scene.push(id);
        break;
    }
  }
  return [...due.link, ...due.facts, ...due.scene];
}

export function queueCutscenes(session: Session, ids: string[]): Session {
  const run = session.adventure;
  if (!run || !ids.length) return session;
  return {
    ...session,
    adventure: { ...run, cutscenesPending: [...new Set([...run.cutscenesPending, ...ids])] },
  };
}

export function pendingCutscene(session: Session): CutscenePlacement | undefined {
  const run = session.adventure;
  return run?.cutscenes.find(({ id }) => id === run.cutscenesPending[0]);
}

/** When a way started the queue, the arrival is held even across a saved game. */
export function pendingCutsceneArrival(session: Session) {
  const run = session.adventure;
  const move = run?.transitions.at(-1);
  if (!run?.cutscenesPending.length || !move) return undefined;
  const turns = session.conversation as { cutsceneId?: unknown; adventureSceneId?: unknown }[];
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn?.cutsceneId) continue;
    return turn?.adventureSceneId === move.to ? move : undefined;
  }
}

export function requireNoPendingCutscene(session: Session): void {
  if (session.adventure?.cutscenesPending.length) throw new SessionNotIdleError("cutscene");
}

/** Reading to the end and skipping are the same engine step. Only the head can finish. */
export function finishCutscene(session: Session, id: string): Session {
  const run = session.adventure;
  const cutscene = pendingCutscene(session);
  if (!run || !cutscene || cutscene.id !== id) return session;
  const film = run.cutsceneFilms.find((item) => item.id === cutscene.filmId);
  const content = film?.beats.flatMap(({ text }) => (text ? [text.text] : [])).join("\n\n") ?? "";

  const turn =
    Math.max(
      0,
      ...session.conversation.map((entry) =>
        typeof entry === "object" && entry !== null && "turn" in entry
          ? Number(entry.turn) || 0
          : 0,
      ),
    ) + 1;
  const next: Session = {
    ...session,
    stateVersion: session.stateVersion + 1,
    storyFlags: [...new Set([...session.storyFlags, ...cutscene.setsFlags])],
    ...(session.encounter
      ? {
          encounter: {
            ...session.encounter,
            state: {
              ...session.encounter.state,
              flags: [...new Set([...session.encounter.state.flags, ...cutscene.setsFlags])],
            },
          },
        }
      : {}),
    adventure: {
      ...run,
      cutscenesPending: run.cutscenesPending.slice(1),
      cutscenesSeen: [...run.cutscenesSeen, id],
      clockMinutes: run.clockMinutes + (cutscene.minutes ?? 0),
    },
    conversation:
      cutscene.showInStory && film
        ? [
            ...session.conversation,
            {
              turn,
              role: "character",
              toldBy: "narrator",
              content,
              cutsceneId: id,
            },
          ]
        : session.conversation,
  };
  const queued = queueCutscenes(next, dueCutscenes(session, next));
  const arrived = queued.adventure;
  if (!arrived || arrived.cutscenesPending.length) return queued;
  const move = pendingCutsceneArrival(session);
  if (!move) return queued;

  return {
    ...queued,
    adventure: {
      ...arrived,
      transitions: [
        ...run.transitions.slice(0, -1),
        { ...move, clockMinutes: arrived.clockMinutes },
      ],
    },
  };
}
