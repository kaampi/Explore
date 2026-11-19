import { useEffect, useState } from "react";

/**
 * How much room the play view has: "wide" (1440 px and up) shows all three columns; "medium"
 * (1024–1439) folds the left column to its strip; "narrow" (under 1024) is one column, with the
 * scene and the journal in panels.
 */
export type PlayLayout = "wide" | "medium" | "narrow";

const NARROW = "(max-width: 1023px)";
const MEDIUM = "(max-width: 1439px)";

function read(): PlayLayout {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "wide";
  if (window.matchMedia(NARROW).matches) return "narrow";
  if (window.matchMedia(MEDIUM).matches) return "medium";
  return "wide";
}

/** The layout the window calls for now, kept up to date as the window changes size. */
export function usePlayLayout(): PlayLayout {
  const [layout, setLayout] = useState<PlayLayout>(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const lists = [window.matchMedia(NARROW), window.matchMedia(MEDIUM)];
    const update = () => setLayout(read());
    update();
    for (const list of lists) list.addEventListener("change", update);
    return () => {
      for (const list of lists) list.removeEventListener("change", update);
    };
  }, []);
  return layout;
}
