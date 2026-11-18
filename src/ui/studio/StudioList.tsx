import type { ReactNode } from "react";
import { ListRow, type RowStatus } from "../components/ListRow";
import type { MenuItem } from "../components/Menu";

export function StudioList({
  heading,
  items,
  selectedId,
  onSelect,
  onNew,
  newLabel,
  empty,
  actions,
  secondaryAction,
  filters,
  renderPortrait,
  layout = "rows",
  columns = 1,
  itemMenu,
}: {
  heading: string;
  items: {
    id: string;
    name: string;
    caption?: string;
    thumb?: string;
    statuses?: RowStatus[];
  }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  newLabel: string;
  empty: string;
  actions?: ReactNode;
  secondaryAction?: ReactNode;
  filters?: ReactNode;
  renderPortrait?: (item: { id: string; thumb?: string }) => ReactNode;
  layout?: "rows" | "portraits";
  columns?: 1 | 2;
  /** What can be done with one thing in the list. Without it a row has no "⋯". */
  itemMenu?: (item: { id: string; name: string }) => MenuItem[];
}) {
  const portraits = layout === "portraits";
  // The new button is a plain button; when there is nothing yet it is the main one.
  const newClass = items.length === 0 ? "setup-start" : "studio-list__btn";
  const listClass = [
    "studio-list",
    portraits ? "studio-list--portraits" : "",
    columns === 2 ? "studio-list--cols-2" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <aside className={listClass}>
      <div className="studio-list__head">
        {portraits ? (
          <h2 className="studio-list__title">{heading}</h2>
        ) : (
          <p className="panel-heading">{heading}</p>
        )}
        {secondaryAction ? (
          <div className="studio-list__head-actions">
            <button type="button" className={newClass} onClick={onNew}>
              {newLabel}
            </button>
            {secondaryAction}
          </div>
        ) : (
          <button type="button" className={newClass} onClick={onNew}>
            {newLabel}
          </button>
        )}
      </div>
      {filters}
      {actions}
      {items.length === 0 && <p className="inspector-empty">{empty}</p>}
      <ul className="studio-list__items">
        {items.map((item) => (
          <ListRow
            key={item.id}
            name={item.name}
            description={item.caption}
            statuses={item.statuses ?? []}
            selected={selectedId === item.id}
            onSelect={() => onSelect(item.id)}
            menu={itemMenu?.(item) ?? []}
            variant={portraits ? "card" : "row"}
            media={
              renderPortrait ? (
                renderPortrait(item)
              ) : item.thumb ? (
                <img className="studio-list__thumb" src={item.thumb} alt="" />
              ) : portraits ? (
                <span className="studio-list__thumb studio-list__thumb--empty" aria-hidden="true" />
              ) : undefined
            }
          />
        ))}
      </ul>
    </aside>
  );
}
