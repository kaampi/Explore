import type { PlaybackStep } from "./playback";

type Lane = "image" | "sound" | "text";
type Span = {
  lane: Lane;
  style: "hold" | "in" | "out";
  start: number;
  end: number;
};

export function stepTimeline({ image, sound, text, advanceAt, readyAt, transition }: PlaybackStep) {
  const advance = advanceAt === undefined ? undefined : Math.max(advanceAt, readyAt);
  const holdUntil = advance ?? readyAt;
  const spans: Span[] = [];
  function add(lane: Lane, style: Span["style"], start: number, end: number) {
    if (end > start) spans.push({ lane, style, start, end });
  }

  if (image.previous !== image.current && image.previous) {
    add("image", "hold", 0, image.delay);
    add("image", "out", image.delay, image.delay + image.leave);
  }
  if (image.current) {
    add("image", "in", image.delay, image.delay + image.enter);
    add("image", "hold", image.delay + image.enter, holdUntil);
  }

  if (text.previous && text.previous !== text.current) add("text", "hold", 0, text.delay);
  if (text.current) {
    add("text", "in", text.delay, text.delay + text.enter);
    add("text", "hold", text.delay + text.enter, holdUntil);
    if (advance !== undefined) add("text", "out", advance, advance + text.leave);
  }

  const action = sound.cue?.cell.action;
  const changesMusic = action === "music" || action === "stop-music";
  if (sound.previousMusic) add("sound", "hold", 0, changesMusic ? sound.delay : holdUntil);
  if (sound.cue) {
    const fadeEnd = sound.delay + sound.cue.cell.fadeSeconds * 1000;
    add("sound", action === "stop-music" ? "out" : "in", sound.delay, fadeEnd);
    if (action === "music") add("sound", "hold", fadeEnd, holdUntil);
  }

  return {
    spans,
    advance,
    readyAt,
    cue: sound.cue ? sound.delay : undefined,
    exit: text.leave,
    transition: transition.duration,
    open: {
      image: !!image.current,
      text: !!text.current,
      sound: action === "music" || (!!sound.previousMusic && action !== "stop-music"),
    },
    end: Math.max(
      1000,
      Math.ceil(
        (holdUntil + (advance === undefined ? 0 : text.leave + transition.duration)) / 1000,
      ) * 1000,
    ),
  };
}
