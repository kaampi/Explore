import type { CSSProperties } from "react";
import type { CutsceneFilm, ImageCell } from "../../cutscenes/schema";

type Picture = CutsceneFilm["images"][number];

const meltRuns = [
  0.12, 0.05, 0, 0.11, 0.26, 0.29, 0.17, 0.08, 0.14, 0.22, 0.31, 0.18, 0.06, 0.03, 0.09, 0.2, 0.28,
  0.17, 0.09, 0.15, 0.22, 0.1, 0.04, 0.15,
];

export function MeltImage({
  picture,
  filter,
  progress,
  strength,
}: {
  picture: Picture;
  filter: ImageCell["filter"];
  progress: number;
  strength: number;
}) {
  return (
    <div aria-hidden="true" className="cutscene-reel__melt">
      {meltRuns.map((delay, index) => {
        const lag = delay * strength;
        const flow = Math.max(0, (progress - lag) / (1 - lag));
        const left = (index / meltRuns.length) * 100;
        const right = ((index + 1) / meltRuns.length) * 100;
        return (
          <img
            key={index}
            alt=""
            src={picture.dataUrl}
            draggable={false}
            className={`cutscene-reel__picture cutscene-reel__filter--${filter}`}
            style={{
              clipPath: `inset(0 ${Math.max(0, 100 - right - 0.1)}% 0 ${left}%)`,
              transform: `translateY(${flow ** 1.4 * 108}%) scaleY(${1 + flow * strength * 0.42})`,
              transformOrigin: "top",
            }}
          />
        );
      })}
    </div>
  );
}

const signalBands = [
  { top: 18, bottom: 77, offset: -4, tint: -12 },
  { top: 43, bottom: 48, offset: 3, tint: 9 },
  { top: 72, bottom: 25, offset: -5, tint: -6 },
  { top: 93, bottom: 5, offset: 7, tint: 14 },
];

export function SignalInterference({
  picture,
  filter,
  seconds,
  strength,
  density,
  paused,
  exitProgress,
}: {
  picture: Picture;
  filter: ImageCell["filter"];
  seconds: number;
  strength: number;
  density: number;
  paused: boolean;
  exitProgress?: number;
}) {
  // Change the interval between bursts without increasing the contrast or flash rate.
  const interval = 1.65 - density * 1.1;
  const phase = (((exitProgress ?? 0) * seconds) % interval) / interval;
  if (!strength || !seconds || (exitProgress !== undefined && phase >= 0.21)) return null;

  return (
    <div
      aria-hidden="true"
      className="cutscene-reel__signal"
      data-ambient={exitProgress === undefined}
      data-paused={paused}
      style={
        {
          "--cutscene-signal-period": `${interval}s`,
          "--cutscene-signal-cycles": seconds / interval,
        } as CSSProperties
      }
    >
      {signalBands.map(({ top, bottom, offset, tint }) => (
        <div
          key={top}
          className="cutscene-reel__signal-band"
          style={{ clipPath: `inset(${top}% 0 ${bottom}% 0)` }}
        >
          <img
            alt=""
            src={picture.dataUrl}
            draggable={false}
            className={`cutscene-reel__picture cutscene-reel__filter--${filter}`}
            style={
              {
                "--cutscene-signal-offset": `${offset * strength}%`,
                "--cutscene-signal-scale": 1 + Math.abs(offset * strength) / 50,
                "--cutscene-signal-tint": `${tint * strength}deg`,
              } as CSSProperties
            }
          />
        </div>
      ))}
    </div>
  );
}
