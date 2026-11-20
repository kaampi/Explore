import { useEffect, useId, useState, type ReactNode } from "react";
import type { Cutscene } from "../../game/CutsceneSchema";
import { Button } from "../components/Button";
import { useTranslate } from "../i18n/LanguageProvider";
import { Divider, Frame, NamePlate } from "./ornament";
import "./play-view.css";

export function CutsceneView({
  cutscene,
  busy,
  onFinish,
  status,
}: {
  cutscene: Cutscene;
  busy: boolean;
  onFinish: () => void;
  status?: ReactNode;
}) {
  const t = useTranslate();
  const id = useId();
  const titleId = `${id}-title`;
  const [paragraph, setParagraph] = useState(0);
  const last = paragraph === cutscene.paragraphs.length - 1;
  const image = cutscene.imageDataUrl?.startsWith("data:image/")
    ? cutscene.imageDataUrl
    : undefined;

  useEffect(() => {
    document.getElementById(id)?.focus();
  }, [id]);

  function advance() {
    if (busy) return;
    if (last) onFinish();
    else setParagraph(paragraph + 1);
  }

  return (
    <Frame
      as="section"
      className="play-cutscene"
      id={id}
      tabIndex={-1}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (
          event.target !== event.currentTarget ||
          (event.key !== "Enter" && event.key !== " ") ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        )
          return;
        event.preventDefault();
        if (!event.repeat) advance();
      }}
    >
      <div className="play-cutscene__content">
        {image && <img className="play-cutscene__image" src={image} alt="" />}
        <NamePlate id={titleId}>{cutscene.title}</NamePlate>
        {image && <Divider aria-hidden="true" />}
        <p className="play-row play-cutscene__text" aria-live="polite" aria-atomic="true">
          {cutscene.paragraphs[paragraph]}
        </p>
        <div className="play-cutscene__actions">
          <Button variant="primary" disabled={busy} onClick={advance}>
            {t(last ? "pvCutsceneContinueGame" : "pvCutsceneContinue")}
          </Button>
          <Button variant="quiet" disabled={busy} onClick={onFinish}>
            {t("pvCutsceneSkip")}
          </Button>
        </div>
        {status}
      </div>
    </Frame>
  );
}
