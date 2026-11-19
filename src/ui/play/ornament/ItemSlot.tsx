import type { ButtonHTMLAttributes } from "react";
import { useOrnament } from "./context";

/** A compartment for a thing: on the place, carried, or in the pack. It is a real button. */
export function ItemSlot({
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { set, level } = useOrnament("slot");
  return (
    <button
      type={type}
      className={`orn-slot ${className}`.trim()}
      data-orn-set={set}
      data-orn-level={level}
      {...rest}
    />
  );
}
