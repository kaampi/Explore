import type { ReactNode } from "react";
import {
  BeatSchema,
  REVEAL_PAUSE_SECONDS,
  SIGNAL_DEFAULTS,
  type SignalSettings,
  TextCellSchema,
  type CutsceneBeat,
  type CutsceneFilm,
} from "../../cutscenes/schema";
import { revealWords } from "../../cutscenes/textReveal";
import type { AudioTrack } from "../audio/audioStorage";
import { AUDIO_ACCEPT } from "../audio/audioStorage";
import { useTranslate, type TranslationKey } from "../i18n/LanguageProvider";

export const channels = ["image", "sound", "text", "advance"] as const;
export type Channel = (typeof channels)[number];
export const channelLabels = {
  image: "csImage",
  sound: "csSound",
  text: "csText",
  advance: "csAdvance",
} as const;
export const labelFor = (value: string) =>
  `csValue_${value.replaceAll("-", "_")}` as TranslationKey;

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

function SignalFields({
  signal,
  onChange,
}: {
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
  );
}

export function CutsceneFields({
  film,
  beat,
  channel,
  tracks,
  onChange,
  onImage,
  onAlt,
  onTrack,
}: {
  film: CutsceneFilm;
  beat: CutsceneBeat;
  channel: Channel;
  tracks: AudioTrack[];
  onChange: (update: (step: CutsceneBeat) => CutsceneBeat) => void;
  onImage: (file: File) => void;
  onAlt: (id: string, alt: string) => void;
  onTrack: (file: File) => void;
}) {
  const t = useTranslate();
  const field = <K extends Channel>(key: K, patch: Partial<CutsceneBeat[K]>) =>
    onChange((step) => ({ ...step, [key]: { ...step[key], ...patch } }));

  if (channel === "image") {
    const { image } = beat;
    const signal = image.signal ?? SIGNAL_DEFAULTS;
    function updateExit(patch: Partial<typeof image.out>) {
      onChange((step) => ({
        ...step,
        image: { ...step.image, out: { ...step.image.out, ...patch } },
      }));
    }
    const active = image.source.kind === "set" ? image.source.imageId : undefined;
    const picture = film.images.find(({ id }) => id === active);
    return (
      <>
        <label className="cutscene-field">
          <span>{t("csImage")}</span>
          <select
            value={active ? `asset:${active}` : image.source.kind}
            onChange={(event) => {
              const source = event.target.value;
              field("image", {
                source:
                  source === "keep" || source === "clear"
                    ? { kind: source }
                    : { kind: "set", imageId: source.slice("asset:".length) },
              });
            }}
          >
            <option value="keep">{t("csValue_keep")}</option>
            <option value="clear">{t("csValue_clear")}</option>
            {active && !picture && <option value={`asset:${active}`}>{t("csMissingImage")}</option>}
            {film.images.map((item, index) => (
              <option key={item.id} value={`asset:${item.id}`}>
                {item.alt || `${t("csImage")} ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
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
        {image.during === "signal-glitch" && (
          <Group label={t("csValue_signal_glitch")}>
            <SignalFields signal={signal} onChange={(signal) => field("image", { signal })} />
          </Group>
        )}
        <Pick
          label={t("csFilter")}
          value={image.filter}
          options={["none", "dark", "grayscale", "sepia", "cold", "warm"]}
          onChange={(filter) => field("image", { filter })}
        />
        <Group label={t("csEnter")}>
          <Pick
            label={t("csImage")}
            value={image.in.effect}
            options={["none", "fade", "slide-left", "slide-right", "zoom-in"]}
            onChange={(effect) =>
              onChange((step) => ({
                ...step,
                image: { ...step.image, in: { ...step.image.in, effect } },
              }))
            }
          />
          <Num
            label={t("csLength")}
            value={image.in.seconds}
            max={30}
            onChange={(seconds) =>
              onChange((step) => ({
                ...step,
                image: { ...step.image, in: { ...step.image.in, seconds } },
              }))
            }
          />
          <Num
            label={t("csDelay")}
            value={image.in.delay}
            max={10}
            onChange={(delay) =>
              onChange((step) => ({
                ...step,
                image: { ...step.image, in: { ...step.image.in, delay } },
              }))
            }
          />
        </Group>
        <Group label={t("csExit")}>
          <Pick
            label={t("csImage")}
            value={image.out.effect}
            options={["none", "fade", "fade-black", "fade-white", "melt", "signal-glitch"]}
            onChange={(effect) => updateExit({ effect })}
          />
          <Num
            label={t("csLength")}
            value={image.out.seconds}
            max={30}
            onChange={(seconds) => updateExit({ seconds })}
          />
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
        </Group>
      </>
    );
  }

  if (channel === "sound") {
    const { sound } = beat;
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
                const { trackId: _oldTrack, ...withoutTrack } = step.sound;
                return { ...step, sound: trackId ? { ...withoutTrack, trackId } : withoutTrack };
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
        <Num
          label={t("csVolume")}
          value={Math.round(sound.volume * 100)}
          max={100}
          step={1}
          onChange={(volume) => field("sound", { volume: volume / 100 })}
        />
        <Num
          label={t("csFade")}
          value={sound.fadeSeconds}
          max={30}
          onChange={(fadeSeconds) => field("sound", { fadeSeconds })}
        />
        <Num
          label={t("csDelay")}
          value={sound.delay}
          max={10}
          onChange={(delay) => field("sound", { delay })}
        />
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

  const { text } = beat;
  const words = text?.in.effect === "word-reveal" ? revealWords(text.text) : [];
  const pauseBefore = text?.in.pauseBefore ?? 0;
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
            onChange((step) => {
              if (value)
                return {
                  ...step,
                  text: step.text
                    ? { ...step.text, text: value }
                    : {
                        ...TextCellSchema.parse({
                          text: "x",
                          in: { effect: "none" },
                          out: { effect: "stay" },
                        }),
                        text: value,
                      },
                };
              const { text: _text, ...withoutText } = step;
              return withoutText;
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
            onChange={(style) => field("text", { style })}
          />
          <Pick
            label={t("csSize")}
            value={text.size}
            options={["small", "normal", "large"]}
            onChange={(size) => field("text", { size })}
          />
          <Pick
            label={t("csPosition")}
            value={text.position}
            options={["top", "middle", "bottom"]}
            onChange={(position) => field("text", { position })}
          />
          <Pick
            label={t("csAlignment")}
            value={text.align}
            options={["left", "center", "right"]}
            onChange={(align) => field("text", { align })}
          />
          <Pick
            label={t("csFont")}
            value={text.font}
            options={["reading", "heading"]}
            onChange={(font) => field("text", { font })}
          />
          <Group label={t("csEnter")}>
            <Pick
              label={t("csText")}
              value={text.in.effect}
              options={["none", "fade", "typewriter", "word-reveal", "zoom-in", "slide-up"]}
              onChange={(effect) => field("text", { in: { ...text.in, effect } })}
            />
            <Num
              label={t("csLength")}
              value={text.in.seconds}
              max={30}
              onChange={(seconds) => field("text", { in: { ...text.in, seconds } })}
            />
            <Num
              label={t("csDelay")}
              value={text.in.delay}
              max={10}
              onChange={(delay) => field("text", { in: { ...text.in, delay } })}
            />
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
                    field("text", { in: entrance });
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
            {pauseBefore > 0 && pauseBefore <= words.length && (
              <Num
                label={t("csRevealPauseLength")}
                value={text.in.pauseSeconds ?? REVEAL_PAUSE_SECONDS}
                max={30}
                onChange={(pauseSeconds) => field("text", { in: { ...text.in, pauseSeconds } })}
              />
            )}
          </Group>
          <Group label={t("csTextDuring")}>
            <Pick
              label={t("csText")}
              value={text.during ?? "none"}
              options={["none", "signal-glitch"]}
              onChange={(during) => field("text", { during })}
            />
            {text.during === "signal-glitch" && (
              <SignalFields
                signal={text.signal ?? SIGNAL_DEFAULTS}
                onChange={(signal) => field("text", { signal })}
              />
            )}
          </Group>
          <Group label={t("csExit")}>
            <Pick
              label={t("csText")}
              value={text.out.effect}
              options={["stay", "fade", "zoom-out"]}
              onChange={(effect) => field("text", { out: { ...text.out, effect } })}
            />
            <Num
              label={t("csLength")}
              value={text.out.seconds}
              max={30}
              onChange={(seconds) => field("text", { out: { ...text.out, seconds } })}
            />
          </Group>
        </>
      )}
    </>
  );
}

export function newBeat() {
  return BeatSchema.parse({ id: crypto.randomUUID() });
}
