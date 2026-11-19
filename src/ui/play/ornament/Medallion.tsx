import type { HTMLAttributes } from "react";
import { useOrnament } from "./context";

/** The ring around a portrait. */
export function Medallion({ className = "", children, ...rest }: HTMLAttributes<HTMLElement>) {
  const { set, level } = useOrnament("medallion");
  return (
    <span
      className={`orn-medallion ${className}`.trim()}
      data-orn-set={set}
      data-orn-level={level}
      {...rest}
    >
      {children}
    </span>
  );
}
