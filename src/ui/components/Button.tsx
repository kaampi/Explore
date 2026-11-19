import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "idea";

type CommonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  size?: "normal" | "compact";
  /** The button is working: it shows a small spinner in place of the icon and keeps its width. */
  busy?: boolean;
  className?: string;
};

function classes(
  variant: ButtonVariant,
  size: "normal" | "compact" | undefined,
  filled: boolean | undefined,
  icon: boolean,
  extra: string | undefined,
) {
  return [
    "ui-button",
    `ui-button--${variant}`,
    size === "compact" ? "ui-button--compact" : "",
    icon ? "ui-button--icon" : "",
    filled && variant === "danger" ? "ui-button--filled" : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

const spinner = <span className="ui-button__spinner" aria-hidden="true" />;

/** A button of one of the five kinds. It is not disabled while busy by itself: the caller decides. */
export function Button({
  variant = "secondary",
  icon,
  busy,
  size,
  filled,
  className,
  type = "button",
  children,
  ...rest
}: CommonProps & {
  variant?: ButtonVariant;
  icon?: ReactNode;
  /** A danger button filled in red: only for the confirmation dialog. */
  filled?: boolean;
}) {
  return (
    <button
      {...rest}
      type={type}
      className={classes(variant, size, filled, false, className)}
      aria-busy={busy ? true : undefined}
    >
      {busy ? spinner : icon}
      {children}
    </button>
  );
}

/** A square button with only an icon. The label is required: it names the button and is the tooltip. */
export function IconButton({
  variant = "secondary",
  label,
  icon,
  busy,
  size,
  className,
  type = "button",
  ...rest
}: CommonProps & {
  variant?: "secondary" | "quiet";
  label: string;
  icon: ReactNode;
}) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={rest.title ?? label}
      className={classes(variant, size, false, true, className)}
      aria-busy={busy ? true : undefined}
    >
      {busy ? spinner : icon}
    </button>
  );
}
