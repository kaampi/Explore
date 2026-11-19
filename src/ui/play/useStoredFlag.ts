import { useState } from "react";

/** A yes-or-no choice that is kept in this browser. Without storage it still works for now. */
export function useStoredFlag(key: string, initial = false): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? initial : stored === "1";
    } catch {
      return initial;
    }
  });
  return [
    value,
    (next) => {
      setValue(next);
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* Storage can be unavailable; the choice then lasts until the page is closed. */
      }
    },
  ];
}
