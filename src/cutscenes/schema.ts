import { z } from "zod";
import { StoryboardPositionSchema } from "../library/storyboardPosition";

const Seconds = z.number().min(0).max(30);
export const SIGNAL_DEFAULTS = { strength: 70, density: 50, seconds: 6 } as const;
const Percentage = z.number().min(0).max(100);
export const IMAGE_MOTION_SECONDS = {
  "slow-zoom": 14,
  "pan-left": 12,
  "pan-right": 12,
  shake: 0.55,
  unblur: 1.6,
} as const;
export const MAX_CLIP_START_SECONDS = 30;
export const MAX_CLIP_END_SECONDS = 150;
export const MIN_CLIP_MS = 100;
const MAX_TEXT_CLIP_START_SECONDS = MAX_CLIP_END_SECONDS - MIN_CLIP_MS / 1000;
const Delay = z.number().min(0).max(MAX_CLIP_START_SECONDS).default(0);
const ClipEnd = z.number().min(0).max(MAX_CLIP_END_SECONDS).optional();

export const REVEAL_PAUSE_SECONDS = 1;
const SignalSettingsSchema = z.object({
  seconds: Seconds.default(SIGNAL_DEFAULTS.seconds),
  strength: Percentage.default(SIGNAL_DEFAULTS.strength),
  density: Percentage.default(SIGNAL_DEFAULTS.density),
});
export type SignalSettings = z.infer<typeof SignalSettingsSchema>;

export const CutsceneImageSchema = z.object({
  id: z.string().min(1),
  dataUrl: z.string(),
  thumbDataUrl: z.string(),
  alt: z.string().max(200).default(""),
});

export const ImageCellSchema = z.object({
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("keep") }),
    z.object({ kind: z.literal("set"), imageId: z.string().min(1) }),
    z.object({ kind: z.literal("clear") }),
  ]),
  in: z.object({
    effect: z.enum(["none", "fade", "slide-left", "slide-right", "zoom-in"]),
    seconds: Seconds.default(1),
    delay: Delay,
  }),
  out: z.object({
    effect: z.enum(["none", "fade", "fade-black", "fade-white", "melt", "signal-glitch"]),
    seconds: Seconds.default(1),
    strength: Percentage.optional(),
    density: Percentage.optional(),
  }),
  during: z
    .enum(["none", "slow-zoom", "pan-left", "pan-right", "shake", "unblur", "signal-glitch"])
    .default("none"),
  endAt: ClipEnd,
  motionSeconds: Seconds.optional(),
  signal: SignalSettingsSchema.optional(),
  filter: z.enum(["none", "dark", "grayscale", "sepia", "cold", "warm"]).default("none"),
});

export const SoundCellSchema = z.object({
  action: z.enum(["none", "music", "stop-music", "effect"]),
  trackId: z.string().optional(),
  volume: z.number().min(0).max(1).default(0.8),
  fadeSeconds: Seconds.default(0),
  delay: Delay,
  endAt: ClipEnd,
  caption: z.string().max(120).default(""),
});

export const TextCellSchema = z.object({
  text: z.string().trim().min(1).max(1200),
  style: z.enum(["narrator", "title", "whisper", "shout", "letter"]).default("narrator"),
  size: z.enum(["small", "normal", "large"]).default("normal"),
  position: z.enum(["top", "middle", "bottom"]).default("bottom"),
  align: z.enum(["left", "center", "right"]).default("left"),
  font: z.enum(["reading", "heading"]).default("reading"),
  in: z.object({
    effect: z.enum(["none", "fade", "typewriter", "word-reveal", "zoom-in", "slide-up"]),
    seconds: Seconds.default(1),
    delay: Delay,
    pauseBefore: z.number().int().min(1).max(1200).optional(),
    pauseSeconds: Seconds.optional(),
  }),
  out: z.object({
    effect: z.enum(["stay", "fade", "zoom-out"]),
    seconds: Seconds.default(0.5),
  }),
  endAt: ClipEnd,
  during: z.enum(["none", "signal-glitch"]).optional(),
  signal: SignalSettingsSchema.optional(),
});

const TextClipSchema = TextCellSchema.extend({
  id: z.string().min(1),
  in: TextCellSchema.shape.in.extend({
    delay: z.number().min(0).max(MAX_TEXT_CLIP_START_SECONDS).default(0),
  }),
  endAt: ClipEnd.unwrap(),
});

const TextTrackSchema = z
  .array(TextClipSchema)
  .min(1)
  .transform((clips) => clips.sort((a, b) => a.in.delay - b.in.delay))
  .refine((clips) => new Set(clips.map(({ id }) => id)).size === clips.length, {
    message: "Text clips must have unique IDs within a step",
  })
  .refine(
    (clips) =>
      clips.every(
        (clip, index) =>
          (clip.endAt - clip.in.delay) * 1000 >= MIN_CLIP_MS - 1e-6 &&
          (index === 0 || (clips[index - 1]!.endAt - clip.in.delay) * 1000 <= 1e-6),
      ),
    { message: "Text clips need a duration of at least 0.1 seconds and cannot overlap" },
  );

export const BeatSchema = z.object({
  id: z.string().min(1),
  image: ImageCellSchema.default({
    source: { kind: "keep" },
    in: { effect: "none" },
    out: { effect: "none" },
  }),
  sound: SoundCellSchema.default({ action: "none" }),
  text: TextCellSchema.optional(),
  textClips: TextTrackSchema.optional(),
  transition: z
    .object({
      effect: z.enum(["cut", "crossfade", "through-black"]),
      seconds: Seconds.default(1),
    })
    .default({ effect: "cut" }),
  advance: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("click") }),
      z.object({ kind: z.literal("after"), seconds: z.number().min(1).max(30) }),
    ])
    .default({ kind: "click" }),
});

export const CutsceneFilmSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  display: z.enum(["column", "fullscreen"]).default("column"),
  skippable: z.boolean().default(true),
  images: z.array(CutsceneImageSchema).max(30).default([]),
  beats: z.array(BeatSchema).min(1).max(60),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CutsceneTriggerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("link"), linkId: z.string().min(1) }),
  z.object({
    kind: z.literal("scene"),
    sceneId: z.string().min(1),
    every: z.boolean().default(false),
  }),
  z.object({ kind: z.literal("facts"), flags: z.array(z.string().min(1)).min(1) }),
]);

const placementFields = {
  id: z.string().min(1),
  trigger: CutsceneTriggerSchema,
  setsFlags: z.array(z.string().min(1)).default([]),
  minutes: z.number().int().nonnegative().optional(),
  position: StoryboardPositionSchema.optional(),
  storyboardSectionId: z.string().min(1).optional(),
};

export const LegacyCutsceneSchema = z.object({
  ...placementFields,
  title: z.string().trim().min(1).max(120),
  paragraphs: z.array(z.string().trim().min(1).max(1200)).min(1).max(20),
  imageDataUrl: z.string().optional(),
});

const placement = z.object({
  ...placementFields,
  filmId: z.string().min(1),
  showInStory: z.boolean().default(true),
});

export const CutscenePlacementSchema = z.preprocess(
  (value) => fromVersion1(value)?.placement ?? value,
  placement,
);

export type CutsceneFilm = z.infer<typeof CutsceneFilmSchema>;
export type CutscenePlacement = z.infer<typeof placement>;
export type CutsceneBeat = z.infer<typeof BeatSchema>;
export type ImageCell = z.infer<typeof ImageCellSchema>;
export type SoundCell = z.infer<typeof SoundCellSchema>;
export type TextCell = z.infer<typeof TextCellSchema>;
export type TextClip = z.infer<typeof TextClipSchema>;

const unknownDate = "1970-01-01T00:00:00.000Z";

/** Migrate both pieces together before a parent schema discards the old embedded text. */
export function fromVersion1(
  value: unknown,
  dates = { createdAt: unknownDate, updatedAt: unknownDate },
): { film: CutsceneFilm; placement: CutscenePlacement } | undefined {
  if (typeof value !== "object" || value === null || "filmId" in value) return undefined;
  const legacy = LegacyCutsceneSchema.safeParse(value);
  if (!legacy.success) return undefined;

  const { title, paragraphs, imageDataUrl, ...fields } = legacy.data;
  const filmId = `cutscene-v1:${fields.id}`;
  const imageId = `${filmId}:image`;
  return {
    placement: placement.parse({ ...fields, filmId }),
    film: CutsceneFilmSchema.parse({
      id: filmId,
      title,
      images: imageDataUrl
        ? [{ id: imageId, dataUrl: imageDataUrl, thumbDataUrl: imageDataUrl }]
        : [],
      beats: paragraphs.map((text, index) => ({
        id: `${filmId}:step:${index + 1}`,
        ...(index === 0 && imageDataUrl
          ? {
              image: {
                source: { kind: "set", imageId },
                in: { effect: "none" },
                out: { effect: "none" },
              },
            }
          : {}),
        text: { text, in: { effect: "none" }, out: { effect: "stay" } },
      })),
      ...dates,
    }),
  };
}

/** Read old campaigns and saves before parsing their film references. */
export function migrateCutsceneDocument(value: unknown): unknown {
  if (
    !value ||
    typeof value !== "object" ||
    !("cutscenes" in value) ||
    !Array.isArray(value.cutscenes)
  )
    return value;
  const dates = {
    createdAt:
      "createdAt" in value && typeof value.createdAt === "string" ? value.createdAt : unknownDate,
    updatedAt:
      "updatedAt" in value && typeof value.updatedAt === "string" ? value.updatedAt : unknownDate,
  };
  const films =
    "cutsceneFilms" in value && Array.isArray(value.cutsceneFilms) ? [...value.cutsceneFilms] : [];
  const filmIds = new Set(films.map((film: CutsceneFilm) => film?.id));
  let changed = false;
  const cutscenes = value.cutscenes.map((item: unknown) => {
    const migrated = fromVersion1(item, dates);
    if (!migrated) return item;
    changed = true;
    if (!filmIds.has(migrated.film.id)) {
      films.push(migrated.film);
      filmIds.add(migrated.film.id);
    }
    return migrated.placement;
  });
  return changed ? { ...value, cutscenes, cutsceneFilms: films } : value;
}

/** Only the films referenced by the placements form a running game's snapshot. */
export function referencedFilms(placements: CutscenePlacement[], films: readonly CutsceneFilm[]) {
  const ids = new Set(placements.map((entry) => entry.filmId));
  return films.filter(({ id }) => ids.has(id));
}
