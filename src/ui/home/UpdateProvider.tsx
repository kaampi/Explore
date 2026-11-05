import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export const UPDATE_INTERVAL = 30 * 60 * 1000;
export const UPDATE_DOWNLOADS = 'https://github.com/kaampi/Explore/actions/workflows/desktop-build.yml';
const revision = import.meta.env.VITE_EXPLORE_REVISION as string | undefined;
export const UPDATE_CACHE_KEY = `explore-update-check:${revision ?? 'unknown'}`;
type Snapshot = { available: boolean; checking: boolean; message: string; lastChecked: number };
type Updates = Snapshot & { check: (manual?: boolean) => Promise<void> };
const Context = createContext<Updates | null>(null);
function cached(): Snapshot {
  try {
    const value = JSON.parse(localStorage.getItem(UPDATE_CACHE_KEY) ?? 'null') as { available?: unknown; lastChecked?: unknown } | null;
    if (value && typeof value.available === 'boolean' && typeof value.lastChecked === 'number' && Number.isFinite(value.lastChecked) && value.lastChecked > 0 && value.lastChecked <= Date.now()) {
      return { available: value.available, checking: false, message: '', lastChecked: value.lastChecked };
    }
  } catch { /* Storage can be unavailable; checking still works. */ }
  return { available: false, checking: false, message: '', lastChecked: 0 };
}
export function UpdateProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(cached), state = useRef(snapshot); state.current = snapshot;
  const mounted = useRef(false), controller = useRef<AbortController | null>(null), lastAttempt = useRef(0);
  const check = useCallback(async (manual = false) => {
    if (controller.current) return;
    if (!manual && (navigator.onLine === false || (state.current.lastChecked > 0 && Date.now() - state.current.lastChecked < UPDATE_INTERVAL) || Date.now() - lastAttempt.current < 60_000)) return;
    const current = new AbortController(); controller.current = current; lastAttempt.current = Date.now();
    const timeout = window.setTimeout(() => current.abort(), 15_000);
    if (manual) setSnapshot(value => ({ ...value, checking: true, message: 'Checking GitHub…' }));
    try {
      if (!revision) throw new Error('This build has no version identifier. See the latest builds on GitHub.');
      const response = await fetch(`https://api.github.com/repos/kaampi/Explore/compare/${encodeURIComponent(revision)}...main`, { headers: { Accept: 'application/vnd.github+json' }, signal: current.signal });
      if (response.status === 404) throw new Error('This development version cannot be compared with GitHub. See the latest builds there.');
      if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub is temporarily limiting checks. Try again later.' : 'Could not check for updates. Try again later.');
      const result = await response.json() as { ahead_by?: unknown };
      if (typeof result.ahead_by !== 'number' || !Number.isSafeInteger(result.ahead_by) || result.ahead_by < 0) throw new Error('GitHub returned an unexpected result.');
      if (!mounted.current || current.signal.aborted) return;
      const available = result.ahead_by > 0, lastChecked = Date.now();
      const next = { available, checking: false, lastChecked, message: manual ? available ? 'A newer Explore version is available.' : 'You have the latest Explore code on main.' : '' };
      state.current = next; setSnapshot(next);
      try { localStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify({ available, lastChecked })); } catch { /* Cache is optional. */ }
    } catch (error) {
      // Background failures stay quiet, and never clear an update already found.
      if (mounted.current && controller.current === current && manual) setSnapshot(value => ({ ...value, checking: false, message: current.signal.aborted ? 'The update check timed out. Try again later.' : error instanceof Error ? error.message : 'Could not check for updates.' }));
    } finally {
      window.clearTimeout(timeout);
      if (controller.current === current) controller.current = null;
    }
  }, []);
  useEffect(() => {
    mounted.current = true; void check();
    const timer = window.setInterval(() => void check(), UPDATE_INTERVAL);
    const resume = () => { if (document.visibilityState !== 'hidden') void check(); };
    window.addEventListener('focus', resume); window.addEventListener('online', resume); document.addEventListener('visibilitychange', resume);
    return () => { mounted.current = false; window.clearInterval(timer); window.removeEventListener('focus', resume); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume); controller.current?.abort(); controller.current = null; lastAttempt.current = 0; };
  }, [check]);
  return <Context.Provider value={{ ...snapshot, check }}>{children}</Context.Provider>;
}
export const useUpdates = () => useContext(Context);
