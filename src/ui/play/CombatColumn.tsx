import type { ReactNode } from "react";
import { HealthMeter } from "../components/HealthMeter";
import { useTranslate } from "../i18n/LanguageProvider";
import "./play-view.css";

/** One of the fighters, in the order they take their turns. */
export type TurnEntry = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  /** A word or two about how they are: "Defending", "Incapacitated", and so on. */
  status: string[];
  /** It is their turn. */
  active: boolean;
};

/**
 * The right column in a fight: the order of turns, and the health of everyone in it. The one
 * whose turn it is, is marked. It replaces "In the scene" until the fight is over.
 */
export function CombatColumn({
  round,
  turnLabel,
  entries,
  footer,
}: {
  round: number;
  /** Whose turn it is, in words. */
  turnLabel: string;
  entries: TurnEntry[];
  footer?: ReactNode;
}) {
  const t = useTranslate();
  return (
    <aside
      className="sb-game-toolbox gate-scene-toolbox play-scene play-combat"
      aria-label={t("pvCombat")}
    >
      <div className="play-scene__head">
        <h2 className="play-scene__title">
          {t("pvCombat")} · {t("pvRound", { round })}
        </h2>
      </div>
      <p className="play-combat__turn" role="status" aria-live="polite">
        {turnLabel}
      </p>
      <ol className="play-combat__order" aria-label={t("pvTurnOrder")}>
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={`play-combat__entry${entry.active ? " play-combat__entry--active" : ""}`}
            aria-current={entry.active ? "step" : undefined}
          >
            <HealthMeter name={entry.name} value={entry.hp} max={entry.maxHp} />
            {entry.status.length > 0 && (
              <small className="play-combat__status">{entry.status.join(" · ")}</small>
            )}
          </li>
        ))}
      </ol>
      {footer}
    </aside>
  );
}
