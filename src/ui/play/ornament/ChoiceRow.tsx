import type { ButtonHTMLAttributes } from "react";
import { useOrnament } from "./context";

/** A choice under "What do you do?": a suggestion, or a row in the list of every choice. */
export function ChoiceRow({
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { set, level } = useOrnament("choice");
  return (
    <button
      type={type}
      className={`orn-choice ${className}`.trim()}
      data-orn-set={set}
      data-orn-level={level}
      {...rest}
    />
  );
}
