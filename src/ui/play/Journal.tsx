import type { Session } from "../../state/StateSchema";
import {
  adventureCompleted,
  knownThings,
  peopleMet,
  placesVisited,
} from "../../game/AdventureEngine";
import { playerInventory } from "../../session/playerInventory";
import { formatGameTime } from "../../state/gameClock";
import { portraitSrc } from "../studio/portrait";
import { initialsOf } from "./personCard";
import { useTranslate } from "../i18n/LanguageProvider";
import { Modal } from "../components/Modal";
import "./play-view.css";

/**
 * The journal: a panel from the right with the goal, everything the player knows, the pack, the
 * people met, the places been to and the lines kept with "Remember this". It only shows what the
 * game already holds; nothing here changes the game except forgetting a kept line.
 */
export function Journal({
  session,
  onForget,
  onClose,
}: {
  session: Session;
  onForget: (sceneId: string, index: number) => void;
  onClose: () => void;
}) {
  const t = useTranslate();
  const run = session.adventure;
  const known = knownThings(session);
  const pack = playerInventory(session);
  const people = peopleMet(session);
  const places = placesVisited(session);
  const timed = !!run?.links.some((link) => link.minutes !== undefined);
  const kept = run
    ? Object.entries(run.notes)
        .filter(([, notes]) => notes.length > 0)
        .map(([sceneId, notes]) => ({
          sceneId,
          notes,
          place: run.scenes.find((scene) => scene.id === sceneId)?.name ?? sceneId,
        }))
    : [];
  const done = adventureCompleted(session);
  return (
    <Modal title={t("pvJournal")} onClose={onClose} side>
      <div className="play-journal">
        <section aria-label={t("pvGoal")}>
          <h3>{t("pvGoal")}</h3>
          {run?.goal ? (
            <p className={`play-journal__goal${done ? " play-journal__goal--done" : ""}`}>
              {done && <span aria-label={t("pvGoalDone")}>✓ </span>}
              {run.goal.title}
            </p>
          ) : (
            <p className="play-journal__empty">{t("pvNoGoal")}</p>
          )}
        </section>
        <section aria-label={t("pvWhatYouKnow")}>
          <h3>{t("pvWhatYouKnow")}</h3>
          {known.length === 0 ? (
            <p className="play-journal__empty">{t("pvNothingKnownYet")}</p>
          ) : (
            <ul className="play-journal__list">
              {known.map((thing) => (
                <li key={`${thing.sceneId}:${thing.text}`}>
                  {thing.text}
                  <small>{thing.place}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label={t("pvPack")}>
          <h3>{t("pvPack")}</h3>
          {pack.length === 0 ? (
            <p className="play-journal__empty">{t("pvNothingYet")}</p>
          ) : (
            <ul className="play-journal__list">
              {pack.map((entry) => (
                <li key={entry.key}>
                  {entry.name}
                  {entry.quantity > 1 && <small>× {entry.quantity}</small>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label={t("pvPeopleMet")}>
          <h3>{t("pvPeopleMet")}</h3>
          {people.length === 0 ? (
            <p className="play-journal__empty">{t("pvNothingYet")}</p>
          ) : (
            <ul className="play-journal__people">
              {people.map((person) => {
                const picture = portraitSrc(person.portraitDataUrl);
                return (
                  <li key={person.actorId}>
                    {picture ? (
                      <img src={picture} alt="" className="play-journal__face" />
                    ) : (
                      <span className="play-journal__face" aria-hidden="true">
                        {initialsOf(person.name)}
                      </span>
                    )}
                    <span>
                      {person.name}
                      <small>{person.place}</small>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section aria-label={t("pvPlacesVisited")}>
          <h3>{t("pvPlacesVisited")}</h3>
          {places.length === 0 ? (
            <p className="play-journal__empty">{t("pvNothingYet")}</p>
          ) : (
            <ol className="play-journal__list">
              {places.map((place) => (
                <li key={place.sceneId}>
                  {place.place}
                  {timed && <small>{formatGameTime(place.minutes)}</small>}
                </li>
              ))}
            </ol>
          )}
        </section>
        <section aria-label={t("pvRemembered")}>
          <h3>{t("pvRemembered")}</h3>
          {kept.length === 0 ? (
            <p className="play-journal__empty">{t("pvNothingYet")}</p>
          ) : (
            kept.map((place) => (
              <div key={place.sceneId} aria-label={place.place}>
                <h4>{place.place}</h4>
                <ul className="play-journal__list">
                  {place.notes.map((note, index) => (
                    <li key={`${place.sceneId}:${index}`} className="play-journal__note">
                      <span>{note}</span>
                      <button
                        type="button"
                        className="ui-button ui-button--quiet"
                        aria-label={`${t("forget")}: ${note.slice(0, 40)}`}
                        onClick={() => onForget(place.sceneId, index)}
                      >
                        {t("forget")}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
    </Modal>
  );
}
