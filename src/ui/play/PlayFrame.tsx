import { useEffect, useState, type ReactNode } from "react";
import { Modal } from "../components/Modal";
import { Frame } from "./ornament";
import type { PlayLayout } from "./usePlayLayout";
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
  collapsed = false,
  rightCollapsed = false,
  layout = "wide",
  cutsceneId,
  fullscreen,
  onJournal,
}: {
  /** The right column is folded to a narrow strip. */
  rightCollapsed?: boolean;
  /** The left column is folded to a narrow strip. */
  collapsed?: boolean;
  /** "narrow": one column, with the right column and the journal behind buttons. */
  layout?: PlayLayout;
  cutsceneId?: string | undefined;
  fullscreen?: ReactNode;
  /** Opens the journal. The narrow layout has a button for it among the others. */
  onJournal?: () => void;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}) {
  const t = useTranslate();
  const [panel, setPanel] = useState<{ cutsceneId: string | undefined } | null>(null);
  const narrow = layout === "narrow";
  const sceneOpen = panel !== null && panel.cutsceneId === cutsceneId;
  useEffect(() => {
    if (!narrow || !sceneOpen) setPanel(null);
  }, [narrow, sceneOpen]);
  if (fullscreen) return <div className="play-view play-view--cutscene-full">{fullscreen}</div>;
  return (
    <div
      className={`play-view${collapsed ? " play-view--collapsed" : ""}${rightCollapsed ? " play-view--right-collapsed" : ""}${narrow ? " play-view--narrow" : ""}`}
    >
      <section className="play-view__left" aria-label={t("pvPlaceAndPeople")}>
        {left}
      </section>
      {narrow && (
        <div className="play-view__panels">
          <button
            type="button"
            className="ui-button ui-button--secondary"
            onClick={() => setPanel({ cutsceneId })}
          >
            {t("pvInTheScene")}
          </button>
          {onJournal && (
            <button type="button" className="ui-button ui-button--secondary" onClick={onJournal}>
              {t("pvJournal")}
            </button>
          )}
        </div>
      )}
      <div className="play-view__center">{center}</div>
      {narrow ? (
        sceneOpen && (
          <Modal title={t("pvInTheScene")} onClose={() => setPanel(null)} side>
            {right}
          </Modal>
        )
      ) : (
        <Frame as="section" className="play-view__right" aria-label={t("pvInTheScene")}>
          {right}
        </Frame>
      )}
    </div>
  );
}
