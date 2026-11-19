import { PRESET_THEMES, type PlayTheme } from "./theme";
import { useTranslate } from "../i18n/LanguageProvider";

/**
 * A choice of the look an author gives an adventure or a world: one of the themes that come with
 * the app, or none (the player's own appearance). A theme read from a file that is not one of
 * them is kept and shown under its own name.
 */
export function AuthorThemePicker({
  value,
  onChange,
  hint,
  showLabel = true,
}: {
  value: PlayTheme | undefined;
  onChange: (theme: PlayTheme | undefined) => void;
  /** What this choice means here: for an adventure, or for a world. */
  hint: string;
  /** False where a heading above already says what this is: the label is then only for a screen reader. */
  showLabel?: boolean;
}) {
  const t = useTranslate();
  const isPreset = !!value && PRESET_THEMES.some((preset) => preset.id === value.id);
  const selected = value ? value.id : "";
  return (
    <div className="author-theme">
      <label className="setup-field">
        <span className={showLabel ? undefined : "visually-hidden"}>{t("atLook")}</span>
        <select
          aria-label={t("atLook")}
          value={selected}
          onChange={(event) => {
            const preset = PRESET_THEMES.find((item) => item.id === event.target.value);
            // The theme kept from a file stays chosen if it is picked again.
            onChange(preset ? { ...preset } : event.target.value === value?.id ? value : undefined);
          }}
        >
          <option value="">{t("atNone")}</option>
          {value && !isPreset && <option value={value.id}>{value.name}</option>}
          {PRESET_THEMES.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>
      {value && (
        <span className="author-theme__swatches" aria-hidden="true">
          {[value.background, value.panel, value.accent].map((color, index) => (
            <span key={index} className="author-theme__swatch" style={{ background: color }} />
          ))}
        </span>
      )}
      <p className="author-theme__hint">{hint}</p>
    </div>
  );
}
