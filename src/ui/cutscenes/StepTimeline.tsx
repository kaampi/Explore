import type { PlaybackStep } from "../../cutscenes/playback";
import { stepTimeline } from "../../cutscenes/stepTimeline";
import { Button, IconButton } from "../components/Button";
import { useTranslate } from "../i18n/LanguageProvider";
import { channelLabels, type Channel } from "./CutsceneFields";
import { useWorkspaceView } from "./useWorkspaceView";

const lanes = ["image", "sound", "text", "advance"] as const;
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
        disabled={zoom === 8}
        onClick={() => workspace.zoomBy(1.5)}
      />
    </div>
  );
}

export function StepTimeline({
  step,
  number,
  selected,
  onSelect,
}: {
  step: PlaybackStep;
  number: number;
  selected: Channel;
  onSelect: (channel: Channel) => void;
}) {
  const t = useTranslate();
  const workspace = useWorkspaceView(true);
  const { spans, advance, readyAt, cue, exit, open, end, transition } = stepTimeline(step);
  const limit = advance === undefined && readyAt >= end ? end + 1000 : end;
  const tickSpacing = Math.max(1, Math.ceil(limit / 10000 / workspace.view.zoom)) * 1000;
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
  const title = t("csStepTimeline", { step: t("csStep", { number }) });

  return (
    <section className="cutscene-time" aria-label={title}>
      <header className="cutscene-time__header">
        <h3>{title}</h3>
        <WorkspaceZoom workspace={workspace} />
      </header>
      <div className="cutscene-time__body">
        <div className="cutscene-time__labels">
          {lanes.map((lane) => (
            <Button
              key={lane}
              size="compact"
              variant="quiet"
              aria-pressed={selected === lane}
              onClick={() => onSelect(lane)}
            >
              {t(channelLabels[lane])}
            </Button>
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
            style={{ width: `${workspace.view.zoom * 100}%`, left: workspace.view.x }}
          >
            <div className="cutscene-time__ruler" aria-hidden="true">
              {ticks.map((tick) => (
                <span key={tick} style={{ left: x(tick) }}>
                  {seconds(tick)}
                </span>
              ))}
            </div>
            {lanes.map((lane) => (
              <div
                key={lane}
                className="cutscene-time__lane"
                data-selected={selected === lane}
                aria-label={t(channelLabels[lane])}
              >
                {ticks.map((tick) => (
                  <i className="cutscene-time__tick" key={tick} style={{ left: x(tick) }} />
                ))}
                {spans
                  .filter((span) => span.lane === lane)
                  .map(({ start, end, style }) => {
                    const label = t("csTimelineSpan", {
                      kind: t(
                        style === "in"
                          ? "csEnter"
                          : style === "out"
                            ? "csExit"
                            : channelLabels[lane],
                      ),
                      start: seconds(start),
                      end: seconds(end),
                    });
                    return (
                      <span
                        key={`${style}-${start}-${end}`}
                        className="cutscene-time__span"
                        role="img"
                        data-shape={style}
                        aria-label={label}
                        title={label}
                        style={{ left: x(start), width: x(end - start) }}
                      />
                    );
                  })}
                {lane !== "advance" && advance === undefined && open[lane] && (
                  <span
                    className="cutscene-time__open"
                    style={{ left: x(readyAt) }}
                    title={t("csTimelineClick")}
                  />
                )}
                {lane === "sound" && cue !== undefined && (
                  <span
                    className="cutscene-time__cue"
                    role="img"
                    aria-label={t("csTimelineSoundAt", { time: seconds(cue) })}
                    title={t("csTimelineSoundAt", { time: seconds(cue) })}
                    style={{ left: x(cue) }}
                  />
                )}
                {lane === "advance" && (
                  <>
                    <span className="cutscene-time__end" style={{ left: x(advance ?? readyAt) }} />
                    {advance !== undefined && transition > 0 && (
                      <span
                        className="cutscene-time__span cutscene-time__span--transition"
                        style={{ left: x(advance + exit), width: x(transition) }}
                      />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="cutscene-time__timing">
        {timing}
        {transition > 0 && <> · {t("csTimelineTransition", { duration: seconds(transition) })}</>}
      </p>
    </section>
  );
}
