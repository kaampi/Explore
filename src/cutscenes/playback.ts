import {
  MIN_CLIP_MS,
  REVEAL_PAUSE_SECONDS,
  type CutsceneBeat,
  type CutsceneFilm,
  type ImageCell,
  type SoundCell,
  type TextCell,
} from "./schema";
import { revealWords } from "./textReveal";

type ImageLayer = { step: number; cell: ImageCell } & (
  { imageId: string; color?: never } | { color: string; imageId?: never }
);
type TextLayer = { step: number; cell: TextCell; clipId?: string };
type TextTiming = {
  delay: number;
  enter: number;
  leave: number;
  shortened?: true;
  revealPause?: { at: number; duration: number };
};
type TextPlayback = TextTiming & {
  previous?: TextLayer | undefined;
  current?: TextLayer | undefined;
  end?: number;
};
type ScheduledText = TextTiming & {
  current: TextLayer & { clipId: string };
  end: number;
};
type SoundCue = { step: number; cell: SoundCell };

export type PlaybackStep = {
  image: {
    previous?: ImageLayer | undefined;
    current?: ImageLayer | undefined;
    delay: number;
    enter: number;
    leave: number;
    onAdvance?: { duration: number; reveal?: ImageLayer | undefined };
    exit: number;
    end?: number;
  };
  text: TextPlayback;
  textClips: ScheduledText[];
  sound: {
    previousMusic?: SoundCue | undefined;
    cue?: SoundCue | undefined;
    delay: number;
    end?: number;
  };
  transition: {
    effect: CutsceneBeat["transition"]["effect"];
    duration: number;
  };
  readyAt: number;
  advanceAt: number | undefined;
};

export type PlaybackPlan = { skippable: boolean; steps: PlaybackStep[]; canPause: boolean };

const ms = (seconds: number) => seconds * 1000;

function length(effect: string, seconds: number, simple: boolean) {
  if (effect === "none" || effect === "stay") return 0;
  if (!simple) return ms(seconds);
  return effect.startsWith("fade") ? Math.min(ms(seconds), 150) : 0;
}

function textTiming(cell: TextCell, simple: boolean, span?: number): TextTiming {
  const entrance = length(cell.in.effect, cell.in.seconds, simple);
  const leave = length(cell.out.effect, cell.out.seconds, simple);
  let revealPause: TextTiming["revealPause"];
  if (cell.in.effect === "word-reveal" && !simple && cell.in.pauseBefore !== undefined) {
    const wordCount = revealWords(cell.text).length;
    if (cell.in.pauseBefore <= wordCount) {
      revealPause = {
        at: ((cell.in.pauseBefore - 1) / wordCount) * entrance,
        duration: ms(cell.in.pauseSeconds ?? REVEAL_PAUSE_SECONDS),
      };
    }
  }
  const enter = entrance + (revealPause?.duration ?? 0);
  // Keep both effects inside the scheduled clip, even when its edges are trimmed.
  const scale =
    span === undefined || enter + leave === 0
      ? 1
      : Math.min(1, Math.max(0, span - MIN_CLIP_MS) / (enter + leave));
  return {
    delay: simple && span === undefined ? 0 : ms(cell.in.delay),
    enter: enter * scale,
    leave: leave * scale,
    ...(scale < 1 ? { shortened: true as const } : {}),
    ...(revealPause
      ? { revealPause: { at: revealPause.at * scale, duration: revealPause.duration * scale } }
      : {}),
  };
}

function backgroundLayer(cell: ImageCell, step: number): ImageLayer | undefined {
  const { source } = cell;
  if (source.kind === "set") return { step, cell, imageId: source.imageId };
  if (source.kind === "color") return { step, cell, color: source.color };
  return undefined;
}

/** Delays and durations are relative to the start of each step, in milliseconds. */
export function planPlayback(film: CutsceneFilm, simple = false): PlaybackPlan {
  let activeImage: ImageLayer | undefined;
  let heldText: TextLayer | undefined;
  let music: SoundCue | undefined;
  let changedAtBoundary = false;
  const backgrounds = film.beats.map(({ image }, step) => backgroundLayer(image, step));

  const steps = film.beats.map((beat, step): PlaybackStep => {
    const incoming = backgrounds[step];
    const replacing = beat.image.source.kind !== "keep";
    const previousImage = changedAtBoundary ? undefined : activeImage;
    const changingOnEntry = replacing && !changedAtBoundary;
    if (replacing) activeImage = incoming;
    const imageDelay = changingOnEntry && !simple ? ms(beat.image.in.delay) : 0;
    const imageLeave =
      changingOnEntry && previousImage
        ? length(previousImage.cell.out.effect, previousImage.cell.out.seconds, simple)
        : 0;
    const imageEnter =
      changingOnEntry && incoming && imageLeave === 0
        ? length(incoming.cell.in.effect, incoming.cell.in.seconds, simple)
        : 0;
    const imageExit = activeImage
      ? length(activeImage.cell.out.effect, activeImage.cell.out.seconds, simple)
      : 0;
    const imageEnd =
      incoming?.cell.endAt !== undefined
        ? Math.max(
            ms(incoming.cell.endAt),
            imageDelay + Math.max(imageEnter, imageLeave) + imageExit + MIN_CLIP_MS,
          )
        : undefined;
    const next = film.beats[step + 1];
    const effect = next ? beat.transition.effect : "cut";
    const duration = effect === "cut" ? 0 : length("fade", beat.transition.seconds, simple);
    const nextChangesNow =
      next !== undefined &&
      next.image.source.kind !== "keep" &&
      (simple || next.image.in.delay === 0);
    // A whole-step transition owns the visual handoff when one is configured.
    const revealNext = duration === 0 && nextChangesNow && imageEnd === undefined && imageExit > 0;
    const meltsOnAdvance = incoming?.cell.out.effect === "melt" && imageEnd === undefined;
    const onAdvance =
      revealNext || (meltsOnAdvance && !(nextChangesNow && duration > 0))
        ? { duration: imageExit, reveal: revealNext ? backgrounds[step + 1] : undefined }
        : undefined;
    const image = {
      previous: previousImage,
      current: activeImage,
      delay: imageDelay,
      enter: imageEnter,
      leave: imageLeave,
      exit: imageExit,
      ...(onAdvance ? { onAdvance } : {}),
      ...(imageEnd !== undefined ? { end: imageEnd } : {}),
    };
    changedAtBoundary = nextChangesNow && (duration > 0 || Boolean(revealNext));
    if (onAdvance || imageEnd !== undefined) activeImage = undefined;

    const previousText = heldText;
    const textClips: ScheduledText[] = (beat.textClips ?? []).map((cell) => ({
      ...textTiming(cell, simple, ms(cell.endAt - cell.in.delay)),
      current: { step, cell, clipId: cell.id },
      end: ms(cell.endAt),
    }));
    const cell = beat.textClips ? undefined : beat.text;
    const currentText = cell ? { step, cell } : beat.textClips ? undefined : heldText;
    if (beat.textClips) heldText = undefined;
    else if (cell)
      heldText = cell.out.effect === "stay" && cell.endAt === undefined ? currentText : undefined;
    const textLayout = cell
      ? textTiming(cell, simple)
      : { delay: textClips[0]?.delay ?? 0, enter: 0, leave: 0 };
    const { delay, enter, leave } = textLayout;
    const textEnd =
      cell?.endAt === undefined
        ? undefined
        : Math.max(ms(cell.endAt), delay + enter + leave + MIN_CLIP_MS);
    const text = {
      ...textLayout,
      previous: previousText,
      current: currentText,
      ...(textEnd !== undefined ? { end: textEnd } : {}),
    };

    const cue = beat.sound.action === "none" ? undefined : { step, cell: beat.sound };
    const soundDelay = cue ? ms(cue.cell.delay) : 0;
    const soundReady = soundDelay + (cue ? ms(cue.cell.fadeSeconds) : 0);
    const soundEnd =
      cue?.cell.endAt === undefined || cue.cell.action === "stop-music"
        ? undefined
        : Math.max(ms(cue.cell.endAt), soundReady + MIN_CLIP_MS);
    const sound = {
      previousMusic: music,
      cue,
      delay: soundDelay,
      ...(soundEnd !== undefined ? { end: soundEnd } : {}),
    };
    if (cue?.cell.action === "music") music = soundEnd === undefined ? cue : undefined;
    else if (cue?.cell.action === "stop-music") music = undefined;

    return {
      transition: { effect, duration },
      image,
      text,
      textClips,
      sound,
      readyAt: Math.max(
        image.end ?? image.delay + Math.max(image.enter, image.leave),
        textClips.at(-1)?.end ?? text.end ?? text.delay + text.enter,
        sound.end ?? soundReady,
      ),
      advanceAt: beat.advance.kind === "after" ? ms(beat.advance.seconds) : undefined,
    };
  });
  return {
    skippable: film.skippable,
    steps,
    canPause: steps.some(
      (step) =>
        step.advanceAt !== undefined ||
        step.image.end !== undefined ||
        (step.image.onAdvance?.duration ?? 0) > 0 ||
        step.text.end !== undefined ||
        step.textClips.length > 0 ||
        step.sound.end !== undefined,
    ),
  };
}

type Playing = {
  step: number;
  phase: "step" | "exit" | "transition";
  elapsed: number;
  channelsDone: boolean;
  paused: boolean;
};
export type PlaybackState = Playing | { phase: "ended"; result: "finished" | "skipped" };
export type PlaybackEvent =
  { type: "tick"; elapsed: number } | { type: "continue" } | { type: "pause" } | { type: "skip" };

export function startPlayback(step = 0): Playing {
  return { step, phase: "step", elapsed: 0, channelsDone: false, paused: false };
}

function nextStep(plan: PlaybackPlan, state: Playing): PlaybackState {
  if (state.step + 1 === plan.steps.length) return { phase: "ended", result: "finished" };
  return { ...startPlayback(state.step + 1), paused: state.paused };
}

function transitionOrNext(plan: PlaybackPlan, state: Playing, step: PlaybackStep): PlaybackState {
  return step.transition.duration
    ? { ...state, phase: "transition", elapsed: 0, channelsDone: true }
    : nextStep(plan, state);
}

function exitLength(step: PlaybackStep) {
  return Math.max(
    step.text.end === undefined ? step.text.leave : 0,
    step.image.onAdvance?.duration ?? 0,
  );
}

function leaveStep(plan: PlaybackPlan, state: Playing, step: PlaybackStep): PlaybackState {
  return exitLength(step) > 0
    ? { ...state, phase: "exit", elapsed: 0, channelsDone: true }
    : transitionOrNext(plan, state, step);
}

/** A terminal state absorbs every input. Consumers emit its result once, and only while mounted. */
export function advancePlayback(
  plan: PlaybackPlan,
  state: PlaybackState,
  event: PlaybackEvent,
): PlaybackState {
  if (state.phase === "ended") return state;
  if (event.type === "skip") return plan.skippable ? { phase: "ended", result: "skipped" } : state;
  if (event.type === "pause") return plan.canPause ? { ...state, paused: !state.paused } : state;

  const step = plan.steps[state.step]!;
  if (event.type === "continue") {
    if (state.phase === "transition") return nextStep(plan, state);
    if (state.phase === "exit")
      return state.elapsed < (step.image.onAdvance?.duration ?? 0)
        ? state
        : transitionOrNext(plan, state, step);
    if (state.elapsed < (step.textClips.at(-1)?.end ?? 0)) return state;
    if (!state.channelsDone && state.elapsed < step.readyAt)
      return { ...state, channelsDone: true };
    return step.advanceAt === undefined ? leaveStep(plan, state, step) : state;
  }
  if (state.paused || event.elapsed <= 0) return state;
  const elapsed = state.elapsed + event.elapsed;
  if (state.phase === "exit") {
    return elapsed >= exitLength(step)
      ? transitionOrNext(plan, state, step)
      : { ...state, elapsed };
  }
  if (state.phase === "transition") {
    return elapsed >= step.transition.duration ? nextStep(plan, state) : { ...state, elapsed };
  }
  if (step.advanceAt !== undefined) {
    const deadline = state.channelsDone ? step.advanceAt : Math.max(step.advanceAt, step.readyAt);
    return elapsed >= deadline ? leaveStep(plan, state, step) : { ...state, elapsed };
  }
  const capped = Math.min(elapsed, step.readyAt);
  return capped === state.elapsed ? state : { ...state, elapsed: capped };
}

function fraction(elapsed: number, duration: number) {
  return duration === 0 ? 1 : Math.min(1, Math.max(0, elapsed / duration));
}

/** A renderable projection of the clock. It reads no engine or media state. */
export function playbackFrame(plan: PlaybackPlan, state: Playing) {
  const step = plan.steps[state.step]!;
  const elapsed = state.channelsDone ? step.readyAt : state.elapsed;
  const imageTime = elapsed - step.image.delay;
  const image = step.image;
  const boundary = state.phase === "step" ? undefined : image.onAdvance;
  const leavingBackground = boundary && state.phase === "exit" && state.elapsed < boundary.duration;
  const timedImageExit =
    image.end !== undefined &&
    image.exit > 0 &&
    elapsed >= image.end - image.exit &&
    elapsed < image.end
      ? fraction(elapsed - (image.end - image.exit), image.exit)
      : undefined;
  const imageGone = image.end !== undefined && elapsed >= image.end;
  const text: TextPlayback =
    step.textClips.find((clip) => elapsed >= clip.delay && elapsed < clip.end) ?? step.text;
  const textTime = elapsed - text.delay;
  const pause = text.revealPause;
  const pausedFor = pause ? Math.min(pause.duration, Math.max(0, textTime - pause.at)) : 0;
  const revealTime = textTime - pausedFor;
  const revealDuration = text.enter - (pause?.duration ?? 0);
  const soundStarted = elapsed >= step.sound.delay;
  const soundEnded = step.sound.end !== undefined && elapsed >= step.sound.end;
  const cue = soundStarted && !soundEnded ? step.sound.cue : undefined;
  const action = soundStarted ? step.sound.cue?.cell.action : undefined;
  const music =
    action === "music" ? cue : action === "stop-music" ? undefined : step.sound.previousMusic;
  return {
    image: boundary
      ? boundary.reveal
      : imageGone || timedImageExit !== undefined
        ? undefined
        : imageTime < 0
          ? image.previous
          : image.current,
    previousImage:
      leavingBackground || timedImageExit !== undefined
        ? image.current
        : !boundary &&
            !imageGone &&
            imageTime >= 0 &&
            image.previous !== image.current &&
            imageTime < image.leave
          ? image.previous
          : undefined,
    imageIn: boundary || imageTime < 0 ? 1 : fraction(imageTime, image.enter),
    imageOut:
      timedImageExit ??
      (leavingBackground
        ? fraction(state.elapsed, boundary.duration)
        : fraction(imageTime, image.leave)),
    text:
      text.end !== undefined && elapsed >= text.end
        ? undefined
        : textTime < 0
          ? text.previous
          : text.current,
    textIn:
      textTime < 0
        ? 1
        : pause && revealDuration === 0 && pausedFor < pause.duration
          ? 0
          : fraction(revealTime, revealDuration),
    textOut:
      text.end !== undefined
        ? text.leave > 0
          ? fraction(elapsed - (text.end - text.leave), text.leave)
          : 0
        : state.phase === "exit" && text.leave > 0
          ? fraction(state.elapsed, text.leave)
          : state.phase === "transition" && text.leave > 0
            ? 1
            : 0,
    cue,
    music,
    ready: state.channelsDone || state.elapsed >= step.readyAt,
  };
}
