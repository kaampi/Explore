import { useEffect, useState, type ReactNode } from "react";
import type { EncounterGame, EncounterAction } from "../../game/EncounterSchema";
import type { KnownThing, SceneWay } from "../../game/AdventureEngine";
import { publicCommands } from "../../game/catalog";
import { itemRevealed } from "../../game/itemVisibility";
import { formatTravelTime } from "../../state/gameClock";
import { useTranslate } from "../i18n/LanguageProvider";
import { Modal } from "../components/Modal";

/** At most this many discoveries are shown here. The rest are in the journal. */
export const KNOWN_SHOWN = 5;

/** The things lying in the place the player stands in, that the player may see. */
export function thingsHere(game: EncounterGame) {
  const { definition: d, state: s } = game;
  const player = s.actors[d.playerId];
  if (!player) return [];
  return d.items.filter(
    (item) => s.itemLocations[item.id] === player.position && itemRevealed(d, s, item.id),
  );
}

/** The actions that have something to do with a thing: the ones that take it or need it. */
export function actionsForThing(game: EncounterGame, itemId: string) {
  const { definition: d } = game;
  return publicCommands(game).filter((command) => {
    const action = command.action;
    if (action.kind !== "interaction") return false;
    const interaction = d.interactions.find((i) => i.id === action.interactionId);
    if (!interaction) return false;
    return (
      interaction.requiresItems.includes(itemId) ||
      [...interaction.success.effects, ...interaction.failure.effects].some(
        (effect) =>
          (effect.kind === "take-item" || effect.kind === "transfer-item") &&
          effect.itemId === itemId,
      )
    );
  });
}

/**
 * The right column, "In the scene": the ways out, the things here, your character, what you
 * know, and the map. It lists what the scene holds; what to do next is in the middle.
 */
export function SceneColumn({
  game,
  ways,
  known,
  busy,
  header,
  character,
  mapView,
  footer,
  collapsed,
  onToggleCollapsed,
  onGo,
  onAction,
}: {
  game: EncounterGame;
  ways: SceneWay[];
  known: KnownThing[];
  busy: boolean;
  /** The goal and game time of the adventure, when there is one. */
  header?: ReactNode;
  /** Health and the pack. */
  character: ReactNode;
  mapView?: ReactNode;
  footer?: ReactNode;
  /** The column is folded to a narrow strip. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onGo: (wayId: string) => void;
  onAction: (action: EncounterAction) => void;
}) {
  const t = useTranslate();
  const [openThing, setOpenThing] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const { definition: d, state: s } = game;
  const player = s.actors[d.playerId];
  // An open card belongs to the place it was opened in.
  useEffect(() => setOpenThing(null), [d.id]);
  const things = thingsHere(game);
  const open = things.find((thing) => thing.id === openThing);
  const skills = d.rules.attributes.filter((a) => player?.stats[a.id] !== undefined);
  if (collapsed)
    return (
      <aside
        className="sb-game-toolbox gate-scene-toolbox play-scene play-scene--collapsed"
        aria-label={t("pvInTheScene")}
      >
        <button
          type="button"
          className="play-scene__fold"
          aria-expanded={false}
          aria-label={t("pvShowScene")}
          title={t("pvShowScene")}
          onClick={onToggleCollapsed}
        >
          «
        </button>
      </aside>
    );
  return (
    <aside className="sb-game-toolbox gate-scene-toolbox play-scene" aria-label={t("pvInTheScene")}>
      <div className="play-scene__head">
        <h2 className="play-scene__title">{t("pvInTheScene")}</h2>
        <button
          type="button"
          className="play-scene__fold"
          aria-expanded={true}
          aria-label={t("pvHideScene")}
          title={t("pvHideScene")}
          onClick={onToggleCollapsed}
        >
          »
        </button>
      </div>
      {header}
      {ways.length > 0 && (
        <section className="play-scene__part" aria-label={t("pvFromHere")}>
          <h3>{t("pvFromHere")}</h3>
          <ul className="play-scene__list">
            {ways.map((way) => {
              const locked = way.status === "locked";
              const note = [
                way.minutes ? formatTravelTime(way.minutes) : "",
                locked ? t("pvLocked") : "",
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={way.id}>
                  <button
                    type="button"
                    className="play-scene__way"
                    disabled={busy || locked}
                    onClick={() => onGo(way.id)}
                  >
                    <span>{way.label}</span>
                    {note && <small>{note}</small>}
                  </button>
                  {locked && way.blockedBy && (
                    <small className="play-scene__reason">
                      {t("pvHeldShutBy", { door: way.blockedBy })}
                    </small>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {things.length > 0 && (
        <section className="play-scene__part" aria-label={t("pvThingsHere")}>
          <h3>{t("pvThingsHere")}</h3>
          <ul className="play-scene__list">
            {things.map((thing) => (
              <li key={thing.id}>
                <button
                  type="button"
                  className="play-scene__thing"
                  aria-expanded={openThing === thing.id}
                  onClick={() => setOpenThing(openThing === thing.id ? null : thing.id)}
                >
                  {thing.name}
                </button>
              </li>
            ))}
          </ul>
          {open && (
            <div className="play-scene__thing-card">
              {open.description && <p>{open.description}</p>}
              <div className="play-scene__thing-actions">
                {actionsForThing(game, open.id).map((command) => (
                  <button
                    key={command.ref}
                    type="button"
                    className="ui-button ui-button--secondary"
                    disabled={busy || !!command.blocked}
                    title={command.blocked}
                    onClick={() => onAction(command.action)}
                  >
                    {command.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
      <section className="play-scene__part" aria-label={t("pvYourCharacter")}>
        <h3>{t("pvYourCharacter")}</h3>
        {character}
        {skills.length > 0 && player && (
          <details className="play-scene__skills">
            <summary>{t("pvSkills")}</summary>
            <ul>
              {skills.map((skill) => (
                <li key={skill.id}>
                  <span>{skill.name}</span> <strong>{player.stats[skill.id]}</strong>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <section className="play-scene__part" aria-label={t("pvWhatYouKnow")}>
        <h3>{t("pvWhatYouKnow")}</h3>
        {known.length === 0 ? (
          <p className="play-scene__empty">{t("pvNothingKnownYet")}</p>
        ) : (
          <ul className="play-scene__known">
            {known.slice(0, KNOWN_SHOWN).map((thing) => (
              <li key={`${thing.sceneId}:${thing.text}`}>
                {thing.text}
                <small>{thing.place}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
      {mapView && (
        <section className="play-scene__part">
          <button
            type="button"
            className="ui-button ui-button--secondary"
            onClick={() => setMapOpen(true)}
          >
            {t("pvShowMap")}
          </button>
          {mapOpen && (
            <Modal title={t("pvShowMap")} onClose={() => setMapOpen(false)} wide>
              {mapView}
              <button
                type="button"
                className="ui-button ui-button--quiet"
                onClick={() => setMapOpen(false)}
              >
                {t("pvClose")}
              </button>
            </Modal>
          )}
        </section>
      )}
      {footer}
    </aside>
  );
}
