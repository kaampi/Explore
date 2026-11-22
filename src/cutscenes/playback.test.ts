import { describe, expect, it } from "vitest";
import {
  advancePlayback,
  planPlayback,
  playbackFrame,
  startPlayback,
  type PlaybackState,
} from "./playback";
import { CutsceneFilmSchema } from "./schema";
import { stepTimeline } from "./stepTimeline";

function film(beats: unknown[], skippable = true) {
  return CutsceneFilmSchema.parse({
    id: "test",
    title: "Test",
    beats,
    skippable,
    createdAt: "",
    updatedAt: "",
  });
}

describe("cut-scene playback clock", () => {
  it("runs delays and lengths per channel and keeps a click step until asked to continue", () => {
    const plan = planPlayback(
      film([
        {
          id: "first",
          image: {
            source: { kind: "set", imageId: "bedroom" },
            in: { effect: "fade", seconds: 2, delay: 0.5 },
            out: { effect: "fade" },
          },
          sound: { action: "music", trackId: "noise", delay: 0.25, fadeSeconds: 1 },
          text: {
            text: "First light",
            in: { effect: "typewriter", seconds: 1.25, delay: 0.75 },
            out: { effect: "fade", seconds: 0.5 },
          },
        },
      ]),
    );
    const step = plan.steps[0]!;
    expect(step).toMatchObject({
      image: { delay: 500, enter: 2000 },
      text: { delay: 750, enter: 1250, leave: 500 },
      sound: { delay: 250 },
      readyAt: 2500,
    });
    expect(playbackFrame(plan, startPlayback())).toMatchObject({
      image: undefined,
      text: undefined,
      cue: undefined,
      ready: false,
    });
    expect(playbackFrame(plan, { ...startPlayback(), elapsed: 1000 })).toMatchObject({
      imageIn: 0.25,
      textIn: 0.2,
      cue: { cell: { trackId: "noise" } },
    });
    const settled = advancePlayback(plan, startPlayback(), { type: "tick", elapsed: 8000 });
    expect(settled).toMatchObject({ step: 0, phase: "step", elapsed: 2500 });
    const exit = advancePlayback(plan, settled, { type: "continue" });
    expect(exit).toMatchObject({ phase: "exit", elapsed: 0 });
    expect(advancePlayback(plan, exit, { type: "tick", elapsed: 500 })).toEqual({
      phase: "ended",
      result: "finished",
    });
  });

  it("uses the first click to finish ongoing effects and the second to change steps", () => {
    const plan = planPlayback(
      film([
        {
          id: "first",
          text: {
            text: "A word.",
            in: { effect: "typewriter", seconds: 2 },
            out: { effect: "stay" },
          },
        },
        { id: "second" },
      ]),
    );
    const start = startPlayback();
    const complete = advancePlayback(plan, start, { type: "continue" });
    expect(complete).toEqual({ ...start, channelsDone: true });
    expect(playbackFrame(plan, { ...start, channelsDone: true }).textIn).toBe(1);
    expect(advancePlayback(plan, complete, { type: "continue" })).toEqual(startPlayback(1));
  });

  it("waits for both timed conditions and freezes the wait while paused", () => {
    const plan = planPlayback(
      film([
        {
          id: "first",
          advance: { kind: "after", seconds: 1 },
          sound: { action: "effect", delay: 2 },
        },
        { id: "second" },
      ]),
    );
    expect(plan.canPause).toBe(true);
    let state: PlaybackState = advancePlayback(plan, startPlayback(), {
      type: "tick",
      elapsed: 1000,
    });
    expect(state).toMatchObject({ step: 0, elapsed: 1000 });
    state = advancePlayback(plan, state, { type: "pause" });
    expect(advancePlayback(plan, state, { type: "tick", elapsed: 4000 })).toBe(state);
    state = advancePlayback(plan, state, { type: "pause" });
    expect(advancePlayback(plan, state, { type: "tick", elapsed: 1000 })).toEqual(startPlayback(1));

    const fast = advancePlayback(plan, startPlayback(), { type: "continue" });
    const early = advancePlayback(plan, fast, { type: "tick", elapsed: 999 });
    expect(early).toMatchObject({ step: 0, elapsed: 999 });
    expect(advancePlayback(plan, early, { type: "tick", elapsed: 1 })).toEqual(startPlayback(1));
  });

  it("keeps an earlier image, text, and looping music until a later step clears them", () => {
    const plan = planPlayback(
      film([
        {
          id: "first",
          image: {
            source: { kind: "set", imageId: "room" },
            in: { effect: "none" },
            out: { effect: "fade-black", seconds: 1 },
          },
          sound: { action: "music", trackId: "loop" },
          text: { text: "A room.", in: { effect: "none" }, out: { effect: "stay" } },
        },
        { id: "second" },
        {
          id: "third",
          image: {
            source: { kind: "clear" },
            in: { effect: "none", delay: 0.5 },
            out: { effect: "none" },
          },
          sound: { action: "stop-music", delay: 0.25 },
          text: { text: "Outside.", in: { effect: "none" }, out: { effect: "stay" } },
        },
      ]),
    );
    const first = playbackFrame(plan, startPlayback());
    const second = playbackFrame(plan, startPlayback(1));
    expect(second.image).toBe(first.image);
    expect(second.text).toBe(first.text);
    expect(second.music).toBe(first.music);
    const fading = playbackFrame(plan, { ...startPlayback(2), elapsed: 750 });
    expect(fading.image).toBeUndefined();
    expect(fading.previousImage).toBe(first.image);
    expect(fading.imageOut).toBe(0.25);
    expect(fading.music).toBeUndefined();
    expect(fading.text?.cell.text).toBe("Outside.");
  });

  it("makes simple motion immediate, with fades capped at 150 ms", () => {
    const plan = planPlayback(
      film([
        {
          id: "first",
          image: {
            source: { kind: "set", imageId: "room" },
            in: { effect: "fade", seconds: 2, delay: 4 },
            out: { effect: "none" },
          },
          text: {
            text: "Word",
            in: { effect: "typewriter", seconds: 5, delay: 1 },
            out: { effect: "zoom-out", seconds: 3 },
          },
        },
      ]),
      true,
    );
    expect(plan.steps[0]).toMatchObject({
      image: { delay: 0, enter: 150 },
      text: { delay: 0, enter: 0, leave: 0 },
    });
    expect(playbackFrame(plan, startPlayback()).textIn).toBe(1);
  });

  it("makes finishing and skipping terminal and ignores skip when the film cannot be skipped", () => {
    const plan = planPlayback(film([{ id: "only" }]));
    for (const [type, result] of [
      ["continue", "finished"],
      ["skip", "skipped"],
    ] as const) {
      const ended = advancePlayback(plan, startPlayback(), { type });
      expect(ended).toEqual({ phase: "ended", result });
      expect(advancePlayback(plan, ended, { type: "skip" })).toBe(ended);
      expect(advancePlayback(plan, ended, { type: "continue" })).toBe(ended);
    }
    const start = startPlayback();
    expect(
      advancePlayback(planPlayback(film([{ id: "only" }], false)), start, { type: "skip" }),
    ).toBe(start);
  });
});

it("transitions after text exits, keeping the incoming channel clock stopped until the boundary completes", () => {
  const source = film([
    {
      id: "first",
      text: { text: "First", in: { effect: "none" }, out: { effect: "fade", seconds: 0.5 } },
      sound: { action: "music", trackId: "music" },
      transition: { effect: "crossfade", seconds: 1 },
    },
    { id: "second", sound: { action: "effect", trackId: "knock" } },
  ]);
  const plan = planPlayback(source);
  const exit = advancePlayback(plan, startPlayback(), { type: "continue" });
  const boundary = advancePlayback(plan, exit, { type: "tick", elapsed: 500 });
  expect(boundary).toMatchObject({ phase: "transition", step: 0, elapsed: 0 });
  const half = advancePlayback(plan, boundary, { type: "tick", elapsed: 500 });
  expect(half).toMatchObject({ phase: "transition", step: 0, elapsed: 500 });
  if (half.phase === "ended") throw new Error("The transition has not finished");
  expect(playbackFrame(plan, half)).toMatchObject({
    textOut: 1,
    music: { cell: { trackId: "music" } },
    cue: { cell: { trackId: "music" } },
  });
  const next = advancePlayback(plan, half, { type: "tick", elapsed: 500 });
  expect(next).toEqual(startPlayback(1));
  expect(playbackFrame(plan, startPlayback(1)).cue?.cell.trackId).toBe("knock");
  expect(advancePlayback(plan, half, { type: "continue" })).toEqual(next);
  expect(planPlayback(source, true).steps[0]?.transition.duration).toBe(150);
  expect(source.beats[1]?.transition.effect).toBe("cut");
});

it("finishes each bounded clip on its own clock and separates an image exit from leaving the step", () => {
  const plan = planPlayback(
    film([
      {
        id: "timed",
        image: {
          source: { kind: "set", imageId: "room" },
          in: { effect: "none", delay: 1 },
          out: { effect: "melt", seconds: 2 },
          endAt: 8,
        },
        text: {
          text: "A bell rings.",
          in: { effect: "none", delay: 2 },
          out: { effect: "fade", seconds: 1 },
          endAt: 5,
        },
        sound: { action: "music", delay: 3, trackId: "bell", endAt: 7 },
      },
      { id: "after" },
    ]),
  );
  const frame = (elapsed: number) => playbackFrame(plan, { ...startPlayback(), elapsed });
  expect(frame(500)).toMatchObject({ image: undefined, text: undefined, music: undefined });
  expect(frame(4500)).toMatchObject({
    image: { imageId: "room" },
    text: { cell: { text: "A bell rings." } },
    textOut: 0.5,
    music: { cell: { trackId: "bell" } },
  });
  expect(frame(7000)).toMatchObject({
    image: undefined,
    previousImage: { imageId: "room" },
    imageOut: 0.5,
    text: undefined,
    music: undefined,
  });
  expect(frame(8000)).toMatchObject({ image: undefined, previousImage: undefined, ready: true });
  expect(playbackFrame(plan, startPlayback(1))).toMatchObject({
    image: undefined,
    text: undefined,
    music: undefined,
  });
  const timeline = stepTimeline(plan.steps[0]!);
  expect(timeline.clips.map(({ lane, start, end }) => [lane, start, end])).toEqual([
    ["image", 1000, 8000],
    ["text", 2000, 5000],
    ["sound", 3000, 7000],
  ]);
  expect(timeline.exit).toBe(0);
  expect(
    advancePlayback(plan, { ...startPlayback(), elapsed: 8000 }, { type: "continue" }),
  ).toEqual(startPlayback(1));
});

it("reveals the next background during the old background's exit and keeps other channels on their own steps", () => {
  const source = film([
    {
      id: "first",
      image: {
        source: { kind: "set", imageId: "room" },
        in: { effect: "none" },
        out: { effect: "fade", seconds: 2 },
      },
    },
    { id: "same-background" },
    {
      id: "color",
      image: {
        source: { kind: "color", color: "#38546a" },
        in: { effect: "fade", seconds: 3 },
        out: { effect: "none" },
      },
      text: { text: "Outside", in: { effect: "none" }, out: { effect: "stay" } },
      sound: { action: "music", trackId: "wind" },
    },
  ]);
  const plan = planPlayback(source);
  const next = advancePlayback(plan, startPlayback(), { type: "continue" });
  expect(next).toEqual(startPlayback(1));
  const exit = advancePlayback(plan, startPlayback(1), { type: "continue" });
  expect(exit).toMatchObject({ phase: "exit", step: 1 });
  expect(stepTimeline(plan.steps[1]!).exit).toBe(2000);
  const half = advancePlayback(plan, exit, { type: "tick", elapsed: 1000 });
  if (half.phase === "ended") throw new Error("Expected an active background transition");
  expect(playbackFrame(plan, half)).toMatchObject({
    previousImage: { imageId: "room" },
    image: { color: "#38546a" },
    imageOut: 0.5,
    imageIn: 1,
    text: undefined,
    music: undefined,
  });

  expect(advancePlayback(plan, half, { type: "tick", elapsed: 1000 })).toEqual(startPlayback(2));
  expect(playbackFrame(plan, startPlayback(2))).toMatchObject({
    previousImage: undefined,
    image: { color: "#38546a" },
    imageIn: 1,
    text: { cell: { text: "Outside" } },
    music: { cell: { trackId: "wind" } },
  });

  const delayed = structuredClone(source);
  delayed.beats[2]!.image.in.delay = 1;
  const later = planPlayback(delayed);
  expect(advancePlayback(later, startPlayback(1), { type: "continue" })).toEqual(startPlayback(2));
  expect(playbackFrame(later, startPlayback(2)).image?.imageId).toBe("room");
  expect(playbackFrame(later, { ...startPlayback(2), elapsed: 2000 })).toMatchObject({
    previousImage: { imageId: "room" },
    image: { color: "#38546a" },
    imageIn: 1,
    imageOut: 0.5,
  });

  source.beats[1]!.transition = { effect: "crossfade", seconds: 1 };
  const wholeStep = planPlayback(source);
  expect(advancePlayback(wholeStep, startPlayback(1), { type: "continue" })).toMatchObject({
    phase: "transition",
    step: 1,
  });
  expect(playbackFrame(wholeStep, startPlayback(2))).toMatchObject({
    image: { color: "#38546a" },
    imageIn: 1,
    previousImage: undefined,
  });
});
