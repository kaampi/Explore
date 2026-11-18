import type { StudioView } from "../studio/types";
import { useTranslate } from "../i18n/LanguageProvider";
export type StartAdventure = { id: string; name: string; scenes: number };

/** How many saved adventures the card lists before pointing to the builder. */
export const SHOWN_ADVENTURES = 3;

export function PlayStartPaths({
  onFree,
  onStudio,
  onPlayAdventure,
  adventures,
  disabled,
}: {
  onFree: () => void;
  onStudio: (view: StudioView) => void;
  onPlayAdventure: (id: string) => void;
  /** Saved adventures, newest first. */
  adventures: StartAdventure[];
  disabled: boolean;
}) {
  const t = useTranslate();
  const shown = adventures.slice(0, SHOWN_ADVENTURES);
  const hidden = adventures.length - shown.length;
  return (
    <section className="sb-start-paths" aria-label={t("startPathsLabel")}>
      <button
        type="button"
        aria-label={t("pathFreeTitle")}
        disabled={disabled}
        onClick={onFree}
        className="sb-start-path sb-start-path--free"
      >
        <div className="sb-start-path__top">
          <span>
            {t("pathFreeKicker")} <small>{t("pathFreeNote")}</small>
          </span>
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="24" />
            <path d="m42 20-7 17-17 9 9-19Z" />
            <path d="m27 27 8 10M32 3v7m0 44v7M3 32h7m44 0h7" />
          </svg>
        </div>
        <span className="sb-start-path__title" role="heading" aria-level={2}>
          {t("pathFreeTitle")}
        </span>
        <p>{t("pathFreeText")}</p>
      </button>
      <button
        type="button"
        aria-label={t("pathRulesTitle")}
        disabled={disabled}
        onClick={() => onStudio("rulesets")}
        className="sb-start-path sb-start-path--rules"
      >
        <div className="sb-start-path__top">
          <span>
            {t("pathRulesKicker")} <small>{t("pathRulesNote")}</small>
          </span>
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <path d="m32 5 24 15v25L32 59 8 45V20Zm0 0v54M8 20l24 13 24-13M8 45l24-12 24 12" />
          </svg>
        </div>
        <span className="sb-start-path__title" role="heading" aria-level={2}>
          {t("pathRulesTitle")}
        </span>
        <p>{t("pathRulesText")}</p>
      </button>
      <div
        className="sb-start-path sb-start-path--adventure"
        role="group"
        aria-label={t("pathAdventureTitle")}
      >
        <div className="sb-start-path__top">
          <span>
            {t("pathAdventureKicker")} <small>{t("pathAdventureNote")}</small>
          </span>
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <path d="M32 14C22 7 12 8 6 12v39c8-4 17-3 26 3 9-6 18-7 26-3V12c-6-4-16-5-26 2Zm0 0v40M14 22c4-1 7 0 11 2m-11 7c4-1 7 0 11 2m14-9 5 5 8-10m-13 19h12" />
          </svg>
        </div>
        <span className="sb-start-path__title" role="heading" aria-level={2}>
          {t("pathAdventureTitle")}
        </span>
        <p>{t("pathAdventureText")}</p>
        {shown.length > 0 ? (
          <ul className="sb-start-path__adventures" aria-label={t("yourAdventures")}>
            {shown.map((adventure) => (
              <li key={adventure.id}>
                <button
                  type="button"
                  disabled={disabled || adventure.scenes === 0}
                  onClick={() => onPlayAdventure(adventure.id)}
                >
                  <strong>{adventure.name || t("untitledAdventure")}</strong>
                  <small>
                    {adventure.scenes === 0
                      ? t("noScenesYet")
                      : t(adventure.scenes === 1 ? "sceneOne" : "sceneMany", {
                          count: adventure.scenes,
                        })}
                  </small>
                  <span aria-hidden="true">{t("playArrow")}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sb-start-path__empty">{t("noAdventuresYet")}</p>
        )}
        {hidden > 0 && (
          <p className="sb-start-path__more">{t("moreInBuilder", { count: hidden })}</p>
        )}
        <button
          type="button"
          className="sb-link sb-start-path__builder"
          disabled={disabled}
          onClick={() => onStudio("campaigns")}
        >
          {t("openBuilder")}
        </button>
      </div>
    </section>
  );
}
