import { describe, expect, it } from "vitest";
import { BeatSchema, CutsceneFilmSchema, CutscenePlacementSchema, fromVersion1 } from "./schema";

const dates = { createdAt: "2026-11-20T00:00:00.000Z", updatedAt: "2026-11-20T00:00:00.000Z" };
const film = { id: "film", title: " The road ", beats: [{ id: "first" }], ...dates };

describe("cut-scene format", () => {
  it("keeps the film defaults and the defaults for all channels", () => {
    expect(CutsceneFilmSchema.parse(film)).toEqual({
      ...film,
      title: "The road",
      display: "column",
      skippable: true,
      images: [],
      beats: [
        {
          id: "first",
          image: {
            source: { kind: "keep" },
            in: { effect: "none", seconds: 1, delay: 0 },
            out: { effect: "none", seconds: 1 },
            during: "none",
            filter: "none",
          },
          sound: { action: "none", fadeSeconds: 0, delay: 0, volume: 0.8, caption: "" },
          transition: { effect: "cut", seconds: 1 },
          advance: { kind: "click" },
        },
      ],
    });
    expect(
      BeatSchema.parse({
        id: "text",
        text: { text: " First light ", in: { effect: "none" }, out: { effect: "stay" } },
      }).text,
    ).toEqual({
      text: "First light",
      style: "narrator",
      size: "normal",
      position: "bottom",
      align: "left",
      font: "reading",
      in: { effect: "none", seconds: 1, delay: 0 },
      out: { effect: "stay", seconds: 0.5 },
    });
  });

  it("rejects empty films, arbitrary effects, and values outside the authored ranges", () => {
    expect(CutsceneFilmSchema.safeParse({ ...film, title: " " }).success).toBe(false);
    expect(CutsceneFilmSchema.safeParse({ ...film, title: "x".repeat(121) }).success).toBe(false);
    expect(CutsceneFilmSchema.safeParse({ ...film, beats: [] }).success).toBe(false);
    expect(
      CutsceneFilmSchema.safeParse({ ...film, beats: Array(61).fill({ id: "x" }) }).success,
    ).toBe(false);
    const image = {
      id: "image",
      dataUrl: "data:image/png;base64,x",
      thumbDataUrl: "data:image/png;base64,x",
    };
    expect(CutsceneFilmSchema.safeParse({ ...film, images: Array(31).fill(image) }).success).toBe(
      false,
    );
    expect(
      CutsceneFilmSchema.safeParse({ ...film, images: [{ ...image, alt: "x".repeat(201) }] })
        .success,
    ).toBe(false);

    for (const invalid of [
      { advance: { kind: "after", seconds: 0.9 } },
      { advance: { kind: "after", seconds: 31 } },
      { sound: { action: "effect", volume: 1.01 } },
      { sound: { action: "music", delay: 31 } },
      { sound: { action: "music", endAt: 151 } },
      { sound: { action: "music", caption: "x".repeat(121) } },
      { text: { text: "x".repeat(1201), in: { effect: "fade" }, out: { effect: "stay" } } },
      { text: { text: "A word", in: { effect: "fade", seconds: 31 }, out: { effect: "stay" } } },
      { text: { text: "A word", in: { effect: "custom" }, out: { effect: "stay" } } },
    ]) {
      expect(BeatSchema.safeParse({ id: "step", ...invalid }).success).toBe(false);
    }
  });

  it("turns old records into a reusable film and a placement with the original queue id", () => {
    const old = {
      id: "old-intro",
      title: "The room",
      paragraphs: ["One.", "Two."],
      imageDataUrl: "data:image/png;base64,x",
      trigger: { kind: "scene", sceneId: "first-room" },
      setsFlags: ["awake"],
      minutes: 10,
      position: { x: 20, y: 60 },
      storyboardSectionId: "intro",
    };
    const result = fromVersion1(JSON.parse(JSON.stringify(old)), dates)!;
    expect(result.placement).toEqual({
      id: old.id,
      filmId: result.film.id,
      trigger: { ...old.trigger, every: false },
      setsFlags: old.setsFlags,
      minutes: old.minutes,
      showInStory: true,
      position: old.position,
      storyboardSectionId: old.storyboardSectionId,
    });
    expect(result.film).toMatchObject({
      ...dates,
      title: old.title,
      skippable: true,
      display: "column",
    });
    expect(result.film.beats.map((beat) => beat.text?.text)).toEqual(old.paragraphs);
    expect(result.film.beats.map((beat) => beat.advance.kind)).toEqual(["click", "click"]);
    expect(result.film.beats[0]?.image.source).toEqual({
      kind: "set",
      imageId: result.film.images[0]?.id,
    });
    expect(result.film.beats[1]?.image.source).toEqual({ kind: "keep" });
    expect(CutscenePlacementSchema.parse(old)).toEqual(result.placement);
    expect(CutscenePlacementSchema.parse(result.placement)).toEqual(result.placement);
    expect(fromVersion1(result.placement)).toBeUndefined();
  });
});

it("sorts text clips and accepts touching edges but rejects overlap or repeated IDs", () => {
  const text = (id: string, delay: number, endAt: number) => ({
    id,
    text: id,
    in: { effect: "none", delay },
    out: { effect: "stay" },
    endAt,
  });
  const first = text("first", 4, 7);
  const second = text("second", 7, 10);
  expect(
    BeatSchema.parse({ id: "one", textClips: [second, first] }).textClips?.map(({ id }) => id),
  ).toEqual(["first", "second"]);
  for (const invalid of [text("second", 6.9, 10), text("first", 7, 10), text("second", 7, 7.05)]) {
    expect(BeatSchema.safeParse({ id: "one", textClips: [first, invalid] }).success).toBe(false);
  }
});
