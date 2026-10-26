import { useRef, useState } from "react";
import { Modal } from "../components/Modal";
import { PRESET_THEMES, contrastRatio, type PlayTheme } from "./theme";
import { playThemeStyle, useAppearance } from "./ThemeProvider";
import { backgroundFromFile } from "./themeStorage";

export function AppearanceDialog({ onClose }: { onClose: () => void }) {
  return <Modal title="Make yourself at home" onClose={onClose} wide><AppearanceSettingsContent onClose={onClose} /></Modal>;
}

export function AppearanceSettingsContent({ onClose }: { onClose: () => void }) {
  const {
    library,
    conversationId,
    ready,
    error,
    update,
    select,
    save,
    remove,
  } = useAppearance();
  const [name, setName] = useState("");
  const [imageError, setImageError] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [notice, setNotice] = useState("");
  const upload = useRef(0);
  const theme = library.active;
  function range(
    label: string,
    key: "panelOpacity" | "backdropDim" | "textSize" | "textWidth",
    min: number,
    max: number,
    step: number,
    value: string,
  ) {
    return (
      <label className="sb-field">
        {label}
        <span>{value}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={theme[key]}
          onChange={(event) => update({ [key]: Number(event.target.value) })}
        />
      </label>
    );
  }
  return (
    <div className="sb-settings-appearance-content">
      <p className="sb-muted">
        {conversationId
          ? "Changes apply to this conversation. Other conversations keep their own appearance."
          : "Choose your default play appearance. Each conversation keeps its own theme."}
      </p>
      <fieldset disabled={!ready} className="sb-appearance-fieldset">
        <h3 className="sb-section-title">Your play space</h3>
        <div className="sb-preset-grid">
          {PRESET_THEMES.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className="sb-preset"
              aria-pressed={theme.id === preset.id}
              onClick={() => {
                select(preset);
                setNotice("");
              }}
            >
              <span
                className="sb-preset__sample"
                style={{ background: preset.background, color: preset.text }}
              >
                <span style={{ background: preset.panel }}>
                  Aa<span style={{ color: preset.accent }}> ✧</span>
                </span>
              </span>
              {preset.name}
            </button>
          ))}
        </div>
        <div className="sb-appearance-grid">
          <div>
            <div className="sb-color-row">
              {(
                [
                  ["Accent", "accent"],
                  ["Panel", "panel"],
                  ["Text", "text"],
                  ["Background", "background"],
                ] as const
              ).map(([label, key]) => (
                <label className="sb-color" key={key}>
                  <input
                    type="color"
                    value={theme[key]}
                    onChange={(event) => update({ [key]: event.target.value })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <label className="sb-field">
              Background
              <select
                value={theme.backgroundMode}
                onChange={(event) =>
                  update({
                    backgroundMode: event.target
                      .value as PlayTheme["backgroundMode"],
                  })
                }
              >
                <option value="scene">Follow the scene</option>
                <option value="custom">Keep my background</option>
                <option value="none">Plain background</option>
              </select>
            </label>
            {theme.backgroundMode === "custom" && (
              <div className="sb-upload">
                <label className="sb-field">
                  Upload a background
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={loadingImage}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      const request = ++upload.current;
                      setLoadingImage(true);
                      setImageError(null);
                      try {
                        const data = await backgroundFromFile(file);
                        if (request === upload.current)
                          update({ backgroundDataUrl: data });
                      } catch (err) {
                        if (request === upload.current)
                          setImageError(
                            err instanceof Error
                              ? err.message
                              : "Could not read this image.",
                          );
                      } finally {
                        if (request === upload.current) setLoadingImage(false);
                      }
                    }}
                  />
                </label>
                <p className="sb-muted">
                  PNG, JPEG or WebP, up to 10 MB. Images stay in this browser.
                </p>
                {theme.backgroundDataUrl && (
                  <button
                    type="button"
                    className="sb-link"
                    onClick={() => update({ backgroundDataUrl: undefined })}
                  >
                    Remove background
                  </button>
                )}
                {loadingImage && <p role="status">Preparing image…</p>}
                {!theme.backgroundDataUrl && !loadingImage && (
                  <p className="sb-muted">
                    Until you add an image, the background uses your chosen
                    color.
                  </p>
                )}
              </div>
            )}
            {range(
              "Panel opacity",
              "panelOpacity",
              0.6,
              1,
              0.01,
              `${Math.round(theme.panelOpacity * 100)}%`,
            )}
            {range(
              "Background dimming",
              "backdropDim",
              0,
              0.9,
              0.01,
              `${Math.round(theme.backdropDim * 100)}%`,
            )}
            <label className="sb-field">
              Reading font
              <select
                value={theme.font}
                onChange={(event) =>
                  update({ font: event.target.value as PlayTheme["font"] })
                }
              >
                <option value="serif">Book · serif</option>
                <option value="sans">Clean · sans serif</option>
              </select>
            </label>
            {range("Text size", "textSize", 15, 26, 1, `${theme.textSize}px`)}
            {range(
              "Reading width",
              "textWidth",
              480,
              1000,
              20,
              `${theme.textWidth}px`,
            )}
          </div>
          <div className="sb-theme-preview" style={playThemeStyle(theme)}>
            {theme.backgroundMode === "custom" && theme.backgroundDataUrl && (
              <img
                src={theme.backgroundDataUrl}
                className="sb-theme-preview__image"
                alt=""
              />
            )}
            {theme.backgroundMode === "scene" && (
              <div className="sb-theme-preview__landscape" />
            )}
            <div className="sb-theme-preview__shade" />
            <div className="sb-theme-preview__message">
              <small>ELARA · PREVIEW</small>
              <p>
                “There is always another path,” she says, looking beyond the
                trees. “Shall we find it?”
              </p>
              <span>Your story continues here.</span>
            </div>
          </div>
        </div>
        {contrastRatio(theme.panel, theme.text) < 4.5 && (
          <p className="sb-notice" role="status">
            These text and panel colors have low contrast. Try darker text or a
            lighter panel. Background images and transparency can also affect
            readability.
          </p>
        )}
        <div className="sb-save-theme">
          <label className="sb-field">
            Save your own theme
            <input
              value={name}
              maxLength={60}
              placeholder="Give this atmosphere a name"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="sb-button"
            disabled={
              !name.trim() || library.saved.length >= 50 || loadingImage
            }
            onClick={() => {
              save(name);
              setName("");
              setNotice("Theme added to your saved themes.");
            }}
          >
            Save theme
          </button>
        </div>
        {library.saved.length >= 50 && (
          <p className="sb-muted">
            You have 50 saved themes. Remove one to save another.
          </p>
        )}
        {library.saved.length > 0 && (
          <div className="sb-saved-themes">
            <h3 className="sb-section-title">Saved themes</h3>
            {library.saved.map((saved) => (
              <div key={saved.id}>
                <button
                  type="button"
                  className="sb-link"
                  onClick={() => select(saved)}
                >
                  {saved.name}
                </button>
                <button
                  type="button"
                  className="sb-icon"
                  aria-label={`Delete ${saved.name}`}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete “${saved.name}” from your saved themes?`,
                      )
                    )
                      remove(saved.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="sb-dialog__actions">
          <button
            type="button"
            className="sb-link"
            onClick={() => select(PRESET_THEMES[0]!)}
          >
            Reset play appearance
          </button>
          <button type="button" className="sb-button" onClick={onClose}>
            Done
          </button>
        </div>
      </fieldset>
      <p
        role="status"
        className={error || imageError ? "sb-error" : "sb-muted"}
      >
        {imageError ||
          error ||
          notice ||
          "Appearance changes apply immediately and are saved locally. Theme sharing is coming in a later step."}
      </p>
    </div>
  );
}
