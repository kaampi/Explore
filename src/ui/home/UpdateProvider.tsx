import { isTauri } from "@tauri-apps/api/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export const UPDATE_INTERVAL = 30 * 60 * 1000;
/** The installer, at an address that never changes and needs no sign-in. */
export const INSTALLER_URL =
  "https://github.com/kaampi/Explore/releases/download/alpha-latest/kaampi-Explore-Setup.exe";
export const RUNNING_DOCS_URL = "https://github.com/kaampi/Explore/blob/main/docs/running.md";
const RELEASE_API = "https://api.github.com/repos/kaampi/Explore/releases/tags/alpha-latest";
const COMPARE_API = "https://api.github.com/repos/kaampi/Explore/compare";
const revision = import.meta.env.VITE_EXPLORE_REVISION as string | undefined;
export const UPDATE_CACHE_KEY = `explore-update-check:${revision ?? "unknown"}`;
/**
 * `message` is the key of a text in LanguageProvider, or empty. The view translates it.
 */
type Snapshot = { available: boolean; checking: boolean; message: string; lastChecked: number };
type Updates = Snapshot & {
  check: (manual?: boolean) => Promise<void>;
  /** The desktop app checks for a new installer; the browser compares its code with main. */
  desktop: boolean;
};
/** A problem with a text of its own. */
class UpdateError extends Error {
  constructor(readonly key: string) {
    super(key);
  }
}
const statusError = (status: number) =>
  new UpdateError(status === 403 || status === 429 ? "updRateLimit" : "updCouldNot");
const REVISION = /^Revision:\s*([0-9a-f]{40})\s*$/im;
const Context = createContext<Updates | null>(null);
function cached(): Snapshot {
  try {
    const value = JSON.parse(localStorage.getItem(UPDATE_CACHE_KEY) ?? "null") as {
      available?: unknown;
      lastChecked?: unknown;
    } | null;
    if (
      value &&
      typeof value.available === "boolean" &&
      typeof value.lastChecked === "number" &&
      Number.isFinite(value.lastChecked) &&
      value.lastChecked > 0 &&
      value.lastChecked <= Date.now()
    ) {
      return {
        available: value.available,
        checking: false,
        message: "",
        lastChecked: value.lastChecked,
      };
    }
  } catch {
    /* Storage can be unavailable; checking still works. */
  }
  return { available: false, checking: false, message: "", lastChecked: 0 };
}
export function UpdateProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(cached),
    state = useRef(snapshot);
  state.current = snapshot;
  const mounted = useRef(false),
    controller = useRef<AbortController | null>(null),
    lastAttempt = useRef(0);
  const check = useCallback(async (manual = false) => {
    if (controller.current) return;
    if (
      !manual &&
      (navigator.onLine === false ||
        (state.current.lastChecked > 0 &&
          Date.now() - state.current.lastChecked < UPDATE_INTERVAL) ||
        Date.now() - lastAttempt.current < 60_000)
    )
      return;
    const current = new AbortController();
    controller.current = current;
    lastAttempt.current = Date.now();
    const timeout = window.setTimeout(() => current.abort(), 15_000);
    if (manual)
      setSnapshot((value) => ({ ...value, checking: true, message: "updCheckingGitHub" }));
    const get = (url: string) =>
      fetch(url, { headers: { Accept: "application/vnd.github+json" }, signal: current.signal });
    /** How many commits `to` is ahead of `from`, by GitHub's comparison. */
    const commitsAhead = async (from: string, to: string) => {
      const response = await get(`${COMPARE_API}/${encodeURIComponent(from)}...${to}`);
      if (response.status === 404) throw new UpdateError("updDevelopment");
      if (!response.ok) throw statusError(response.status);
      const result = (await response.json()) as { ahead_by?: unknown };
      if (
        typeof result.ahead_by !== "number" ||
        !Number.isSafeInteger(result.ahead_by) ||
        result.ahead_by < 0
      )
        throw new UpdateError("updUnexpected");
      return result.ahead_by;
    };
    try {
      if (!revision) throw new UpdateError("updNoVersion");
      const desktop = isTauri();
      let available = false;
      let none = false;
      if (desktop) {
        // An update is a new installer: the pre-release alpha-latest names the commit it was built from.
        const response = await get(RELEASE_API);
        if (response.status === 404) none = true;
        else {
          if (!response.ok) throw statusError(response.status);
          const release = (await response.json()) as { body?: unknown };
          const built =
            typeof release.body === "string" ? REVISION.exec(release.body)?.[1] : undefined;
          if (!built) throw new UpdateError("updNoRevision");
          if (built.toLowerCase() !== revision.toLowerCase())
            available = (await commitsAhead(revision, built.toLowerCase())) > 0;
        }
      } else available = (await commitsAhead(revision, "main")) > 0;
      if (!mounted.current || current.signal.aborted) return;
      const lastChecked = Date.now();
      const next = {
        available,
        checking: false,
        lastChecked,
        message: manual
          ? none
            ? "updNoInstaller"
            : available
              ? "updNewer"
              : desktop
                ? "updLatestApp"
                : "updLatestMain"
          : "",
      };
      state.current = next;
      setSnapshot(next);
      try {
        localStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify({ available, lastChecked }));
      } catch {
        /* Cache is optional. */
      }
    } catch (error) {
      // Background failures stay quiet, and never clear an update already found.
      if (mounted.current && controller.current === current && manual)
        setSnapshot((value) => ({
          ...value,
          checking: false,
          message: current.signal.aborted
            ? "updTimeout"
            : error instanceof UpdateError
              ? error.key
              : "updCouldNot",
        }));
    } finally {
      window.clearTimeout(timeout);
      if (controller.current === current) controller.current = null;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void check();
    const timer = window.setInterval(() => void check(), UPDATE_INTERVAL);
    const resume = () => {
      if (document.visibilityState !== "hidden") void check();
    };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
      controller.current?.abort();
      controller.current = null;
      lastAttempt.current = 0;
    };
  }, [check]);
  return (
    <Context.Provider value={{ ...snapshot, check, desktop: isTauri() }}>
      {children}
    </Context.Provider>
  );
}
export const useUpdates = () => useContext(Context);
