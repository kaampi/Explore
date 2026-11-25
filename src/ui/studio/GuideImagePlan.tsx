import { useRef, useState } from "react";
import type { GuideImage, GuideImageTarget } from "../../library/guideImages";
import { useTranslate } from "../i18n/LanguageProvider";
import { prepareGuideImage } from "./guideImageFiles";
import type { SceneImagePair } from "./portrait";

const cardLabels = {
  character: "cgImageCharacterCard",
  player: "cgImagePlayerCard",
  object: "cgImageObjectCard",
  place: "cgImagePlaceCard",
  mapPlace: "cgImageMapPlace",
  realm: "cgImageWorldCard",
} as const;

type SaveImage = (target: GuideImageTarget, image: SceneImagePair) => Promise<void>;

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
  onSave,
}: {
  images: GuideImage[];
  saved?: boolean;
  onSave?: SaveImage;
}) {
  const t = useTranslate();
  const [savedName, setSavedName] = useState("");
  async function save(target: GuideImageTarget, image: SceneImagePair) {
    if (!onSave) return;
    setSavedName("");
    await onSave(target, image);
    setSavedName(target.name);
  }
  return (
    <details className="guide-plan-section guide-image-plan">
      <summary>{t("cgImagePlan")}</summary>
      {savedName && <p role="status">{t("cgImageSaved", { name: savedName })}</p>}
      {images.length ? (
        <>
          <p>{t(saved ? "cgImageSavedPlanHelp" : "cgImagePlanHelp")}</p>
          {images.map((image) => (
            <ImagePrompt
              key={JSON.stringify([
                image.id,
                image.target?.kind,
                image.target?.id,
                image.target && "realmId" in image.target ? image.target.realmId : undefined,
              ])}
              image={image}
              saved={saved}
              onSave={save}
            />
          ))}
        </>
      ) : (
        <p>{t(saved ? "cgImagePlanSavedEmpty" : "cgImagePlanEmpty")}</p>
      )}
    </details>
  );
}

function ImagePrompt({
  image,
  saved,
  onSave,
}: {
  image: GuideImage;
  saved: boolean;
  onSave: SaveImage;
}) {
  const t = useTranslate();
  const [label, instruction] = imageLabels[image.kind];
  const subject = image.subject || t("cgOpening");
  const prompt = [
    t(instruction, { subject }),
    ...new Set(image.details.map((detail) => detail.trim()).filter(Boolean)),
  ].join("\n\n");
  const input = useRef<HTMLTextAreaElement>(null);
  const [feedback, setFeedback] = useState<{ prompt: string; copied: boolean }>();

  const details = useRef<HTMLDetailsElement>(null);
  const [preview, setPreview] = useState<SceneImagePair>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"cgImageReadFailed" | "cgImageSaveFailed">();
  const { target } = image;

  async function choose(file: File, destination: GuideImageTarget) {
    setPreview(undefined);
    setError(undefined);
    setBusy(true);
    try {
      setPreview(await prepareGuideImage(destination.kind, file));
    } catch {
      setError("cgImageReadFailed");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!target || !preview || busy) return;
    setError(undefined);
    setBusy(true);
    try {
      await onSave(target, preview);
      setPreview(undefined);
    } catch {
      setError("cgImageSaveFailed");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setPreview(undefined);
    setFeedback(undefined);
    setError(undefined);
    if (details.current) {
      details.current.open = false;
      details.current.querySelector("summary")?.focus();
    }
  }

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

  const cardName = target?.number ? `${target.name} #${target.number}` : target?.name;
  const heading = (
    <h3>
      {t(label)} · {target?.number ? cardName : subject}
    </h3>
  );
  const fields = (
    <>
      {target && (
        <p>
          {t(cardLabels[target.kind], { name: cardName ?? target.name })}
          {target.context && target.context !== target.name && (
            <span className="guide-image-context">{target.context}</span>
          )}
        </p>
      )}
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
      {target ? (
        <div className="guide-image-upload">
          <label className="guide-field">
            <span>{t("cgImageChoose")}</span>
            <input
              type="file"
              accept={target.kind === "object" ? "image/png,image/jpeg,image/webp" : "image/*"}
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void choose(file, target);
              }}
            />
          </label>
          {preview && <img src={preview.imageDataUrl} alt={t("cgImagePreview")} />}
          {error && <p role="alert">{t(error)}</p>}
          <div className="guide-buttons">
            <button type="button" disabled={busy || !preview} onClick={() => void save()}>
              {t("cgImageSave")}
            </button>
            <button type="button" disabled={busy} onClick={cancel}>
              {t("cgImageCancel")}
            </button>
          </div>
        </div>
      ) : (
        saved && <p>{t("cgImageNoCard")}</p>
      )}
    </>
  );
  return saved ? (
    <details className="guide-image-card" ref={details}>
      <summary>{heading}</summary>
      {fields}
    </details>
  ) : (
    <section className="guide-image-card">
      {heading}
      {fields}
    </section>
  );
}
