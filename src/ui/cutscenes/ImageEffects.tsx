import {
  useCallback,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ImgHTMLAttributes,
} from "react";
import type { CutsceneFilm, ImageCell } from "../../cutscenes/schema";
import { signalCycleSeconds } from "../../cutscenes/signalTiming";

type Picture = CutsceneFilm["images"][number];

const turn = 2 * Math.PI;

function paintMelt(
  canvas: HTMLCanvasElement,
  picture: HTMLImageElement,
  progress: number,
  strength: number,
) {
  const { naturalWidth, naturalHeight } = picture;
  const { clientWidth, clientHeight } = canvas;
  if (!naturalWidth || !naturalHeight || !clientWidth || !clientHeight) return false;
  const context = canvas.getContext("2d");
  if (!context) return false;

  // Limit how many columns are drawn on a large or high-density screen.
  const resolution = Math.min(1, 800 / clientWidth, 900 / clientHeight);
  const width = Math.max(1, Math.round(clientWidth * resolution));
  const height = Math.max(1, Math.round(clientHeight * resolution));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  context.clearRect(0, 0, width, height);

  // Match the main image's centered object-fit: cover crop.
  const scale = Math.max(width / naturalWidth, height / naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (naturalWidth - sourceWidth) / 2;
  const sourceY = (naturalHeight - sourceHeight) / 2;
  const column = sourceWidth / width;
  if (progress === 0) {
    context.drawImage(picture, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
    return true;
  }

  for (let x = 0; x < width; x++) {
    const along = (x + 0.5) / width;
    // Smooth waves of different sizes give irregular drips without seams between columns.
    const ridge =
      0.5 +
      0.29 * Math.sin(turn * (along * 4 + 0.12)) +
      0.15 * Math.sin(turn * (along * 9 - 0.17)) +
      0.06 * Math.sin(turn * (along * 17 + 0.34));
    const lag = ridge * strength * 0.52;
    const flow = Math.max(0, (progress - lag) / (1 - lag));
    const fall = height * 1.06 * flow ** 1.6;
    const stretch = height * strength * (1 - ridge) * flow * 0.6;
    if (fall >= height) continue;
    context.drawImage(
      picture,
      sourceX + x * column,
      sourceY,
      column,
      sourceHeight,
      x,
      fall,
      1,
      height + stretch,
    );
  }
  return true;
}

export function MeltImage({
  progress,
  strength,
  className,
  ...picture
}: ImgHTMLAttributes<HTMLImageElement> & {
  progress: number | undefined;
  strength: number;
  className: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const active = progress !== undefined;
  const draw = useCallback(() => {
    if (!canvas.current || !image.current || progress === undefined) return;
    canvas.current.toggleAttribute(
      "data-painted",
      paintMelt(canvas.current, image.current, progress, strength),
    );
  }, [progress, strength]);
  const redraw = useRef(draw);
  useLayoutEffect(() => {
    redraw.current = draw;
    draw();
  }, [draw]);
  useLayoutEffect(() => {
    if (!active || !canvas.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => redraw.current());
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [active]);

  return (
    <>
      {active && (
        <canvas ref={canvas} className={`${className} cutscene-reel__melt`} aria-hidden="true" />
      )}
      <img
        {...picture}
        ref={image}
        className={className}
        onLoad={draw}
        style={active ? { opacity: 1 - progress } : undefined}
      />
    </>
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
  const interval = signalCycleSeconds(density);
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
