import type { ReactNode } from "react";

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
  layout = "rows",
  columns = 1
}: {
  heading: string;
  items: { id: string; name: string; caption?: string; thumb?: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  newLabel: string;
  empty: string;
  actions?: ReactNode;
  secondaryAction?: ReactNode;
  filters?: ReactNode;
  layout?: "rows" | "portraits";
  columns?: 1 | 2;
}) {
  const portraits = layout === "portraits";
  const listClass = [
    "studio-list",
    portraits ? "studio-list--portraits" : "",
    columns === 2 ? "studio-list--cols-2" : ""
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
            <button type="button" className={portraits ? "setup-start" : "setup-text-btn"} onClick={onNew}>
              {newLabel}
            </button>
            {secondaryAction}
          </div>
        ) : (
          <button type="button" className={portraits ? "setup-start" : "setup-text-btn"} onClick={onNew}>
            {newLabel}
          </button>
        )}
      </div>
      {filters}
      {actions}
      {items.length === 0 && <p className="inspector-empty">{empty}</p>}
      <ul className="studio-list__items">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`studio-list__item ${selectedId === item.id ? "studio-list__item--active" : ""} ${item.thumb || portraits ? "studio-list__item--thumb" : ""}`}
              onClick={() => onSelect(item.id)}
            >
              {item.thumb ? (
                <img className="studio-list__thumb" src={item.thumb} alt="" />
              ) : portraits ? (
                <span className="studio-list__thumb studio-list__thumb--empty" aria-hidden="true" />
              ) : null}
              <span className="studio-list__copy">
                <span className="studio-list__name">{item.name}</span>
                {item.caption ? <span className="studio-list__caption">{item.caption}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
