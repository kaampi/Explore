import { useEffect, useState } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const MORE_CONTRAST = "(prefers-contrast: more)";

/** What the system asks for that makes the frames plain: less motion, or more contrast. */
export type SystemAsk = { reducedMotion: boolean; moreContrast: boolean };

function read(): SystemAsk {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return { reducedMotion: false, moreContrast: false };
  return {
    reducedMotion: window.matchMedia(REDUCED_MOTION).matches,
    moreContrast: window.matchMedia(MORE_CONTRAST).matches,
  };
}

/** The system's own asks, kept up to date as the player changes them in the system's settings. */
export function useSystemAsk(): SystemAsk {
  const [ask, setAsk] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const lists = [window.matchMedia(REDUCED_MOTION), window.matchMedia(MORE_CONTRAST)];
    const update = () => setAsk(read());
    update();
    for (const list of lists) list.addEventListener("change", update);
    return () => {
      for (const list of lists) list.removeEventListener("change", update);
    };
  }, []);
  return ask;
}

/**
 * Whether the frames are drawn plain: the player chose simple frames, or the system asks for less
 * motion or more contrast. The system's ask is followed without the player having to say so.
 */
export function useSimpleFrames(chosen: boolean): boolean {
  const { reducedMotion, moreContrast } = useSystemAsk();
  return chosen || reducedMotion || moreContrast;
}
