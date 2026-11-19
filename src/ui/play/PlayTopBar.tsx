import type { ReactNode } from "react";
import { MenuButton, type MenuItem } from "../components/Menu";
import { languageOptions, useLanguageControls, useTranslate } from "../i18n/LanguageProvider";
import "./play-view.css";

/** The row over the play view: back to the overview, where and when you are, and the settings menu. */
export function PlayTopBar({
  placeName,
  time,
  onHome,
  homeDisabled,
  homeTitle,
  onSaveIdea,
  onJournal,
  sound,
  onAppearance,
  aiOpen,
  onToggleAi,
  inspectorOpen,
  onToggleInspector,
  castOpen,
  onToggleCast,
}: {
  placeName: string;
  /** Game time, shown only when the adventure has travel times. */
  time?: string | undefined;
  onHome: () => void;
  homeDisabled: boolean;
  homeTitle?: string | undefined;
  /** Keeps the last lines of the story as an idea. Without it there is no button. */
  onSaveIdea?: (() => void) | undefined;
  /** Opens the journal. */
  onJournal: () => void;
  /** The sound control. It stays mounted, so that what is playing keeps playing. */
  sound?: ReactNode;
  onAppearance: () => void;
  aiOpen: boolean;
  onToggleAi: () => void;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  castOpen: boolean;
  onToggleCast: () => void;
}) {
  const t = useTranslate();
  const language = useLanguageControls();
  const items: MenuItem[] = [
    { label: t("pvAppearance"), onSelect: onAppearance },
    { kind: "check", label: t("pvAiModel"), checked: aiOpen, onToggle: onToggleAi },
    { kind: "check", label: t("pwInspector"), checked: inspectorOpen, onToggle: onToggleInspector },
    { kind: "check", label: t("pwCast"), checked: castOpen, onToggle: onToggleCast },
    ...(language
      ? ([
          { kind: "separator" },
          { kind: "heading", label: t("pvLanguage") },
          ...languageOptions.map((option) => ({
            kind: "check" as const,
            label: option.label,
            checked: language.language === option.value,
            onToggle: () => language.setLanguage(option.value),
          })),
        ] satisfies MenuItem[])
      : []),
  ];
  return (
    <header className="play-top">
      <button
        type="button"
        className="play-top__home"
        disabled={homeDisabled}
        title={homeDisabled ? t("pvToOverviewWait") : (homeTitle ?? t("pvToOverviewTitle"))}
        onClick={onHome}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M19 12H5m6-6-6 6 6 6" />
        </svg>
        <span className="play-top__home-label">{t("pvToOverview")}</span>
      </button>
      <h1 className="play-top__place">{placeName}</h1>
      {time && (
        <span className="play-top__time" aria-label={t("pvGameTime")}>
          {time}
        </span>
      )}
      <div className="play-top__tools">
        {onSaveIdea && (
          <button
            type="button"
            className="play-top__idea ui-button ui-button--idea"
            onClick={onSaveIdea}
          >
            {t("pvSaveIdea")}
          </button>
        )}
        <button
          type="button"
          className="play-top__journal ui-button ui-button--quiet"
          onClick={onJournal}
        >
          {t("pvJournal")}
        </button>
        {sound}
        <MenuButton label={t("pvMenu")} items={items} className="play-top__menu" />
      </div>
    </header>
  );
}
