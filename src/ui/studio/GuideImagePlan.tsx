import { useRef, useState } from "react";
import type { GuideImage } from "../../library/guideImages";
import { useTranslate } from "../i18n/LanguageProvider";

const imageLabels = {
  opening: ["cgImageOpening", "cgImageScenePrompt"],
  scene: ["cgImageScene", "cgImageScenePrompt"],
  portrait: ["cgImagePortrait", "cgImagePortraitPrompt"],
  item: ["cgImageItem", "cgImageItemPrompt"],
  world: ["cgImageWorld", "cgImageWorldPrompt"],
} as const;

export function GuideImagePlan({
  images,
  saved = false,
}: {
  images: GuideImage[];
  saved?: boolean;
}) {
  const t = useTranslate();
  return (
    <details className="guide-plan-section guide-image-plan">
      <summary>{t("cgImagePlan")}</summary>
      {images.length ? (
        <>
          <p>{t("cgImagePlanHelp")}</p>
          {images.map((image) => (
            <ImagePrompt key={image.id} image={image} />
          ))}
        </>
      ) : (
        <p>{t(saved ? "cgImagePlanSavedEmpty" : "cgImagePlanEmpty")}</p>
      )}
    </details>
  );
}

function ImagePrompt({ image }: { image: GuideImage }) {
  const t = useTranslate();
  const [label, instruction] = imageLabels[image.kind];
  const subject = image.subject || t("cgOpening");
  const prompt = [
    t(instruction, { subject }),
    ...new Set(image.details.map((detail) => detail.trim()).filter(Boolean)),
  ].join("\n\n");
  const input = useRef<HTMLTextAreaElement>(null);
  const [feedback, setFeedback] = useState<{ prompt: string; copied: boolean }>();

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setFeedback({ prompt, copied: true });
    } catch {
      input.current?.focus();
      input.current?.select();
      setFeedback({ prompt, copied: false });
    }
  }

  return (
    <section className="guide-image-card">
      <h3>
        {t(label)} · {subject}
      </h3>
      <label className="guide-field">
        <span>{t("cgImagePrompt")}</span>
        <textarea ref={input} value={prompt} readOnly rows={5} />
      </label>
      <button type="button" onClick={() => void copy()}>
        {t("cgImageCopy")}
      </button>
      {feedback?.prompt === prompt && (
        <p role="status">{t(feedback.copied ? "cgImageCopied" : "cgImageSelected")}</p>
      )}
    </section>
  );
}
