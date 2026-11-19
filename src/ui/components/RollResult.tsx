import { useId } from "react";
import { CheckCard, Frame, NamePlate, useOrnament } from "../play/ornament";
import "./roll-result.css";

type Degree = "exceptional" | "success" | "failure" | "severe";
const MEDALLION_FACE = "M227 98 407 202V408L227 512 47 408V202Z";
/** Display only: the engine has already resolved and saved the check. */
export function RollResult({
  roll,
  target,
  degree,
  detail,
  rolledBy,
  closing = false,
  onConfirm,
}: {
  roll: number;
  target: number;
  degree?: Degree;
  detail?: string;
  rolledBy?: string | undefined;
  closing?: boolean;
  onConfirm: () => void;
}) {
  const id = useId().replace(/:/g, ""),
    outcome =
      degree ??
      (roll <= target
        ? roll <= 5
          ? "exceptional"
          : "success"
        : roll >= 96
          ? "severe"
          : "failure");
  const good = outcome === "success" || outcome === "exceptional";
  const label = {
    success: "Success",
    failure: "Failed",
    exceptional: "Critical success",
    severe: "Critical fail",
  }[outcome];
  const { set } = useOrnament("frame");
  if (set !== "plain")
    // In a theme with ornaments the result is the theme's own: its frame, its sign, its seal.
    return (
      <section
        className="roll-result roll-result--ornamented"
        data-outcome={good ? "success" : "failure"}
        data-degree={outcome}
        role="status"
        aria-live="polite"
        aria-label={`Dice result: ${label}`}
      >
        <Frame className="roll-result__card">
          <NamePlate as="strong" className="roll-result__title">
            {label}
          </NamePlate>
          {detail && <span className="roll-result__detail">{detail}</span>}
          <CheckCard roll={roll} fraction={roll / 100} className="roll-result__check">
            <p className="roll-result__numbers">
              Needed {target} or lower
              <br />
              {rolledBy ? `${rolledBy} rolled` : "You got"} <b>{roll}</b>
            </p>
          </CheckCard>
          <button
            type="button"
            className="roll-result__ok"
            autoFocus
            disabled={closing}
            onClick={onConfirm}
          >
            OK
          </button>
        </Frame>
      </section>
    );
  return (
    <section
      className="roll-result"
      data-outcome={good ? "success" : "failure"}
      data-degree={outcome}
      role="status"
      aria-live="polite"
      aria-label={`Dice result: ${label}`}
    >
      <svg
        className="roll-result__frame"
        viewBox="25 20 404 562"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <radialGradient id={`${id}-fill`} cx="50%" cy="50%" r={good ? "50%" : "65%"}>
            <stop offset="0" stopColor="var(--result-core)" />
            {good && <stop offset=".60" stopColor="var(--result-core)" />}
            <stop offset="1" stopColor="var(--result-edge)" />
          </radialGradient>
          <radialGradient id={`${id}-shade`} cx="50%" cy="50%" r="70%">
            <stop offset="0" stopColor="#000" stopOpacity=".76" />
            <stop offset=".45" stopColor="#000" stopOpacity=".50" />
            <stop offset=".80" stopColor="#000" stopOpacity=".10" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0.7" y2="1">
            <stop offset="0" stopColor="#fff3bb" />
            <stop offset=".22" stopColor="#ffb500" />
            <stop offset=".65" stopColor="#ff9300" />
            <stop offset="1" stopColor="#ffcc45" />
          </linearGradient>
        </defs>
        <g
          fill={`url(#${id}-fill)`}
          stroke={`url(#${id}-gold)`}
          strokeWidth="10"
          strokeLinejoin="round"
        >
          <path d="M227 88V102M227 506V520" fill="none" />
          <path d={MEDALLION_FACE} stroke="none" />
          {!good && <path d={MEDALLION_FACE} fill={`url(#${id}-shade)`} stroke="none" />}
          <path d={MEDALLION_FACE} fill="none" />
          <path d="M227 35 250 49V76L227 90 204 76V49Z" />
          <path d="M227 520 250 534V561L227 575 204 561V534Z" />
        </g>
        <g fill="none" stroke="#fff0c1" strokeWidth="2" strokeLinejoin="round" opacity=".8">
          <path d="M227 98 407 202V408L227 512 47 408V202Z" />
          <path d="M227 35 250 49V76L227 90 204 76V49Z" />
          <path d="M227 520 250 534V561L227 575 204 561V534Z" />
        </g>
      </svg>
      <div className="roll-result__content">
        <strong className="roll-result__title">{label}</strong>
        {detail && <span className="roll-result__detail">{detail}</span>}
        <p className="roll-result__numbers">
          Needed {target} or lower
          <br />
          {rolledBy ? `${rolledBy} rolled` : "You got"} <b>{roll}</b>
        </p>
        <button
          type="button"
          className="roll-result__ok"
          autoFocus
          disabled={closing}
          onClick={onConfirm}
        >
          OK
        </button>
      </div>
    </section>
  );
}
