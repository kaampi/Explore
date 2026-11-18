import type { ReactNode } from "react";
import { useTranslate } from "../i18n/LanguageProvider";
import "./play-view.css";

/**
 * The frame of the play view for an engine scene: the place and the people on the left, the story
 * and what to do in the middle, what is in the scene on the right. It only places its three parts;
 * what is in them, and what the game does, is not its business.
 */
export function PlayFrame({
  left,
  center,
  right,
}: {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}) {
  const t = useTranslate();
  return (
    <div className="play-view">
      <section className="play-view__left" aria-label={t("pvPlaceAndPeople")}>
        {left}
      </section>
      <div className="play-view__center">{center}</div>
      <section className="play-view__right" aria-label={t("pvInTheScene")}>
        {right}
      </section>
    </div>
  );
}
