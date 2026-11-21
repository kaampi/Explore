import type { ReactNode } from "react";
import type { PlaybackStep } from "../../cutscenes/playback";
import { stepTimeline, type TimelineClip, type TimelineLane } from "../../cutscenes/stepTimeline";
import { Button, IconButton } from "../components/Button";
import { MenuButton, useContextMenu, type MenuItem } from "../components/Menu";
import { useTranslate } from "../i18n/LanguageProvider";
import {
  channelLabels,
  type Channel,
  type ChannelDialog,
  type MediaChannel,
} from "./CutsceneFields";
import { useWorkspaceView } from "./useWorkspaceView";

const lanes = ["image", "sound", "text"] as const;
const overviewMs = 20_000;
const timelineMaxZoom = 80;
const clock = (ms: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(ms / 1000);

export function WorkspaceZoom({ workspace }: { workspace: ReturnType<typeof useWorkspaceView> }) {
  const t = useTranslate();
  const zoom = workspace.view.zoom;
  return (
    <div className="cutscene-studio__zoom" role="group" aria-label={t("csWorkspaceZoom")}>
      <IconButton
        size="compact"
        label={t("csZoomOut")}
        icon={<span aria-hidden="true">−</span>}
        disabled={zoom === 1}
        onClick={() => workspace.zoomBy(1 / 1.5)}
      />
      <Button
        size="compact"
        variant="quiet"
        aria-label={t("csZoomReset")}
        title={t("csZoomReset")}
        onClick={workspace.reset}
      >
        {Math.round(zoom * 100)}%
      </Button>
      <IconButton
        size="compact"
        label={t("csZoomIn")}
        icon={<span aria-hidden="true">+</span>}
        disabled={zoom === workspace.maxZoom}
        onClick={() => workspace.zoomBy(1.5)}
      />
    </div>
  );
}

type ClipContent = { label: string; thumb?: string };

export function StepTimeline({
  step,
  number,
  count,
  items,
  transitionControl,
  onStep,
  onAdd,
  selected,
  onSelect,
  contentFor,
  onOpenChannelDialog,
  canEditChannel,
}: {
  step: PlaybackStep;
  number: number;
  count: number;
  items: MenuItem[];
  transitionControl: ReactNode;
  onStep: (number: number) => void;
  onAdd: () => void;
  selected: Channel | undefined;
  onSelect: (channel: Channel, openInspector?: boolean) => void;
  contentFor: (clip: TimelineClip) => ClipContent;
  onOpenChannelDialog: (channel: MediaChannel, dialog: ChannelDialog) => void;
  canEditChannel: (channel: MediaChannel, section: "effects" | "timing") => boolean;
}) {
  const t = useTranslate();
  const workspace = useWorkspaceView(true, timelineMaxZoom);
  const { clips, advance, readyAt, exit, end, transition } = stepTimeline(step);
  const limit = Math.max(overviewMs, readyAt >= end || (advance ?? 0) >= end ? end + 1000 : end);
  const minimumTick = limit / (8 * workspace.view.zoom);
  const tickSpacing =
    [50, 100, 250, 500, 1000, 2000, 5000, 10000].find((interval) => interval >= minimumTick) ??
    20000;
  const ticks = Array.from(
    { length: Math.floor(limit / tickSpacing) + 1 },
    (_, i) => i * tickSpacing,
  );
  const x = (ms: number) => `${(ms / limit) * 100}%`;
  const seconds = (ms: number) => t("csTimelineSeconds", { seconds: clock(ms) });
  const timing =
    advance === undefined
      ? exit > 0
        ? t("csTimelineClickExit", { duration: seconds(exit) })
        : t("csTimelineClick")
      : t("csTimelineAuto", { time: seconds(advance) });
  const stepLabel = t("csStep", { number });
  const title = t("csStepTimeline", { step: stepLabel });
  const stepMenu = useContextMenu(stepLabel, items);
  const tracks: { lane: TimelineLane; clips: TimelineClip[] }[] = lanes.flatMap((lane) => {
    const laneClips = clips.filter((clip) => clip.lane === lane);
    const [previous, next] = laneClips;
    return previous && next && (previous.waits || previous.end > next.start)
      ? laneClips.map((clip) => ({ lane, clips: [clip] }))
      : [{ lane, clips: laneClips }];
  });

  function clipButton(clip: TimelineClip) {
    const content = contentFor(clip);
    const label =
      clip.cue && clip.start === clip.end
        ? t("csTimelineSoundAt", { time: seconds(clip.start) })
        : t("csTimelineSpan", {
            kind: content.label,
            start: seconds(clip.start),
            end: seconds(clip.end),
          });
    const width = clip.end - clip.start;
    return (
      <Button
        key={clip.source}
        size="compact"
        variant="quiet"
        className="cutscene-time__clip"
        aria-label={`${t(channelLabels[clip.lane])} · ${label}`}
        aria-pressed={selected === clip.lane}
        title={`${content.label} · ${label}`}
        data-instant={width === 0}
        style={{ left: x(clip.start), width: width ? x(width) : undefined }}
        aria-haspopup="dialog"
        onClick={() => onOpenChannelDialog(clip.lane, "content")}
      >
        {content.thumb && <img src={content.thumb} alt="" draggable={false} />}
        <span className="cutscene-time__clip-title">{content.label}</span>
        {width > 0 && !!clip.enter && (
          <i
            aria-hidden="true"
            data-shape="in"
            style={{ width: `${(clip.enter / width) * 100}%` }}
          />
        )}
        {width > 0 && !!clip.leave && (
          <i
            aria-hidden="true"
            data-shape="out"
            style={{ width: `${(clip.leave / width) * 100}%` }}
          />
        )}
      </Button>
    );
  }

  return (
    <section className="cutscene-time" aria-label={title}>
      <header className="cutscene-time__header">
        <div className="cutscene-time__navigation" {...stepMenu.bind}>
          <Button
            size="compact"
            variant="quiet"
            aria-label={t("csPreviousStep")}
            disabled={number <= 1}
            onClick={() => onStep(number - 1)}
          >
            <span aria-hidden="true">‹ </span>
            {t("csPreviousStep")}
          </Button>
          <select
            aria-label={t("csJumpStep")}
            value={number}
            onChange={(event) => onStep(Number(event.target.value))}
          >
            {Array.from({ length: count }, (_, index) => (
              <option key={index} value={index + 1}>
                {t("csStep", { number: index + 1 })}
              </option>
            ))}
          </select>
          <Button
            size="compact"
            variant="quiet"
            aria-label={t("csNextStep")}
            disabled={number >= count}
            onClick={() => onStep(number + 1)}
          >
            {t("csNextStep")}
            <span aria-hidden="true"> ›</span>
          </Button>
          <MenuButton label={stepLabel} items={items} size="compact" />
          {stepMenu.menu}
        </div>
        <div className="cutscene-time__tools">
          <IconButton
            label={t("csAddStep")}
            size="compact"
            icon={<span aria-hidden="true">+</span>}
            disabled={count >= 60}
            onClick={onAdd}
          />
          <WorkspaceZoom workspace={workspace} />
        </div>
      </header>
      <div className="cutscene-time__body">
        <div className="cutscene-time__labels">
          {tracks.map(({ lane }, index) => (
            <div className="cutscene-time__label-row" key={`${lane}-${index}`}>
              <Button
                className="cutscene-time__label"
                size="compact"
                variant="quiet"
                aria-pressed={selected === lane}
                aria-label={`${stepLabel}, ${t(channelLabels[lane])}`}
                aria-haspopup="dialog"
                onClick={() => onOpenChannelDialog(lane, "content")}
                onKeyDown={(event) => {
                  const direction =
                    event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
                  const otherStep =
                    event.key === "ArrowLeft"
                      ? number - 1
                      : event.key === "ArrowRight"
                        ? number + 1
                        : 0;
                  if (direction) {
                    event.preventDefault();
                    const next = Math.min(tracks.length - 1, Math.max(0, index + direction));
                    onSelect(tracks[next]!.lane, false);
                    const labels = event.currentTarget
                      .closest(".cutscene-time__labels")
                      ?.querySelectorAll<HTMLButtonElement>(".cutscene-time__label");
                    labels?.[next]?.focus();
                  } else if (otherStep >= 1 && otherStep <= count) {
                    event.preventDefault();
                    onStep(otherStep);
                  }
                }}
              >
                {t(channelLabels[lane])}
              </Button>
              {tracks[index - 1]?.lane !== lane && (
                <>
                  <IconButton
                    size="compact"
                    variant="quiet"
                    label={t("csChannelEffects", { channel: t(channelLabels[lane]) })}
                    aria-haspopup="dialog"
                    disabled={!canEditChannel(lane, "effects")}
                    icon={<span aria-hidden="true">Fx</span>}
                    onClick={() => onOpenChannelDialog(lane, "effects")}
                  />
                  <IconButton
                    size="compact"
                    variant="quiet"
                    label={t("csChannelTiming", { channel: t(channelLabels[lane]) })}
                    aria-haspopup="dialog"
                    disabled={!canEditChannel(lane, "timing")}
                    icon={
                      <svg
                        aria-hidden="true"
                        width="16"
                        height="16"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      >
                        <circle cx="10" cy="10" r="7.25" />
                        <path d="M10 6v4l2.6 1.6" />
                      </svg>
                    }
                    onClick={() => onOpenChannelDialog(lane, "timing")}
                  />
                </>
              )}
            </div>
          ))}
        </div>
        <div
          {...workspace.bind}
          tabIndex={0}
          aria-label={t("csTimelineRuler")}
          className="cutscene-time__viewport"
          data-gesture={workspace.mode}
        >
          <div
            className="cutscene-time__scale"
            style={{
              width: `${workspace.view.zoom * 100}%`,
              left: workspace.view.x,
            }}
          >
            <div className="cutscene-time__ruler" aria-hidden="true">
              {ticks.map((tick) => (
                <span key={tick} style={{ left: x(tick) }}>
                  {seconds(tick)}
                </span>
              ))}
            </div>
            {tracks.map(({ lane, clips: rowClips }, index) => (
              <div
                key={`${lane}-${index}`}
                className="cutscene-time__lane"
                data-lane={lane}
                data-selected={selected === lane}
              >
                {ticks.map((tick) => (
                  <i className="cutscene-time__tick" key={tick} style={{ left: x(tick) }} />
                ))}
                {rowClips.map(clipButton)}
                {rowClips.some((clip) => clip.waits) && (
                  <span
                    className="cutscene-time__open"
                    style={{ left: x(readyAt) }}
                    title={t("csTimelineClick")}
                  />
                )}
              </div>
            ))}
            <div className="cutscene-time__markers" aria-hidden="true">
              <span
                className="cutscene-time__end"
                data-waits={advance === undefined}
                style={{ left: x(advance ?? readyAt) }}
              />
              {advance !== undefined && transition > 0 && (
                <span
                  className="cutscene-time__transition"
                  style={{ left: x(advance + exit), width: x(transition) }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      <footer className="cutscene-time__footer">
        <Button
          size="compact"
          variant="quiet"
          aria-pressed={selected === "advance"}
          aria-label={`${stepLabel}, ${t(channelLabels.advance)}`}
          onClick={() => onSelect("advance")}
        >
          {timing}
        </Button>
        {transition > 0 && (
          <span>{t("csTimelineTransition", { duration: seconds(transition) })}</span>
        )}
        {transitionControl}
      </footer>
    </section>
  );
}
