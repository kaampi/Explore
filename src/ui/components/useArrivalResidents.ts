import { useEffect, useRef } from "react";

/**
 * Starts the call that gives an empty place its residents once for each arrival. The function to
 * call is read from a ref, because the engine hands out a new one on every render; had the effect
 * depended on it, any action the player took while the model worked would have stopped the call
 * and started another. Only arriving somewhere else, or the place being settled, ends it.
 */
export function useArrivalResidents(
  placeId: string | undefined,
  wanted: boolean,
  populate: (signal: AbortSignal) => Promise<unknown>,
): void {
  const latest = useRef(populate);
  latest.current = populate;
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (!wanted || !placeId) return;
    if (started.current === placeId) return;
    started.current = placeId;
    const stop = new AbortController();
    void latest.current(stop.signal).catch(() => {});
    return () => {
      stop.abort();
      started.current = null;
    };
  }, [wanted, placeId]);
}
