import {
  REVEAL_PAUSE_SECONDS,
  type CutsceneBeat,
  type CutsceneFilm,
  type ImageCell,
  type SoundCell,
  type TextCell,
} from "./schema";
import { revealWords } from "./textReveal";

type ImageLayer = { step: number; imageId: string; cell: ImageCell };
type TextLayer = { step: number; cell: TextCell };
type SoundCue = { step: number; cell: SoundCell };

export type PlaybackStep = {
  image: {
    previous?: ImageLayer | undefined;
    current?: ImageLayer | undefined;
    delay: number;
    enter: number;
    leave: number;
    melt: number;
  };
  text: {
    previous?: TextLayer | undefined;
    current?: TextLayer | undefined;
    delay: number;
    enter: number;
    leave: number;
    revealPause?: { at: number; duration: number };
  };
  sound: { previousMusic?: SoundCue | undefined; cue?: SoundCue | undefined; delay: number };
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

/** Delays and durations are relative to the start of each step, in milliseconds. */
export function planPlayback(film: CutsceneFilm, simple = false): PlaybackPlan {
  let activeImage: ImageLayer | undefined;
  let heldText: TextLayer | undefined;
  let music: SoundCue | undefined;

  const steps = film.beats.map((beat, step): PlaybackStep => {
    const previousImage = activeImage;
    const changingImage = beat.image.source.kind !== "keep";
    if (beat.image.source.kind === "set")
      activeImage = { step, imageId: beat.image.source.imageId, cell: beat.image };
    else if (beat.image.source.kind === "clear") activeImage = undefined;
    const melt = changingImage && activeImage?.cell.out.effect === "melt" ? activeImage : undefined;
    const image = {
      previous: previousImage,
      current: activeImage,
      delay: changingImage && !simple ? ms(beat.image.in.delay) : 0,
      enter:
        changingImage && activeImage
          ? length(activeImage.cell.in.effect, activeImage.cell.in.seconds, simple)
          : 0,
      leave:
        changingImage && previousImage
          ? length(previousImage.cell.out.effect, previousImage.cell.out.seconds, simple)
          : 0,
      melt: melt ? length("melt", melt.cell.out.seconds, simple) : 0,
    };
    if (melt) activeImage = undefined;

    const previousText = heldText;
    const cell = beat.text;
    const currentText = cell ? { step, cell } : heldText;
    heldText = cell?.out.effect === "stay" ? currentText : cell ? undefined : heldText;
    const enter = cell ? length(cell.in.effect, cell.in.seconds, simple) : 0;
    let revealPause: PlaybackStep["text"]["revealPause"];
    if (cell?.in.effect === "word-reveal" && !simple && cell.in.pauseBefore !== undefined) {
      const wordCount = revealWords(cell.text).length;
      if (cell.in.pauseBefore <= wordCount) {
        revealPause = {
          at: ((cell.in.pauseBefore - 1) / wordCount) * enter,
          duration: ms(cell.in.pauseSeconds ?? REVEAL_PAUSE_SECONDS),
        };
      }
    }
    const text = {
      previous: previousText,
      current: currentText,
      delay: cell && !simple ? ms(cell.in.delay) : 0,
      enter: enter + (revealPause?.duration ?? 0),
      ...(revealPause ? { revealPause } : {}),
      leave: cell ? length(cell.out.effect, cell.out.seconds, simple) : 0,
    };

    const cue = beat.sound.action === "none" ? undefined : { step, cell: beat.sound };
    const sound = { previousMusic: music, cue, delay: cue ? ms(cue.cell.delay) : 0 };
    if (cue?.cell.action === "music") music = cue;
    else if (cue?.cell.action === "stop-music") music = undefined;

    const effect = step < film.beats.length - 1 ? (beat.transition?.effect ?? "cut") : "cut";
    const duration = effect === "cut" ? 0 : length("fade", beat.transition.seconds, simple);
    return {
      transition: { effect, duration },
      image,
      text,
      sound,
      readyAt: Math.max(
        image.delay + Math.max(image.enter, image.leave),
        text.delay + text.enter,
        sound.delay + (cue ? ms(cue.cell.fadeSeconds) : 0),
      ),
      advanceAt: beat.advance.kind === "after" ? ms(beat.advance.seconds) : undefined,
    };
  });
  return {
    skippable: film.skippable,
    steps,
    canPause: steps.some((step) => step.advanceAt !== undefined),
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

function leaveStep(plan: PlaybackPlan, state: Playing, step: PlaybackStep): PlaybackState {
  return Math.max(step.text.leave, step.image.melt) > 0
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
      return state.elapsed < step.image.melt ? state : transitionOrNext(plan, state, step);
    if (!state.channelsDone && state.elapsed < step.readyAt)
      return { ...state, channelsDone: true };
    return step.advanceAt === undefined ? leaveStep(plan, state, step) : state;
  }
  if (state.paused || event.elapsed <= 0) return state;
  const elapsed = state.elapsed + event.elapsed;
  if (state.phase === "exit") {
    return elapsed >= Math.max(step.text.leave, step.image.melt)
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
  const textTime = elapsed - step.text.delay;
  const image = step.image;
  const melting = image.melt > 0 && state.phase === "exit" && state.elapsed < image.melt;
  const melted = image.melt > 0 && state.phase !== "step";
  const text = step.text;
  const pause = text.revealPause;
  const pausedFor = pause ? Math.min(pause.duration, Math.max(0, textTime - pause.at)) : 0;
  const revealTime = textTime - pausedFor;
  const revealDuration = text.enter - (pause?.duration ?? 0);
  const cue = elapsed >= step.sound.delay ? step.sound.cue : undefined;
  const music =
    cue?.cell.action === "music"
      ? cue
      : cue?.cell.action === "stop-music"
        ? undefined
        : step.sound.previousMusic;
  return {
    image: melted ? undefined : imageTime < 0 ? image.previous : image.current,
    previousImage: melting
      ? image.current
      : !melted && imageTime >= 0 && image.previous !== image.current && imageTime < image.leave
        ? image.previous
        : undefined,
    imageIn: imageTime < 0 ? 1 : fraction(imageTime, image.enter),
    imageOut: melting ? fraction(state.elapsed, image.melt) : fraction(imageTime, image.leave),
    text: textTime < 0 ? text.previous : text.current,
    textIn:
      textTime < 0
        ? 1
        : pause && revealDuration === 0 && pausedFor < pause.duration
          ? 0
          : fraction(revealTime, revealDuration),
    textOut:
      state.phase === "exit" && text.leave > 0
        ? fraction(state.elapsed, text.leave)
        : state.phase === "transition" && text.leave > 0
          ? 1
          : 0,
    cue,
    music,
    ready: state.channelsDone || state.elapsed >= step.readyAt,
  };
}
