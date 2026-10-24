import { useState } from "react";
import { Modal } from "../components/Modal";

const APPS = {
  storybook: {
    name: "StorybookAI",
    symbol: "▤",
    title: "Give your world a story.",
    description:
      "Build your world, develop your characters, and write the stories that make it real. StorybookAI is the home of your established story and your next idea.",
    repository: "https://github.com/ocedo-apps/StoryBook-AI",
  },
  comicbook: {
    name: "ComicbookAI",
    symbol: "▦",
    title: "See your story come to life.",
    description:
      "Turn moments, characters, and scenes into comics. Explore a visual way to tell the stories from your creative universe.",
    repository: "https://github.com/ocedo-apps/ComicBook-AI",
  },
};
type AppKey = keyof typeof APPS;
function readAddress(key: AppKey): string {
  try {
    return safeAddress(localStorage.getItem(`sandboxai-app-${key}`) ?? "");
  } catch {
    return "";
  }
}
export function safeAddress(value: string): string {
  if (!value.trim()) return "";
  const url = new URL(value.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use an HTTP or HTTPS app address without credentials.");
  return url.href;
}
export function AppSwitcher({ onHome }: { onHome: () => void }) {
  const [selected, setSelected] = useState<AppKey | null>(null);
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  function open(key: AppKey) {
    setSelected(key);
    setAddress(readAddress(key));
    setError(null);
  }
  return (
    <>
      <nav className="sb-apps" aria-label="Your creative apps">
        <button type="button" onClick={() => open("storybook")}>
          <span aria-hidden="true">▤</span> StorybookAI
        </button>
        <button
          type="button"
          className="is-active"
          aria-current="page"
          onClick={onHome}
        >
          <span aria-hidden="true">✧</span> SandboxAI
        </button>
        <button type="button" onClick={() => open("comicbook")}>
          <span aria-hidden="true">▦</span> ComicbookAI
        </button>
      </nav>
      {selected && (
        <Modal title={APPS[selected].name} onClose={() => setSelected(null)}>
          <span className="sb-app-symbol" aria-hidden="true">
            {APPS[selected].symbol}
          </span>
          <h3 className="sb-app-title">{APPS[selected].title}</h3>
          <p className="sb-muted">{APPS[selected].description}</p>
          <a
            className="sb-button"
            href={APPS[selected].repository}
            target="_blank"
            rel="noreferrer"
          >
            Get the app & installation guide ↗
          </a>
          <hr className="sb-rule" />
          <label className="sb-field">
            Already installed? Add its address.
            <input
              type="url"
              placeholder="http://localhost:…"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </label>
          <p className="sb-muted">
            Use the address shown when you start the app. Availability is not
            checked automatically in this version.
          </p>
          {error && (
            <p className="sb-error" role="alert">
              {error}
            </p>
          )}
          <div className="sb-dialog__actions">
            <button
              type="button"
              className="sb-link"
              onClick={() => {
                try {
                  const valid = safeAddress(address);
                  localStorage.setItem(`sandboxai-app-${selected}`, valid);
                  setAddress(valid);
                  setError(null);
                  setSelected(null);
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Could not save the address.",
                  );
                }
              }}
            >
              Save address
            </button>
            <button
              type="button"
              className="sb-button"
              disabled={!address.trim()}
              onClick={() => {
                try {
                  const valid = safeAddress(address);
                  if (valid)
                    window.open(valid, "_blank", "noopener,noreferrer");
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Check the app address.",
                  );
                }
              }}
            >
              Open app ↗
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
