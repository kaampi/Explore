import type { PlaybackStep } from "./playback";
import { MAX_CLIP_END_SECONDS, MAX_CLIP_START_SECONDS, MIN_CLIP_MS } from "./schema";

export type TimelineLane = "image" | "sound" | "text";

export type ClipEdge = "start" | "end";
export type ClipBounds = {
  minStart: number;
  maxStart: number;
  minEnd: number;
  maxEnd: number;
  fixedEnd?: number;
};

export type TimelineClip = {
  lane: TimelineLane;
  source: "current" | "previous";
  textClipId?: string;
  start: number;
  end: number;
  enter?: number;
  leave?: number;
  waits?: boolean;
  cue?: boolean;
  bounds?: ClipBounds;
};

export function clipBounds(step: PlaybackStep, lane: TimelineLane): ClipBounds | undefined {
  let delay: number;
  let occupied: number;
  let end: number | undefined;
  if (lane === "image") {
    const { image } = step;
    if (!image.current || image.current === image.previous) return undefined;
    delay = image.delay;
    occupied = Math.max(image.enter, image.leave) + image.exit;
    end = image.end;
  } else if (lane === "text") {
    const { text } = step;
    if (!text.current || text.current === text.previous) return undefined;
    delay = text.delay;
    occupied = text.enter + text.leave;
    end = text.end;
  } else {
    const { sound } = step;
    if (!sound.cue || sound.cue.cell.action === "stop-music") return undefined;
    delay = sound.delay;
    occupied = sound.cue.cell.fadeSeconds * 1000;
    end = sound.end;
  }
  const startMax = MAX_CLIP_START_SECONDS * 1000;
  return {
    minStart: 0,
    minEnd: delay + occupied + MIN_CLIP_MS,
    maxStart: end === undefined ? startMax : Math.min(startMax, end - occupied - MIN_CLIP_MS),
    maxEnd: MAX_CLIP_END_SECONDS * 1000,
    ...(end === undefined ? {} : { fixedEnd: end }),
  };
}

export function stepTimeline(step: PlaybackStep) {
  const { image, sound, text, advanceAt, readyAt, transition } = step;
  const advance = advanceAt === undefined ? undefined : Math.max(advanceAt, readyAt);
  const holdUntil = advance ?? readyAt;
  const waits = advance === undefined;
  const exit = Math.max(image.melt, text.end === undefined ? text.leave : 0);
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
    const bounds = clipBounds(step, "image");
    clips.push({
      lane: "image",
      source: "current",
      start: image.delay,
      end: image.end ?? holdUntil + (waits ? 0 : image.melt),
      enter: image.enter,
      leave: image.end !== undefined ? image.exit : waits ? 0 : image.melt,
      waits: waits && image.end === undefined,
      ...(bounds ? { bounds } : {}),
    });
  }

  if (text.previous && text.previous !== text.current && text.delay > 0) {
    clips.push({ lane: "text", source: "previous", start: 0, end: text.delay });
  }
  if (text.current) {
    const leave = waits && text.end === undefined ? 0 : text.leave;
    const bounds = clipBounds(step, "text");
    clips.push({
      lane: "text",
      source: "current",
      start: text.delay,
      end: text.end ?? holdUntil + leave,
      enter: text.enter,
      leave,
      waits: waits && text.end === undefined,
      ...(bounds ? { bounds } : {}),
    });
  }
  step.textClips.forEach((clip, index, track) => {
    clips.push({
      lane: "text",
      source: "current",
      textClipId: clip.current.clipId,
      start: clip.delay,
      end: clip.end,
      enter: clip.enter,
      leave: clip.leave,
      bounds: {
        minStart: track[index - 1]?.end ?? 0,
        maxStart: clip.end - MIN_CLIP_MS,
        minEnd: clip.delay + MIN_CLIP_MS,
        maxEnd: track[index + 1]?.delay ?? MAX_CLIP_END_SECONDS * 1000,
        fixedEnd: clip.end,
      },
    });
  });

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
    const bounds = clipBounds(step, "sound");
    clips.push({
      lane: "sound",
      source: "current",
      start: sound.delay,
      end: sound.end ?? (action === "music" ? holdUntil : sound.delay + fade),
      cue: true,
      enter: action === "stop-music" ? 0 : fade,
      leave: action === "stop-music" ? fade : 0,
      waits: waits && action === "music" && sound.end === undefined,
      ...(bounds ? { bounds } : {}),
    });
  }

  return {
    clips,
    advance,
    readyAt,
    exit,
    transition: transition.duration,
    end: Math.max(
      1000,
      Math.ceil((holdUntil + (waits ? 0 : exit + transition.duration)) / 1000) * 1000,
    ),
  };
}
