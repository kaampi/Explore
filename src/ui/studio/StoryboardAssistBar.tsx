import { Button } from "../components/Button";
import { MenuButton, type MenuItem } from "../components/Menu";
import { useTranslate } from "../i18n/LanguageProvider";
import type { PreviewModel } from "./assistPreview";

/**
 * The group in Storyboard's toolbar when a scene is chosen: "Scene name: ✦ Deepen · ✦ Continue from
 * here · ⋯". Shown only when there is a panel to open, so that no button does nothing. Under it a
 * status line, read aloud when it changes, says how many proposals are on the canvas.
 */
export function StoryboardAssistBar({
  sceneName,
  disabled,
  onDeepen,
  onContinue,
  moreItems,
  model,
}: {
  sceneName: string;
  disabled: boolean;
  onDeepen: () => void;
  onContinue: () => void;
  moreItems: readonly MenuItem[];
  model: PreviewModel | null;
}) {
  const t = useTranslate();
  const name = sceneName.trim() || t("saUntitled");
  const status = model?.shown
    ? t(model.shown === 1 ? "saStatusOne" : "saStatusMany", {
        shown: model.shown,
        chosen: model.chosen,
      })
    : "";
  return (
    <div className="storyboard-assist" role="group" aria-label={t("saGroupLabel", { name })}>
      <span className="storyboard-assist__name">{name}:</span>
      <Button size="compact" disabled={disabled} onClick={onDeepen}>
        ✦ {t("saDeepen")}
      </Button>
      <Button size="compact" disabled={disabled} onClick={onContinue}>
        ✦ {t("saContinue")}
      </Button>
      <MenuButton label={t("saMore")} items={moreItems} size="compact" />
      <p className="storyboard-assist__status" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
