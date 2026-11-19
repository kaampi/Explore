import type { ElementType, HTMLAttributes } from "react";
import { useOrnament } from "./context";

/**
 * A name on a sign: the place, a person, the heading of a panel. It is a real heading (or the
 * element it is given); the sign is only its look.
 */
export function NamePlate({
  as: Tag = "h2",
  className = "",
  ...rest
}: { as?: ElementType } & HTMLAttributes<HTMLElement>) {
  const { set, level } = useOrnament("namePlate");
  return (
    <Tag
      className={`orn-nameplate ${className}`.trim()}
      data-orn-set={set}
      data-orn-level={level}
      {...rest}
    />
  );
}
