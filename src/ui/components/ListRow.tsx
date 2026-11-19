import type { ReactNode } from "react";
import { useTranslate } from "../i18n/LanguageProvider";
import { MenuButton, useContextMenu, type MenuItem } from "./Menu";

/** What state a thing is in. The colours mean the same everywhere and are used for nothing else. */
export type RowStatus = { label: string; kind: "draft" | "playable" | "attention" };

/**
 * One row of a list: a picture or icon, a name, a line of description, up to two statuses and a "⋯"
 * button with the actions for that one thing. The same menu opens on a right click. The row and the
 * "⋯" are two buttons side by side, never one inside the other.
 */
export function ListRow({
  name,
  description,
  media,
  statuses = [],
  selected = false,
  onSelect,
  menu = [],
  variant = "row",
  compact = false,
}: {
  name: string;
  description?: string | undefined;
  /** A picture or an icon. Without one, the row is the compact height. */
  media?: ReactNode;
  statuses?: RowStatus[];
  selected?: boolean;
  onSelect: () => void;
  /** What can be done with this one thing. No rows, no "⋯". */
  menu?: readonly MenuItem[];
  /** "card" puts the picture above the name and the "⋯" in the top right corner. */
  variant?: "row" | "card";
  compact?: boolean;
}) {
  const t = useTranslate();
  const label = t("rowMoreOptions", { name });
  const hasMenu = menu.length > 0;
  const context = useContextMenu(label, menu);
  const classes = [
    "ui-row",
    selected ? "ui-row--selected" : "",
    variant === "card" ? "ui-row--card" : "",
    compact || (!media && variant === "row") ? "ui-row--compact" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <li className={classes} {...(hasMenu ? context.bind : {})}>
      <button
        type="button"
        className="ui-row__main"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
      >
        {media}
        <span className="ui-row__copy">
          <span className="ui-row__name" title={name}>
            {name}
          </span>
          {description ? (
            <span className="ui-row__desc" title={description}>
              {description}
            </span>
          ) : null}
        </span>
        {statuses.length > 0 && (
          <span className="ui-row__statuses">
            {statuses.slice(0, 2).map((status) => (
              <span key={status.label} className={`ui-row__status ui-row__status--${status.kind}`}>
                {status.label}
              </span>
            ))}
          </span>
        )}
      </button>
      {hasMenu && (
        <MenuButton bare className="ui-row__menu" label={label} items={menu} size="compact" />
      )}
      {hasMenu ? context.menu : null}
    </li>
  );
}
