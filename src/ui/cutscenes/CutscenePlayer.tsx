import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  advancePlayback,
  planPlayback,
  playbackFrame,
  startPlayback,
  type PlaybackState,
} from "../../cutscenes/playback";
import {
  IMAGE_MOTION_SECONDS,
  SIGNAL_DEFAULTS,
  type CutsceneFilm,
  type ImageCell,
  type TextCell,
} from "../../cutscenes/schema";
import { Button } from "../components/Button";
import { useTranslate } from "../i18n/LanguageProvider";
import {
  Frame,
  NamePlate,
  OrnamentProvider,
  ornamentVars,
  useSimpleFrames,
} from "../play/ornament";
import { playThemeStyle } from "../themes/ThemeProvider";
import type { PlayTheme } from "../themes/theme";
import { MeltImage, SignalInterference } from "./ImageEffects";
import { CutsceneTextContent, CutsceneTextLayout } from "./TextEffects";
import { useCutsceneSound, type CutsceneSound } from "./useCutsceneSound";
import "./cutscenes.css";

export type CutscenePlayerProps = {
  film: CutsceneFilm;
  theme: PlayTheme;
  simple: boolean;
  sound: CutsceneSound;
  onEnd: (how: "finished" | "skipped") => void;
};

function enterImage(effect: ImageCell["in"]["effect"], progress: number): CSSProperties {
  const left = 1 - progress;
  switch (effect) {
    case "fade":
      return { opacity: progress };
    case "slide-left":
      return { transform: `translateX(${left * 100}%)` };
    case "slide-right":
      return { transform: `translateX(${-left * 100}%)` };
    case "zoom-in":
      return { opacity: progress, transform: `scale(${1 + left * 0.12})` };
    case "none":
      return {};
  }
}

function enterText(effect: TextCell["in"]["effect"], progress: number): CSSProperties {
  switch (effect) {
    case "fade":
      return { opacity: progress };
    case "zoom-in":
      return { opacity: progress, transform: `scale(${0.85 + progress * 0.15})` };
    case "slide-up":
      return { opacity: progress, transform: `translateY(${(1 - progress) * 1.5}rem)` };
    default:
      return {};
  }
}

function exitText(effect: TextCell["out"]["effect"], progress: number): CSSProperties {
  if (!progress) return {};
  return {
    opacity: 1 - progress,
    ...(effect === "zoom-out" ? { transform: `scale(${1 - progress * 0.15})` } : {}),
  };
}

function SceneVisual({
  images,
  frame,
  reduced,
  paused,
  silent = false,
}: {
  images: CutsceneFilm["images"];
  frame: ReturnType<typeof playbackFrame> | undefined;
  reduced: boolean;
  paused: boolean;
  silent?: boolean;
}) {
  const picture = images.find(({ id }) => id === frame?.image?.imageId);
  const previousImage = frame?.previousImage;
  const currentImage = frame?.image;
  const progress = frame?.imageOut ?? 0;
  const out = previousImage?.cell.out.effect;
  const wash = out === "fade-black" || out === "fade-white";
  const hasBackdrop = Boolean(picture || currentImage?.color);
  const leavingOpacity = 1 - Math.min(1, wash && hasBackdrop ? progress * 2 : progress);
  const text = frame?.text?.cell;
  const textProgress = frame?.textIn ?? 1;
  const words = text && (
    <CutsceneTextContent
      key={frame?.text?.clipId ?? frame?.text?.step}
      text={text}
      progress={textProgress}
      paused={paused}
      reduced={reduced}
    />
  );
  const textStyle = {
    ...(text ? enterText(text.in.effect, textProgress) : {}),
    ...(text ? exitText(text.out.effect, frame?.textOut ?? 0) : {}),
  };
  return (
    <>
      {wash && (
        <div
          className={`cutscene-reel__exit-color cutscene-reel__exit--${out}`}
          style={{ opacity: hasBackdrop ? Math.min(1, (1 - progress) * 2) : 1 }}
          aria-hidden="true"
        />
      )}
      {[
        ...(previousImage ? [{ layer: previousImage, outgoing: true }] : []),
        ...(currentImage ? [{ layer: currentImage, outgoing: false }] : []),
      ].map(({ layer, outgoing }) => {
        const { cell } = layer;
        const asset = outgoing ? images.find(({ id }) => id === layer.imageId) : picture;
        const style = outgoing
          ? { opacity: leavingOpacity, zIndex: 2 }
          : enterImage(cell.in.effect, frame?.imageIn ?? 1);
        if (layer.color) {
          return (
            <div
              key={layer.step}
              className="cutscene-reel__image"
              data-background="color"
              style={{ ...style, backgroundColor: layer.color }}
              aria-hidden="true"
            />
          );
        }
        if (!asset) return null;
        const strength = (cell.out.strength ?? SIGNAL_DEFAULTS.strength) / 100;
        const canMelt = !reduced && cell.out.effect === "melt" && strength > 0;
        const melt = outgoing && canMelt;
        const motion = cell.during;
        const motionSeconds =
          motion === "none" || motion === "signal-glitch"
            ? undefined
            : (cell.motionSeconds ?? IMAGE_MOTION_SECONDS[motion]);
        const imageProps = {
          alt: outgoing || silent ? "" : asset.alt,
          src: asset.dataUrl,
          className: `cutscene-reel__picture cutscene-reel__filter--${cell.filter}`,
          "data-motion": reduced ? "none" : cell.during,
          "data-paused": paused,
          style:
            motionSeconds === undefined ? undefined : { animationDuration: `${motionSeconds}s` },
        };
        const signalExit = outgoing && !reduced && cell.out.effect === "signal-glitch";
        const signalDuring = !outgoing && !reduced && cell.during === "signal-glitch";
        const signal = cell.signal ?? SIGNAL_DEFAULTS;
        return (
          <div
            key={layer.step}
            className="cutscene-reel__image"
            data-background="image"
            aria-hidden={outgoing || silent || undefined}
            style={melt ? { ...style, opacity: 1 } : style}
          >
            {canMelt ? (
              <MeltImage
                {...imageProps}
                progress={melt ? progress : undefined}
                strength={strength}
              />
            ) : (
              <img {...imageProps} />
            )}
            {signalDuring && (
              <SignalInterference
                picture={asset}
                filter={cell.filter}
                seconds={signal.seconds}
                strength={signal.strength / 100}
                density={signal.density / 100}
                paused={paused}
              />
            )}
            {signalExit && (
              <SignalInterference
                picture={asset}
                filter={cell.filter}
                seconds={cell.out.seconds}
                strength={strength}
                density={(cell.out.density ?? SIGNAL_DEFAULTS.density) / 100}
                paused={paused}
                exitProgress={progress}
              />
            )}
          </div>
        );
      })}
      {text && (
        <CutsceneTextLayout
          text={text}
          overImage={hasBackdrop || Boolean(previousImage)}
          style={textStyle}
          hidden
        >
          {words}
        </CutsceneTextLayout>
      )}
    </>
  );
}

function Reel({ film, theme, simple, sound, onEnd }: CutscenePlayerProps) {
  const t = useTranslate();
  const reduced = useSimpleFrames(simple);
  const id = useId();
  const titleId = `${id}-title`;
  const plan = useMemo(() => planPlayback(film, reduced), [film, reduced]);
  const [state, setState] = useState<PlaybackState>(startPlayback);
  const ended = state.phase === "ended";
  const frame = ended ? undefined : playbackFrame(plan, state);
  const paused = !ended && state.paused;
  const timed = !ended && plan.steps[state.step]?.advanceAt !== undefined;
  const textSequencePlaying =
    !ended && state.elapsed < (plan.steps[state.step]?.textClips.at(-1)?.end ?? 0);
  const ticking = !ended && !paused && (state.phase !== "step" || timed || !frame?.ready);
  const caption = useCutsceneSound(sound, frame?.cue, frame?.music, paused, ended);
  const emitted = useRef(false);

  useEffect(() => {
    document.getElementById(id)?.focus();
  }, [id]);
  useEffect(() => {
    if (!ticking) return;
    let previous = performance.now();
    let request = 0;
    function tick(now: number) {
      const elapsed = now - previous;
      previous = now;
      setState((current) => advancePlayback(plan, current, { type: "tick", elapsed }));
      request = requestAnimationFrame(tick);
    }
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [plan, ticking]);
  useEffect(() => {
    if (state.phase !== "ended" || emitted.current) return;
    emitted.current = true;
    onEnd(state.result);
  }, [onEnd, state]);

  const picture = film.images.find(({ id }) => id === frame?.image?.imageId);
  const transition = state.phase === "transition" ? plan.steps[state.step]?.transition : undefined;
  const progress =
    transition?.duration && state.phase === "transition" ? state.elapsed / transition.duration : 0;
  const incoming =
    state.phase === "transition" ? playbackFrame(plan, startPlayback(state.step + 1)) : undefined;
  const continueBeat = () =>
    setState((current) => advancePlayback(plan, current, { type: "continue" }));

  return (
    <OrnamentProvider theme={theme} simple={reduced}>
      <Frame
        as="section"
        id={id}
        className="cutscene-reel"
        data-display={film.display}
        style={{ ...playThemeStyle(theme), ...ornamentVars(theme, { simple: reduced }) }}
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => {
          if (!(event.target instanceof Element) || event.target.closest("button")) return;
          continueBeat();
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          event.preventDefault();
          if (!event.repeat) continueBeat();
        }}
      >
        <div className="cutscene-reel__visual" data-transition={transition?.effect}>
          <div
            className="cutscene-reel__layer"
            style={{
              opacity: transition?.effect === "through-black" ? Math.max(0, 1 - progress * 2) : 1,
            }}
          >
            <SceneVisual images={film.images} frame={frame} reduced={reduced} paused={paused} />
            {caption && (
              <p className="cutscene-reel__caption" role="status">
                {caption}
              </p>
            )}
          </div>
          {incoming && (
            <div
              className="cutscene-reel__layer cutscene-reel__layer--incoming"
              aria-hidden="true"
              style={{
                opacity:
                  transition?.effect === "through-black" ? Math.max(0, progress * 2 - 1) : progress,
              }}
            >
              <SceneVisual images={film.images} frame={incoming} reduced={reduced} paused silent />
            </div>
          )}
          <span className="visually-hidden" aria-live="polite">
            {picture?.alt}
          </span>
          <span className="visually-hidden" aria-live="polite">
            {frame?.text?.cell.text}
          </span>
        </div>
        <header className="cutscene-reel__bar">
          <NamePlate id={titleId}>{film.title}</NamePlate>
          <div className="cutscene-reel__controls">
            {plan.canPause && (
              <Button
                variant="quiet"
                onClick={() =>
                  setState((current) => advancePlayback(plan, current, { type: "pause" }))
                }
              >
                {t(paused ? "cutsceneResume" : "cutscenePause")}
              </Button>
            )}
            {film.skippable && (
              <Button
                variant="quiet"
                onClick={() =>
                  setState((current) => advancePlayback(plan, current, { type: "skip" }))
                }
              >
                {t("pvCutsceneSkip")}
              </Button>
            )}
            <Button
              variant="primary"
              disabled={
                ended ||
                (state.phase === "step" && (textSequencePlaying || (timed && !!frame?.ready)))
              }
              onClick={continueBeat}
            >
              {t(
                !ended && state.step === film.beats.length - 1
                  ? "pvCutsceneContinueGame"
                  : "pvCutsceneContinue",
              )}
            </Button>
          </div>
        </header>
      </Frame>
    </OrnamentProvider>
  );
}

export function CutscenePlayer(props: CutscenePlayerProps) {
  return <Reel key={props.film.id} {...props} />;
}
