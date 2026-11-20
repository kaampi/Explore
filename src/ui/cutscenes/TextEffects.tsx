import { useMemo, type CSSProperties, type ReactNode } from "react";
import { SIGNAL_DEFAULTS, type TextCell } from "../../cutscenes/schema";
import { signalCycleSeconds } from "../../cutscenes/signalTiming";
import { revealWords, textGraphemes } from "../../cutscenes/textReveal";

const signalMarks = ["/", "?", "×", "·"] as const;

function textPieces(text: string, effect: TextCell["in"]["effect"]) {
  if (effect === "word-reveal") {
    return revealWords(text).map(({ content }) => content);
  }
  if (effect === "typewriter") return textGraphemes(text);
  return [];
}

function interference(pieces: string[], strength: number): ReactNode[][] {
  const runs = pieces.map(textGraphemes);
  const letters = runs.flat().filter((char) => /\p{L}/u.test(char)).length;
  const affected = Math.min(22, Math.ceil(letters * strength * 0.22));
  const spacing = affected ? Math.floor(letters / affected) : 0;
  let counter = 0;
  let remaining = affected;
  return runs.map((run) =>
    run.map((char, index) => {
      if (!/\p{L}/u.test(char)) return char;
      const position = counter++;
      if (!remaining || (position + Math.floor(spacing / 2)) % spacing !== 0) return char;
      const mark = signalMarks[(affected - remaining) % signalMarks.length];
      remaining--;
      return (
        <span className="cutscene-reel__glyph" data-noise={mark} key={index}>
          <span className="cutscene-reel__glyph-ink">{char}</span>
        </span>
      );
    }),
  );
}

export function CutsceneTextContent({
  text,
  progress,
  paused,
  reduced,
}: {
  text: TextCell;
  progress: number;
  paused: boolean;
  reduced: boolean;
}) {
  const effect = text.in.effect;
  const signal = text.signal ?? SIGNAL_DEFAULTS;
  const strength =
    !reduced && text.during === "signal-glitch" && signal.seconds ? signal.strength / 100 : 0;
  const pieces = useMemo(() => textPieces(text.text, effect), [text.text, effect]);
  const distorted = useMemo(
    () => (strength ? interference(pieces.length ? pieces : [text.text], strength) : undefined),
    [pieces, strength, text.text],
  );

  if (reduced || (!pieces.length && !distorted)) return text.text;

  const visible = Math.floor(pieces.length * progress + 1e-9);
  if (!distorted && effect === "typewriter") return pieces.slice(0, visible).join("");

  const runs = distorted ?? pieces;
  const interval = signalCycleSeconds(signal.density / 100);
  return (
    <span
      className={distorted ? "cutscene-reel__text-signal" : undefined}
      data-paused={distorted ? paused : undefined}
      style={
        distorted
          ? ({
              "--cutscene-signal-period": `${interval}s`,
              "--cutscene-signal-cycles": signal.seconds / interval,
              "--cutscene-glyph-offset": `${0.28 * strength}em`,
            } as CSSProperties)
          : undefined
      }
    >
      {runs.map((run, index) => (
        <span
          key={index}
          style={pieces.length && index >= visible ? { visibility: "hidden" } : undefined}
        >
          {run}
        </span>
      ))}
    </span>
  );
}
