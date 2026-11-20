import type { PlaybackStep } from "./playback";

export type TimelineLane = "image" | "sound" | "text";

export type TimelineClip = {
  lane: TimelineLane;
  source: "current" | "previous";
  start: number;
  end: number;
  enter?: number;
  leave?: number;
  waits?: boolean;
  cue?: boolean;
};

export function stepTimeline({ image, sound, text, advanceAt, readyAt, transition }: PlaybackStep) {
  const advance = advanceAt === undefined ? undefined : Math.max(advanceAt, readyAt);
  const holdUntil = advance ?? readyAt;
  const waits = advance === undefined;
  const clips: TimelineClip[] = [];

  if (image.previous && image.previous !== image.current && image.delay + image.leave > 0) {
    clips.push({
      lane: "image",
      source: "previous",
      start: 0,
      end: image.delay + image.leave,
      leave: image.leave,
    });
  }
  if (image.current) {
    clips.push({
      lane: "image",
      source: "current",
      start: image.delay,
      end: holdUntil,
      enter: image.enter,
      waits,
    });
  }

  if (text.previous && text.previous !== text.current && text.delay > 0) {
    clips.push({ lane: "text", source: "previous", start: 0, end: text.delay });
  }
  if (text.current) {
    const leave = waits ? 0 : text.leave;
    clips.push({
      lane: "text",
      source: "current",
      start: text.delay,
      end: holdUntil + leave,
      enter: text.enter,
      leave,
      waits,
    });
  }

  const action = sound.cue?.cell.action;
  const changesMusic = action === "music" || action === "stop-music";
  const musicEnd = changesMusic ? sound.delay : holdUntil;
  if (sound.previousMusic && (musicEnd > 0 || !changesMusic)) {
    clips.push({
      lane: "sound",
      source: "previous",
      start: 0,
      end: musicEnd,
      waits: waits && !changesMusic,
    });
  }
  if (sound.cue) {
    const fade = sound.cue.cell.fadeSeconds * 1000;
    clips.push({
      lane: "sound",
      source: "current",
      start: sound.delay,
      end: action === "music" ? holdUntil : sound.delay + fade,
      cue: true,
      enter: action === "stop-music" ? 0 : fade,
      leave: action === "stop-music" ? fade : 0,
      waits: waits && action === "music",
    });
  }

  return {
    clips,
    advance,
    readyAt,
    exit: text.leave,
    transition: transition.duration,
    end: Math.max(
      1000,
      Math.ceil((holdUntil + (waits ? 0 : text.leave + transition.duration)) / 1000) * 1000,
    ),
  };
}
