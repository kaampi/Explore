import type { ReactNode } from "react";
import {
  BeatSchema,
  DEFAULT_TEXT_OUTLINE,
  DEFAULT_TEXT_STRIP,
  IMAGE_MOTION_SECONDS,
  MAX_CLIP_START_SECONDS,
  REVEAL_PAUSE_SECONDS,
  SIGNAL_DEFAULTS,
  TEXT_OUTLINE_MAX,
  TEXT_STRIP_PADDING_MAX,
  TEXT_STRIP_STYLES,
  type SignalSettings,
  TextCellSchema,
  type CutsceneBeat,
  type CutsceneFilm,
  type TextCell,
} from "../../cutscenes/schema";
import { revealWords } from "../../cutscenes/textReveal";
import type { AudioTrack } from "../audio/audioStorage";
import { AUDIO_ACCEPT } from "../audio/audioStorage";
import { Button } from "../components/Button";
import { useTranslate, type TranslationKey } from "../i18n/LanguageProvider";

export const channels = ["image", "sound", "text", "advance"] as const;
export type Channel = (typeof channels)[number];
export type MediaChannel = Exclude<Channel, "advance">;
export type ChannelDialog = "content" | "effects" | "timing";
export const channelLabels = {
  image: "csBackground",
  sound: "csSound",
  text: "csText",
  advance: "csAdvance",
} as const;
export const labelFor = (value: string) =>
  `csValue_${value.replaceAll("-", "_")}` as TranslationKey;

const textEntranceHints = {
  none: "csTextAppearHint",
  fade: "csTextFadeInHint",
  typewriter: "csTextTypewriterHint",
  "word-reveal": "csTextWordRevealHint",
  "zoom-in": "csTextZoomInHint",
  "slide-up": "csTextSlideUpHint",
} as const;

const textExitHints = {
  stay: "csTextStayHint",
  fade: "csTextFadeOutHint",
  "zoom-out": "csTextZoomOutHint",
} as const;

export function Pick<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  const t = useTranslate();
  return (
    <label className="cutscene-field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => {
          const choice = options.find((option) => option === event.target.value);
          if (choice !== undefined) onChange(choice);
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {t(labelFor(option))}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Num({
  label,
  value,
  min = 0,
  max,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="cutscene-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          if (Number.isFinite(event.target.valueAsNumber))
            onChange(Math.min(max, Math.max(min, event.target.valueAsNumber)));
        }}
      />
    </label>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="cutscene-field-group">
      <legend>{label}</legend>
      {children}
    </fieldset>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <label className="cutscene-field cutscene-field--color">
      <span>{label}</span>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextAppearanceFields({
  text,
  themeColor,
  overImage,
  update,
}: {
  text: TextCell;
  themeColor: string;
  overImage: boolean;
  update: (patch: Partial<TextCell>) => void;
}) {
  const t = useTranslate();
  const outline = text.outline ?? DEFAULT_TEXT_OUTLINE;
  const strip = text.strip ?? { ...DEFAULT_TEXT_STRIP, enabled: overImage };
  return (
    <>
      <Group label={t("csTextAppearance")}>
        <ColorField
          label={t("csTextColor")}
          value={text.color ?? themeColor}
          onChange={(color) => update({ color })}
        />
        {text.color && (
          <Button variant="quiet" size="compact" onClick={() => update({ color: undefined })}>
            {t("csTextThemeColor")}
          </Button>
        )}
        <label className="cutscene-field cutscene-field--check">
          <input
            type="checkbox"
            checked={outline.enabled}
            onChange={(event) => update({ outline: { ...outline, enabled: event.target.checked } })}
          />
          <span>{t("csTextOutline")}</span>
        </label>
        {outline.enabled && (
          <>
            <ColorField
              label={t("csTextOutlineColor")}
              value={outline.color}
              onChange={(color) => update({ outline: { ...outline, color } })}
            />
            <Num
              label={t("csTextOutlineWidth")}
              value={outline.width}
              min={0.5}
              max={TEXT_OUTLINE_MAX}
              step={0.5}
              onChange={(width) => update({ outline: { ...outline, width } })}
            />
          </>
        )}
      </Group>
      <Group label={t("csTextStrip")}>
        <label className="cutscene-field cutscene-field--check">
          <input
            type="checkbox"
            checked={strip.enabled}
            onChange={(event) => update({ strip: { ...strip, enabled: event.target.checked } })}
          />
          <span>{t("csTextStripShow")}</span>
        </label>
        {strip.enabled && (
          <>
            <ColorField
              label={t("csTextStripColor")}
              value={strip.color}
              onChange={(color) => update({ strip: { ...strip, color } })}
            />
            <Num
              label={t("csTextStripPadding")}
              value={strip.padding}
              max={TEXT_STRIP_PADDING_MAX}
              step={1}
              onChange={(padding) => update({ strip: { ...strip, padding } })}
            />
            <Pick
              label={t("csTextStripStyle")}
              value={strip.style}
              options={TEXT_STRIP_STYLES}
              onChange={(style) => update({ strip: { ...strip, style } })}
            />
          </>
        )}
      </Group>
    </>
  );
}

function SignalFields({
  signal,
  section,
  onChange,
}: {
  section: Exclude<ChannelDialog, "content">;
  signal: SignalSettings;
  onChange: (value: SignalSettings) => void;
}) {
  const t = useTranslate();
  return (
    <>
      <Num
        label={t("csLength")}
        value={signal.seconds}
        max={30}
        onChange={(seconds) => onChange({ ...signal, seconds })}
      />
      {section === "effects" && (
        <>
          <Num
            label={t("csEffectStrength")}
            value={signal.strength}
            max={100}
            step={1}
            onChange={(strength) => onChange({ ...signal, strength })}
          />
          <Num
            label={t("csSignalDensity")}
            value={signal.density}
            max={100}
            step={1}
            onChange={(density) => onChange({ ...signal, density })}
          />
        </>
      )}
    </>
  );
}

export function CutsceneFields({
  film,
  beat,
  channel,
  section = "content",
  tracks,
  onChange,
  onImage,
  onAlt,
  onTrack,
  text,
  textStart,
  textThemeColor,
  overImage,
  backgroundColor,
  onTextChange,
}: {
  film: CutsceneFilm;
  beat: CutsceneBeat;
  channel: Channel;
  section?: ChannelDialog;
  tracks: AudioTrack[];
  onChange: (update: (step: CutsceneBeat) => CutsceneBeat) => void;
  onImage: (file: File) => void;
  onAlt: (id: string, alt: string) => void;
  onTrack: (file: File) => void;
  text?: TextCell | undefined;
  textStart?: { min: number; max: number } | undefined;
  textThemeColor: string;
  overImage: boolean;
  backgroundColor: string;
  onTextChange: (update: (cell: TextCell | undefined) => TextCell | undefined) => void;
}) {
  const t = useTranslate();
  const field = <K extends Channel>(key: K, patch: Partial<CutsceneBeat[K]>) =>
    onChange((step) => ({ ...step, [key]: { ...step[key], ...patch } }));

  if (channel === "image") {
    const { image } = beat;
    const color = image.source.kind === "color" ? image.source.color : undefined;
    const signal = image.signal ?? SIGNAL_DEFAULTS;
    function updateEntrance(patch: Partial<typeof image.in>) {
      onChange((step) => ({
        ...step,
        image: { ...step.image, in: { ...step.image.in, ...patch } },
      }));
    }
    function updateExit(patch: Partial<typeof image.out>) {
      onChange((step) => ({
        ...step,
        image: { ...step.image, out: { ...step.image.out, ...patch } },
      }));
    }
    const active = image.source.kind === "set" ? image.source.imageId : undefined;
    const picture = film.images.find(({ id }) => id === active);
    if (section === "content")
      return (
        <>
          <label className="cutscene-field">
            <span>{t("csBackground")}</span>
            <select
              value={active ? `asset:${active}` : image.source.kind}
              onChange={(event) => {
                const source = event.target.value;
                if (source === "color") {
                  field("image", {
                    source: { kind: "color", color: backgroundColor },
                    ...(image.out.effect === "melt" || image.out.effect === "signal-glitch"
                      ? { out: { ...image.out, effect: "fade" } }
                      : {}),
                  });
                  return;
                }
                field("image", {
                  source:
                    source === "keep" || source === "clear"
                      ? { kind: source }
                      : { kind: "set", imageId: source.slice("asset:".length) },
                });
              }}
            >
              <option value="keep">{t("csBackgroundKeep")}</option>
              <option value="clear">{t("csBackgroundTheme")}</option>
              <option value="color">{t("csBackgroundSolid")}</option>
              {active && !picture && (
                <option value={`asset:${active}`}>{t("csMissingImage")}</option>
              )}
              {film.images.map((item, index) => (
                <option key={item.id} value={`asset:${item.id}`}>
                  {item.alt || `${t("csImage")} ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
          {color && (
            <ColorField
              label={t("csBackgroundColor")}
              value={color}
              onChange={(color) => field("image", { source: { kind: "color", color } })}
            />
          )}
          <label className="cutscene-field">
            <span>{t("csImageUpload")}</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onImage(file);
              }}
            />
          </label>
          {picture && (
            <>
              <img className="cutscene-studio__thumb" src={picture.thumbDataUrl} alt="" />
              <label className="cutscene-field">
                <span>{t("csImageAlt")}</span>
                <input
                  value={picture.alt}
                  maxLength={200}
                  onChange={(event) => onAlt(picture.id, event.target.value)}
                />
              </label>
            </>
          )}
        </>
      );
    return (
      <>
        {section === "effects" && !color && (
          <>
            <Pick
              label={t("csDuring")}
              value={image.during}
              options={[
                "none",
                "slow-zoom",
                "pan-left",
                "pan-right",
                "shake",
                "unblur",
                "signal-glitch",
              ]}
              onChange={(during) => field("image", { during })}
            />
            {image.during !== "none" && image.during !== "signal-glitch" && (
              <Num
                label={t("csLength")}
                value={image.motionSeconds ?? IMAGE_MOTION_SECONDS[image.during]}
                max={30}
                step={0.05}
                onChange={(motionSeconds) => field("image", { motionSeconds })}
              />
            )}
            <Pick
              label={t("csFilter")}
              value={image.filter}
              options={["none", "dark", "grayscale", "sepia", "cold", "warm"]}
              onChange={(filter) => field("image", { filter })}
            />
          </>
        )}
        {!color && image.during === "signal-glitch" && (
          <Group label={t("csValue_signal_glitch")}>
            <SignalFields
              section={section}
              signal={signal}
              onChange={(signal) => field("image", { signal })}
            />
          </Group>
        )}
        <Group label={t("csEnter")}>
          {section === "effects" ? (
            <Pick
              label={t("csTextEffect")}
              value={image.in.effect}
              options={["none", "fade", "slide-left", "slide-right", "zoom-in"]}
              onChange={(effect) => updateEntrance({ effect })}
            />
          ) : (
            <Num
              label={t("csDelay")}
              value={image.in.delay}
              max={MAX_CLIP_START_SECONDS}
              onChange={(delay) => updateEntrance({ delay })}
            />
          )}
          {image.in.effect !== "none" && (
            <Num
              label={t("csLength")}
              value={image.in.seconds}
              max={30}
              onChange={(seconds) => updateEntrance({ seconds })}
            />
          )}
        </Group>
        {(section === "effects" || image.out.effect !== "none") && (
          <Group label={t("csExit")}>
            {section === "effects" && (
              <>
                <Pick
                  label={t("csTextEffect")}
                  value={image.out.effect}
                  options={
                    color
                      ? ["none", "fade", "fade-black", "fade-white"]
                      : ["none", "fade", "fade-black", "fade-white", "melt", "signal-glitch"]
                  }
                  onChange={(effect) => updateExit({ effect })}
                />
                {image.out.effect === "melt" && (
                  <small className="cutscene-field__hint">{t("csImageMeltHint")}</small>
                )}
                {image.out.effect === "fade" && (
                  <small className="cutscene-field__hint">{t("csBackgroundFadeHint")}</small>
                )}
                {(image.out.effect === "melt" || image.out.effect === "signal-glitch") && (
                  <Num
                    label={t("csEffectStrength")}
                    value={image.out.strength ?? SIGNAL_DEFAULTS.strength}
                    max={100}
                    step={1}
                    onChange={(strength) => updateExit({ strength })}
                  />
                )}
                {image.out.effect === "signal-glitch" && (
                  <Num
                    label={t("csSignalDensity")}
                    value={image.out.density ?? SIGNAL_DEFAULTS.density}
                    max={100}
                    step={1}
                    onChange={(density) => updateExit({ density })}
                  />
                )}
              </>
            )}
            {image.out.effect !== "none" && (
              <Num
                label={t("csLength")}
                value={image.out.seconds}
                max={30}
                onChange={(seconds) => updateExit({ seconds })}
              />
            )}
          </Group>
        )}
      </>
    );
  }

  if (channel === "sound") {
    const { sound } = beat;
    if (section !== "content") {
      return (
        <>
          {section === "timing" && (
            <Num
              label={t("csDelay")}
              value={sound.delay}
              max={MAX_CLIP_START_SECONDS}
              onChange={(delay) => field("sound", { delay })}
            />
          )}
          <Num
            label={t("csFade")}
            value={sound.fadeSeconds}
            max={30}
            onChange={(fadeSeconds) => field("sound", { fadeSeconds })}
          />
          {section === "effects" && sound.action !== "stop-music" && (
            <Num
              label={t("csVolume")}
              value={Math.round(sound.volume * 100)}
              max={100}
              step={1}
              onChange={(volume) => field("sound", { volume: volume / 100 })}
            />
          )}
        </>
      );
    }
    return (
      <>
        <Pick
          label={t("csSoundAction")}
          value={sound.action}
          options={["none", "music", "stop-music", "effect"]}
          onChange={(action) => field("sound", { action })}
        />
        <label className="cutscene-field">
          <span>{t("csTrack")}</span>
          <select
            value={sound.trackId ?? ""}
            onChange={(event) => {
              const trackId = event.target.value;
              onChange((step) => {
                const updated = { ...step.sound };
                if (trackId) {
                  updated.trackId = trackId;
                  if (updated.action === "none") updated.action = "effect";
                } else delete updated.trackId;
                return { ...step, sound: updated };
              });
            }}
          >
            <option value="">{t("csNoTrack")}</option>
            {sound.trackId && !tracks.some(({ id }) => id === sound.trackId) && (
              <option value={sound.trackId}>{t("csNoTrack")}</option>
            )}
            {tracks.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="cutscene-field">
          <span>{t("csSoundUpload")}</span>
          <input
            type="file"
            accept={AUDIO_ACCEPT}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onTrack(file);
            }}
          />
        </label>
        <label className="cutscene-field">
          <span>{t("csCaption")}</span>
          <input
            value={sound.caption}
            maxLength={120}
            onChange={(event) => field("sound", { caption: event.target.value })}
          />
        </label>
      </>
    );
  }

  if (channel === "advance") {
    const { advance } = beat;
    return (
      <>
        <Pick
          label={t("csAdvance")}
          value={advance.kind}
          options={["click", "after"]}
          onChange={(kind) =>
            onChange((step) => ({
              ...step,
              advance: kind === "click" ? { kind } : { kind, seconds: 3 },
            }))
          }
        />
        {advance.kind === "after" && (
          <Num
            label={t("csLength")}
            value={advance.seconds}
            min={1}
            max={30}
            onChange={(seconds) =>
              onChange((step) => ({ ...step, advance: { kind: "after", seconds } }))
            }
          />
        )}
      </>
    );
  }

  const updateText = (patch: Partial<TextCell>) =>
    onTextChange((cell) => cell && { ...cell, ...patch });
  const words = text?.in.effect === "word-reveal" ? revealWords(text.text) : [];
  const pauseBefore = text?.in.pauseBefore ?? 0;
  if (section === "content")
    return (
      <>
        <label className="cutscene-field">
          <span>{t("csText")}</span>
          <textarea
            rows={4}
            value={text?.text ?? ""}
            placeholder={t("csReadingText")}
            maxLength={1200}
            onChange={(event) => {
              const value = event.target.value;
              onTextChange((cell) => {
                if (cell) return { ...cell, text: value };
                if (!value.trim()) return undefined;
                return {
                  ...TextCellSchema.parse({
                    text: "x",
                    in: { effect: "none" },
                    out: { effect: "stay" },
                  }),
                  text: value,
                };
              });
            }}
          />
        </label>
        {text && (
          <>
            <Pick
              label={t("csTextStyle")}
              value={text.style}
              options={["narrator", "title", "whisper", "shout", "letter"]}
              onChange={(style) => updateText({ style })}
            />
            <Pick
              label={t("csSize")}
              value={text.size}
              options={["small", "normal", "large"]}
              onChange={(size) => updateText({ size })}
            />
            <Pick
              label={t("csPosition")}
              value={text.position}
              options={["top", "middle", "bottom"]}
              onChange={(position) => updateText({ position })}
            />
            <Pick
              label={t("csTextHorizontalPosition")}
              value={text.horizontal ?? "center"}
              options={["left", "center", "right"]}
              onChange={(horizontal) => updateText({ horizontal })}
            />
            <Pick
              label={t("csAlignment")}
              value={text.align}
              options={["left", "center", "right"]}
              onChange={(align) => updateText({ align })}
            />
            <Pick
              label={t("csFont")}
              value={text.font}
              options={["reading", "heading"]}
              onChange={(font) => updateText({ font })}
            />
            <TextAppearanceFields
              text={text}
              themeColor={textThemeColor}
              overImage={overImage}
              update={updateText}
            />
          </>
        )}
      </>
    );
  if (!text) return null;
  return (
    <>
      <Group label={t("csTextEntrance")}>
        {section === "effects" ? (
          <>
            <Pick
              label={t("csTextEffect")}
              value={text.in.effect}
              options={["none", "fade", "typewriter", "word-reveal", "zoom-in", "slide-up"]}
              onChange={(effect) => updateText({ in: { ...text.in, effect } })}
            />
            <small className="cutscene-field__hint">{t(textEntranceHints[text.in.effect])}</small>
            {words.length > 0 && (
              <label className="cutscene-field">
                <span>{t("csPauseBeforeWord")}</span>
                <select
                  value={pauseBefore <= words.length ? pauseBefore : 0}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    const entrance = { ...text.in };
                    if (value) entrance.pauseBefore = value;
                    else delete entrance.pauseBefore;
                    updateText({ in: entrance });
                  }}
                >
                  <option value={0}>{t("csValue_none")}</option>
                  {words.map(({ label }, index) => (
                    <option key={index} value={index + 1}>
                      {index + 1}. {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        ) : (
          <Num
            label={t("csTextStartDelay")}
            value={text.in.delay}
            min={textStart?.min ?? 0}
            max={textStart?.max ?? MAX_CLIP_START_SECONDS}
            onChange={(delay) => updateText({ in: { ...text.in, delay } })}
          />
        )}
        {text.in.effect !== "none" && (
          <Num
            label={t("csLength")}
            value={text.in.seconds}
            max={30}
            onChange={(seconds) => updateText({ in: { ...text.in, seconds } })}
          />
        )}
        {pauseBefore > 0 && pauseBefore <= words.length && (
          <Num
            label={t("csRevealPauseLength")}
            value={text.in.pauseSeconds ?? REVEAL_PAUSE_SECONDS}
            max={30}
            onChange={(pauseSeconds) => updateText({ in: { ...text.in, pauseSeconds } })}
          />
        )}
      </Group>
      {(section === "effects" || text.during === "signal-glitch") && (
        <Group label={t("csTextDuring")}>
          {section === "effects" && (
            <Pick
              label={t("csTextEffect")}
              value={text.during ?? "none"}
              options={["none", "signal-glitch"]}
              onChange={(during) => updateText({ during })}
            />
          )}
          {text.during === "signal-glitch" && (
            <>
              {section === "effects" && (
                <small className="cutscene-field__hint">{t("csTextSignalHint")}</small>
              )}
              <SignalFields
                section={section}
                signal={text.signal ?? SIGNAL_DEFAULTS}
                onChange={(signal) => updateText({ signal })}
              />
            </>
          )}
        </Group>
      )}
      {(section === "effects" || text.out.effect !== "stay") && (
        <Group label={t("csTextExit")}>
          {section === "effects" && (
            <>
              <Pick
                label={t("csTextEffect")}
                value={text.out.effect}
                options={["stay", "fade", "zoom-out"]}
                onChange={(effect) => updateText({ out: { ...text.out, effect } })}
              />
              <small className="cutscene-field__hint">{t(textExitHints[text.out.effect])}</small>
            </>
          )}
          {text.out.effect !== "stay" && (
            <Num
              label={t("csLength")}
              value={text.out.seconds}
              max={30}
              onChange={(seconds) => updateText({ out: { ...text.out, seconds } })}
            />
          )}
        </Group>
      )}
    </>
  );
}

export function newBeat() {
  return BeatSchema.parse({ id: crypto.randomUUID() });
}
