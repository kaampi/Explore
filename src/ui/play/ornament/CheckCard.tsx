import type { HTMLAttributes } from "react";
import { useOrnament } from "./context";

/** The outcome of a roll. In some sets the number is in a seal; the words are always there too. */
export function CheckCard({
  roll,
  mark,
  className = "",
  children,
  ...rest
}: {
  roll: number;
  /** A small mark for the plain look, which has no seal. */
  mark?: string;
} & HTMLAttributes<HTMLElement>) {
  const { set, level } = useOrnament("check");
  return (
    <div
      className={`orn-check ${className}`.trim()}
      data-orn-set={set}
      data-orn-level={level}
      {...rest}
    >
      {set !== "plain" ? (
        <span className="orn-check__seal" aria-hidden="true">
          {roll}
        </span>
      ) : (
        mark && <span aria-hidden="true">{mark}</span>
      )}
      {children}
    </div>
  );
}
