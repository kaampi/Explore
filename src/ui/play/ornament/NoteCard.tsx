import type { HTMLAttributes } from "react";
import { useOrnament } from "./context";

/**
 * Something the player has found and can read. The text is on a smooth surface that keeps its own
 * colours, so that it reads the same in every theme.
 */
export function NoteCard({ className = "", ...rest }: HTMLAttributes<HTMLElement>) {
  const { set, level } = useOrnament("note");
  return (
    <div
      className={`orn-note ${className}`.trim()}
      data-orn-set={set}
      data-orn-level={level}
      {...rest}
    />
  );
}
