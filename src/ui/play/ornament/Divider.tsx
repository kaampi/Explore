import type { HTMLAttributes } from "react";
import { useOrnament } from "./context";

/** A line between parts, with a mark in the middle in some sets, and a label if it has one. */
export function Divider({ className = "", children, ...rest }: HTMLAttributes<HTMLElement>) {
  const { set, level } = useOrnament("divider");
  return (
    <div
      className={`orn-divider ${className}`.trim()}
      data-orn-set={set}
      data-orn-level={level}
      {...rest}
    >
      {children}
      {set !== "plain" && <span className="orn-divider__mark" aria-hidden="true" />}
    </div>
  );
}
