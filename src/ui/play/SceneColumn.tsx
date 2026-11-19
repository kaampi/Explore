import { ItemSlot, NamePlate } from "./ornament";
import { useEffect, useState, type ReactNode } from "react";
import type { EncounterGame, EncounterAction } from "../../game/EncounterSchema";
import type { KnownThing, SceneWay } from "../../game/AdventureEngine";
import { publicCommands } from "../../game/catalog";
import { itemRevealed } from "../../game/itemVisibility";
import { formatTravelTime } from "../../state/gameClock";
import { useTranslate } from "../i18n/LanguageProvider";
import { Modal } from "../components/Modal";
import type { PlayerValue } from "./playerValues";

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
  foldValues,
  mapView,
  footer,
  collapsed,
  onToggleCollapsed,
  inPanel = false,
  onJournal,
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
  /** The values in the fold under Your character: the skills, and any meters beyond three. */
  foldValues: PlayerValue[];
  mapView?: ReactNode;
  footer?: ReactNode;
  /** The column is folded to a narrow strip. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Shown in a panel of its own (a narrow window): never folded, and no button to fold it. */
  inPanel?: boolean;
  /** Opens the journal, where everything the player knows is. */
  onJournal?: () => void;
  onGo: (wayId: string) => void;
  onAction: (action: EncounterAction) => void;
}) {
  const t = useTranslate();
  const [openThing, setOpenThing] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const { definition: d } = game;
  // An open card belongs to the place it was opened in.
  useEffect(() => setOpenThing(null), [d.id]);
  const stateName = {
    available: "",
    locked: t("pvLocked"),
    closed: t("pvClosed"),
    blocked: t("pvBlocked"),
  };
  const reason = {
    locked: "pvDoorLocked",
    closed: "pvDoorClosed",
    blocked: "pvDoorBlocked",
  } as const;
  const things = thingsHere(game);
  const open = things.find((thing) => thing.id === openThing);
  if (collapsed && !inPanel)
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
      {!inPanel && (
        <div className="play-scene__head">
          <NamePlate className="play-scene__title">{t("pvInTheScene")}</NamePlate>
          {!inPanel && (
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
          )}
        </div>
      )}
      {header}
      {ways.length > 0 && (
        <section className="play-scene__part" aria-label={t("pvFromHere")}>
          <h3>{t("pvFromHere")}</h3>
          <ul className="play-scene__list">
            {ways.map((way) => {
              const shut = way.status !== "available";
              const note = [
                way.minutes ? formatTravelTime(way.minutes) : "",
                shut ? stateName[way.status] : "",
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={way.id}>
                  <button
                    type="button"
                    className="play-scene__way"
                    disabled={busy || shut}
                    onClick={() => onGo(way.id)}
                  >
                    <span>{way.label}</span>
                    {note && <small>{note}</small>}
                  </button>
                  {way.status !== "available" && way.blockedBy && (
                    <small className="play-scene__reason">
                      {t(reason[way.status], { door: way.blockedBy })}
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
                <ItemSlot
                  className="play-scene__thing"
                  aria-expanded={openThing === thing.id}
                  onClick={() => setOpenThing(openThing === thing.id ? null : thing.id)}
                >
                  {thing.name}
                </ItemSlot>
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
        {foldValues.length > 0 && (
          <details className="play-scene__skills">
            <summary>{t("pvSkills")}</summary>
            <ul>
              {foldValues.map((skill) => (
                <li key={skill.id}>
                  <span>{skill.name}</span> <strong>{skill.value}</strong>
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
        {onJournal && (
          <button type="button" className="ui-button ui-button--quiet" onClick={onJournal}>
            {t("pvJournalSeeAll")}
          </button>
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
