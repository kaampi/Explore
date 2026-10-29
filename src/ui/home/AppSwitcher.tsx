import { useEffect, useState } from "react";
import { Modal } from "../components/Modal";
import { isTauri } from "@tauri-apps/api/core";
import { openCompanionApp } from "../../integrations/companionWindows";
import {
  checkCompanionApp,
  DEFAULT_APP_ADDRESSES,
  safeAppAddress,
  type AppStatus,
  type CompanionAppId,
} from "../../integrations/localApps";

const APPS = {
  storybook: {
    name: "kaampi Write",
    symbol: "▤",
    title: "Give your world a story.",
    description:
      "Build your world, develop your characters, and write the stories that make it real. kaampi Write is the home of your established story and your next idea.",
    repository: "https://github.com/kaampi/Write",
  },
  comicbook: {
    name: "kaampi Comic",
    symbol: "▦",
    title: "See your story come to life.",
    description:
      "Turn moments, characters, and scenes into comics. Explore a visual way to tell the stories from your creative universe.",
    repository: "https://github.com/kaampi/Comic",
  },
};
function AppLogo({ app, name }: { app: "write" | "explore" | "comic"; name: string }) {
  return <><img className="sb-switch-logo sb-switch-logo--light" src={`/brand/kaampi-${app}.svg`} alt={name} /><img className="sb-switch-logo sb-switch-logo--dark" src={`/brand/kaampi-${app}-dark.svg`} alt={name} /></>;
}
function readAddress(key: CompanionAppId): string {
  try {
    return (
      safeAppAddress(localStorage.getItem(`sandboxai-app-${key}`) ?? "") ||
      DEFAULT_APP_ADDRESSES[key]
    );
  } catch {
    return DEFAULT_APP_ADDRESSES[key];
  }
}
export const safeAddress = safeAppAddress;
const STATUS_COPY: Record<AppStatus["state"], string> = {
  available: "The app is running and ready to open.",
  unreachable:
    "The app cannot be reached. It may be installed but not running. Start it and try again.",
  "wrong-app":
    "A different service answered at this address. Check the app's address and try again.",
  unknown:
    "Automatic checks are available when kaampi Explore runs locally. You can still open the address yourself.",
};

export function AppSwitcher({ onHome }: { onHome: () => void }) {
  const desktop = isTauri();
  const [opening, setOpening] = useState<CompanionAppId | null>(null);
  const [addresses, setAddresses] = useState(() => ({
    storybook: readAddress("storybook"),
    comicbook: readAddress("comicbook"),
  }));
  const [statuses, setStatuses] = useState<
    Partial<Record<CompanionAppId, AppStatus>>
  >({});
  const [selected, setSelected] = useState<CompanionAppId | null>(null);
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (desktop) return;
    const controller = new AbortController();
    let cancelled = false;
    async function refresh() {
      if (document.visibilityState === "hidden") return;
      const results = await Promise.all(
        (Object.keys(APPS) as CompanionAppId[]).map((appId) =>
          checkCompanionApp(appId, addresses[appId], controller.signal),
        ),
      );
      if (!cancelled)
        setStatuses(
          Object.fromEntries(results.map((status) => [status.appId, status])),
        );
    }
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 30000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [addresses, desktop]);
  function open(key: CompanionAppId) {
    setSelected(key);
    setAddress(addresses[key]);
    setError(null);
  }
  async function checkSelected() {
    if (!selected) return;
    setError(null);
    setChecking(true);
    const checkedAddress = address;
    try {
      const valid = safeAppAddress(address) || DEFAULT_APP_ADDRESSES[selected];
      const status = await checkCompanionApp(selected, valid);
      setAddress((current) => current === checkedAddress ? valid : current);
      setStatuses((previous) => ({ ...previous, [selected]: status }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check the app address.");
    } finally {
      setChecking(false);
    }
  }
  async function launch(key: CompanionAppId, appAddress: string) {
    if (opening) return;
    setOpening(key); setError(null);
    try { await openCompanionApp(key, appAddress); }
    catch (reason) { open(key); setError(typeof reason === "string" ? reason : reason instanceof Error ? reason.message : "Could not open the app."); }
    finally { setOpening(null); }
  }
  function savedStatus(key: CompanionAppId) {
    const status = statuses[key];
    return status?.address === addresses[key] ? status : undefined;
  }
  function appLink(key: CompanionAppId) {
    const app = APPS[key],
      status = savedStatus(key);
    if (desktop) return (
      <span className="sb-companion-link">
        <button type="button" style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"12px 10px",minHeight:44}} disabled={opening !== null} onClick={()=>void launch(key, addresses[key])} title={opening===key?`Opening ${app.name}…`:`Open installed ${app.name}`}>
          <AppLogo app={key === "storybook" ? "write" : "comic"} name={app.name} />
        </button>
        <button type="button" className="sb-app-config" aria-label={`${app.name} information`} onClick={()=>open(key)}>⌄</button>
      </span>
    );
    return status?.state === "available" ? (
      <span className="sb-companion-link">
        <a
          href={status.address}
          target={`kaampi-${key}`}
          rel="noreferrer"
          onClick={event => { event.preventDefault(); void launch(key, status.address); }}
          title={`Open ${app.name}`}
        >
          <AppLogo app={key === "storybook" ? "write" : "comic"} name={app.name} />
          <i className="sb-app-online" aria-label="Available" />
        </a>
        <button
          type="button"
          className="sb-app-config"
          aria-label={`${app.name} information and address`}
          onClick={() => open(key)}
        >
          ⌄
        </button>
      </span>
    ) : (
      <button
        type="button"
        onClick={() => open(key)}
        title={`About ${app.name}`}
      >
        <AppLogo app={key === "storybook" ? "write" : "comic"} name={app.name} />
      </button>
    );
  }
  let validAddress = "";
  try {
    validAddress = selected
      ? safeAppAddress(address) || DEFAULT_APP_ADDRESSES[selected]
      : "";
  } catch {
    /* Validation appears on save/check. */
  }
  const selectedStatus =
    selected && statuses[selected]?.address === validAddress
      ? statuses[selected]
      : undefined;
  return (
    <>
      <nav className="sb-apps" aria-label="Your creative apps">
        {appLink("storybook")}
        <button
          type="button"
          className="is-active"
          aria-current="page"
          onClick={onHome}
        >
          <AppLogo app="explore" name="kaampi Explore" />
        </button>
        {appLink("comicbook")}
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
          {desktop ? <>
            <p className="sb-muted">Open the installed desktop app, or switch to its existing window.</p>
            {error && <p className="sb-error" role="alert">{error}</p>}
            <button type="button" className="sb-button" disabled={opening !== null} onClick={()=>void launch(selected, addresses[selected])}>{opening ? "Opening…" : "Open desktop app"}</button>
          </> : <>
          <hr className="sb-rule" />
          <label className="sb-field">
            App address
            <input
              type="url"
              placeholder={DEFAULT_APP_ADDRESSES[selected]}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </label>
          <p className="sb-muted" role="status">
            {checking
              ? "Checking the app…"
              : selectedStatus
                ? STATUS_COPY[selectedStatus.state]
                : "Use the address shown when you start the app, then check its status."}
            {selectedStatus?.version
              ? ` Version ${selectedStatus.version}.`
              : ""}
          </p>
          {error && (
            <p className="sb-error" role="alert">
              {error}
            </p>
          )}
          <div className="sb-dialog__actions sb-app-actions">
            <button
              type="button"
              className="sb-link"
              disabled={checking}
              onClick={() => {
                void checkSelected();
              }}
            >
              Try again
            </button>
            <button
              type="button"
              className="sb-link"
              onClick={() => {
                try {
                  const valid =
                    safeAppAddress(address) || DEFAULT_APP_ADDRESSES[selected];
                  localStorage.setItem(`sandboxai-app-${selected}`, valid);
                  setAddresses((previous) => ({
                    ...previous,
                    [selected]: valid,
                  }));
                  setAddress(valid);
                  setError(null);
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
            {validAddress && (
              <a
                className="sb-button"
                href={validAddress}
                target={`kaampi-${selected}`}
                rel="noreferrer"
                onClick={event => { event.preventDefault(); void launch(selected, validAddress); }}
              >
                Open app ↗
              </a>
            )}
          </div>
          </>}
        </Modal>
      )}
    </>
  );
}
