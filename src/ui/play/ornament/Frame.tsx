import type { ElementType, HTMLAttributes } from "react";
import { useOrnament } from "./context";

/**
 * A panel that may have a frame: the scene picture, a person's card, the story, the scene column,
 * the pack, an info card. The frame is drawn over the panel by the stylesheet, so the content is
 * not touched. Without ornaments it is the same element, with no frame.
 */
export function Frame({
  as: Tag = "div",
  className = "",
  ...rest
}: { as?: ElementType } & HTMLAttributes<HTMLElement>) {
  const { set, level } = useOrnament("frame");
  return (
    <Tag
      className={`orn-frame ${className}`.trim()}
      data-orn-set={set}
      data-orn-level={level}
      {...rest}
    />
  );
}
