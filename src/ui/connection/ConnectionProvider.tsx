import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { discoverOllama, initialModel, type Discovery } from "./connection";

const PREFERENCE_KEY = "sandboxai-preferred-model";
interface Connection {
  discovery: Discovery;
  preferredModel: string;
  chooseModel: (model: string) => void;
  refresh: () => Promise<Discovery>;
  preferenceError: string | null;
}
const Context = createContext<Connection | null>(null);
function readPreferred(): string {
  try {
    return localStorage.getItem(PREFERENCE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}
export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [discovery, setDiscovery] = useState<Discovery>({
    state: "checking",
    models: [],
  });
  const [preferredModel, setPreferredModel] = useState(readPreferred);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const pending = useRef<Promise<Discovery> | null>(null);
  const mounted = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const chooseModel = useCallback((model: string) => {
    const trimmed = model.trim();
    setPreferredModel(trimmed);
    try {
      localStorage.setItem(PREFERENCE_KEY, trimmed);
      setPreferenceError(null);
    } catch {
      setPreferenceError(
        "Your model choice works for this visit, but could not be saved.",
      );
    }
  }, []);
  const refresh = useCallback((): Promise<Discovery> => {
    if (pending.current) return pending.current;
    const request = new AbortController();
    controller.current = request;
    setDiscovery((previous) => ({ ...previous, state: "checking" }));
    const promise = discoverOllama({ signal: request.signal })
      .then((result) => {
        if (mounted.current && !request.signal.aborted) setDiscovery(result);
        return result;
      })
      .finally(() => {
        if (pending.current === promise) pending.current = null;
      });
    pending.current = promise;
    return promise;
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const focus = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      mounted.current = false;
      controller.current?.abort();
      pending.current = null;
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  useEffect(() => {
    if (preferredModel || discovery.state !== "available") return;
    const model = initialModel(preferredModel, discovery.models);
    if (model) chooseModel(model);
  }, [preferredModel, discovery, chooseModel]);
  return (
    <Context.Provider
      value={{
        discovery,
        preferredModel,
        chooseModel,
        refresh,
        preferenceError,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useConnection(): Connection {
  const connection = useContext(Context);
  if (!connection)
    throw new Error("AI connection requires ConnectionProvider.");
  return connection;
}
