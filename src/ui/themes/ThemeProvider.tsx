import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  defaultThemeLibrary,
  rgb,
  type PlayTheme,
  type ThemeLibrary,
} from "./theme";
import { activatePlayTheme, applyPlayTheme } from "./conversationTheme";
import { loadThemeLibrary, saveThemeLibrary } from "./themeStorage";

interface Appearance {
  library: ThemeLibrary;
  conversationId: string | null;
  activateConversation: (id: string | null) => void;
  ready: boolean;
  error: string | null;
  update: (patch: Partial<PlayTheme>) => void;
  select: (theme: PlayTheme) => void;
  save: (name: string) => void;
  remove: (id: string) => void;
  setShell: (shell: ThemeLibrary["shell"]) => void;
}
const Context = createContext<Appearance | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [library, setLibrary] = useState(defaultThemeLibrary);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queue = useRef(Promise.resolve());
  const scope = useRef<string | null | undefined>(undefined);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const activateConversation = useCallback((id: string | null) => {
    if (scope.current === id) return;
    scope.current = id;
    setConversationId(id);
    setLibrary((library) => activatePlayTheme(library, id));
  }, []);
  useEffect(() => {
    let cancelled = false;
    loadThemeLibrary()
      .then((saved) => {
        if (!cancelled && saved) setLibrary(saved);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "Appearance storage is unavailable.",
          );
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      queue.current = queue.current
        .then(() => saveThemeLibrary(library))
        .then(() => setError(null))
        .catch(() =>
          setError(
            "Appearance is available for this visit, but could not be saved. Check browser storage.",
          ),
        );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [library, ready]);
  const value: Appearance = {
    library,
    conversationId,
    activateConversation,
    ready,
    error,
    update: (patch) =>
      setLibrary((state) =>
        applyPlayTheme(
          state,
          { ...state.active, ...patch },
          scope.current ?? null,
        ),
      ),
    select: (theme) =>
      setLibrary((state) =>
        applyPlayTheme(state, theme, scope.current ?? null),
      ),
    save: (name) =>
      setLibrary((state) => {
        if (!name.trim() || state.saved.length >= 50) return state;
        const theme = {
          ...state.active,
          id: crypto.randomUUID(),
          name: name.trim().slice(0, 60),
        };
        return applyPlayTheme(
          { ...state, saved: [...state.saved, theme] },
          theme,
          scope.current ?? null,
        );
      }),
    remove: (id) =>
      setLibrary((state) => ({
        ...state,
        saved: state.saved.filter((item) => item.id !== id),
      })),
    setShell: (shell) => setLibrary((state) => ({ ...state, shell })),
  };
  return (
    <Context.Provider value={value}>
      <div className="sandbox-root" data-shell={library.shell}>
        {children}
      </div>
    </Context.Provider>
  );
}
export function useAppearance(): Appearance {
  const context = useContext(Context);
  if (!context) throw new Error("Appearance requires ThemeProvider.");
  return context;
}
export function playThemeStyle(theme: PlayTheme): CSSProperties {
  return {
    "--play-background": theme.background,
    "--play-panel-rgb": rgb(theme.panel),
    "--play-text": theme.text,
    "--play-accent": theme.accent,
    "--play-opacity": theme.panelOpacity,
    "--play-dim": theme.backdropDim,
    "--play-size": `${theme.textSize}px`,
    "--play-width": `${theme.textWidth}px`,
    "--play-font":
      theme.font === "serif" ? "Georgia, serif" : "system-ui, sans-serif",
  } as CSSProperties;
}
