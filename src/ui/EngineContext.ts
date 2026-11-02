import { createContext } from "react";
import type { EngineContextValue } from "./EngineStore";

// Keep context identity stable when Vite refreshes the gameplay implementation.
export const EngineContext = createContext<EngineContextValue | null>(null);
