import type { PlayerValue } from "./playerValues";
import "./play-view.css";

/** One of the player's values as a meter: its name, the number, and where it is on its scale. */
export function ValueMeter({ value }: { value: PlayerValue }) {
  const span = value.max - value.min;
  return (
    <div className="play-value">
      <div className="play-value__label">
        <strong>{value.name}</strong>
        <span>
          {value.value} / {value.max}
        </span>
      </div>
      <progress
        aria-label={value.name}
        value={span > 0 ? Math.min(Math.max(value.value - value.min, 0), span) : 0}
        max={span > 0 ? span : 1}
      />
    </div>
  );
}
